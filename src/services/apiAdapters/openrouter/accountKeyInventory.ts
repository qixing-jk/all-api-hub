import type { AccountKeyResourcePage } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  type AccountKeyScope,
  type AccountKeyScopeInventory,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  getWorkspaceDisplayName,
  toDetail,
  workspaceScope,
} from "~/services/apiAdapters/openrouter/accountKeyDisplayFacts"
import {
  type OpenRouterAccountKeyDefinition,
  type OpenRouterKeyResourceConfig,
} from "~/services/apiAdapters/openrouter/accountKeyResourceConfig"
import {
  mapFailure,
  OpenRouterNativeResourceError,
  read,
  requestWithOptions,
} from "~/services/apiAdapters/openrouter/accountKeyRuntime"
import { type OpenRouterKeyDetail } from "~/services/apiAdapters/openrouter/keyEditorSession"
import { createOpenRouterKeyPagination } from "~/services/apiAdapters/openrouter/keyPagination"
import {
  fetchOpenRouterDefaultWorkspace,
  fetchOpenRouterKey,
  fetchOpenRouterKeys,
  fetchOpenRouterWorkspaceMembers,
  fetchOpenRouterWorkspaces,
  type OpenRouterKeyInfo,
  type OpenRouterWorkspace,
  type OpenRouterWorkspaceMember,
} from "~/services/apiService/openrouter"
import { isAbortError } from "~/services/verification/aiApiVerification/utils"

const PAGE_SIZE = 100

const MAX_PAGES = 100

export const assertKeyScope = (
  key: OpenRouterKeyInfo,
  scope: AccountKeyScope,
): OpenRouterKeyInfo => {
  if (key.workspace_id !== scope.scopeKey) throw new Error("key_scope_mismatch")
  return key
}

export const assertKeyCorrelation = (
  key: OpenRouterKeyInfo,
  scope: AccountKeyScope,
  hash: string,
): OpenRouterKeyInfo => {
  const scopedKey = assertKeyScope(key, scope)
  if (scopedKey.hash !== hash) throw new Error("key_locator_mismatch")
  return scopedKey
}

const areEquivalentProviderRecords = (
  left: unknown,
  right: unknown,
): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) =>
        areEquivalentProviderRecords(value, right[index]),
      )
    )
  }
  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null
  ) {
    return false
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightRecord, key) &&
        areEquivalentProviderRecords(leftRecord[key], rightRecord[key]),
    )
  )
}

const drainCountedPages = async <T extends { id: string }>(
  readPage: (offset: number) => Promise<{
    data: readonly T[]
    totalCount: number
  }>,
  validateItem: (item: T) => void,
  paginationLimitError: string,
): Promise<readonly T[]> => {
  const items = new Map<string, T>()
  let expectedTotal: number | undefined

  for (let offset = 0; offset < PAGE_SIZE * MAX_PAGES; offset += PAGE_SIZE) {
    const page = await readPage(offset)
    if (expectedTotal === undefined) expectedTotal = page.totalCount
    if (page.totalCount !== expectedTotal || page.data.length > PAGE_SIZE) {
      throw new Error("inconsistent_pagination")
    }
    for (const item of page.data) {
      validateItem(item)
      const existing = items.get(item.id)
      if (existing && !areEquivalentProviderRecords(existing, item)) {
        throw new Error("conflicting_identity")
      }
      if (!existing) items.set(item.id, item)
    }
    if (items.size > expectedTotal) throw new Error("inconsistent_pagination")
    if (items.size === expectedTotal) return [...items.values()]
    if (page.data.length < PAGE_SIZE) {
      throw new Error("incomplete_pagination")
    }
  }

  throw new Error(paginationLimitError)
}

const drainWorkspaces = async (
  config: OpenRouterKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<readonly OpenRouterWorkspace[]> => {
  const drained = await drainCountedPages(
    (offset) =>
      fetchOpenRouterWorkspaces(requestWithOptions(config, options), {
        offset,
        limit: PAGE_SIZE,
      }),
    () => undefined,
    "workspace_pagination_limit",
  )
  const workspaces = new Map(
    drained.map((workspace) => [workspace.id, workspace]),
  )
  const inventoriedDefault = workspaces.get(config.defaultWorkspace.id)
  if (
    inventoriedDefault &&
    !areEquivalentProviderRecords(inventoriedDefault, config.defaultWorkspace)
  ) {
    throw new Error("conflicting_default_workspace")
  }
  workspaces.set(config.defaultWorkspace.id, config.defaultWorkspace)
  const all = [...workspaces.values()]
  for (const workspace of all) {
    config.workspaceNames.set(workspace.id, getWorkspaceDisplayName(workspace))
  }
  return all
}

export const drainMembers = async (
  config: OpenRouterKeyResourceConfig,
  workspaceId: string,
  options?: ResourceOperationOptions,
): Promise<readonly OpenRouterWorkspaceMember[]> => {
  return drainCountedPages(
    (offset) =>
      fetchOpenRouterWorkspaceMembers(
        requestWithOptions(config, options),
        workspaceId,
        {
          offset,
          limit: PAGE_SIZE,
        },
      ),
    (member) => {
      if (member.workspace_id !== workspaceId)
        throw new Error("member_workspace_mismatch")
    },
    "member_pagination_limit",
  )
}

export const loadWorkspaceScopeInventory = async (
  config: OpenRouterKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<AccountKeyScopeInventory> => {
  try {
    const workspaces = await read(config, () =>
      drainWorkspaces(config, options),
    )
    return {
      scopes: workspaces
        .map((workspace) =>
          workspaceScope(workspace, config.defaultWorkspace.id),
        )
        .sort(
          (left, right) =>
            Number(right.isDefault) - Number(left.isDefault) ||
            left.displayName.localeCompare(right.displayName),
        ),
    }
  } catch (error) {
    if (
      error instanceof OpenRouterNativeResourceError &&
      !isAbortError(error.failure.error, options?.signal)
    ) {
      return {
        scopes: [
          workspaceScope(config.defaultWorkspace, config.defaultWorkspace.id),
        ],
        partialFailure: mapFailure(error),
      }
    }
    throw error
  }
}

export const openOpenRouterKeyResourceConfig: OpenRouterAccountKeyDefinition["openConfig"] =
  async (input, options) => {
    const request = input.request
    const managementKey = request.auth.accessToken?.trim() ?? ""
    let defaultWorkspace: OpenRouterWorkspace
    try {
      defaultWorkspace = await fetchOpenRouterDefaultWorkspace(
        options?.signal ? { ...request, abortSignal: options.signal } : request,
      )
    } catch (error) {
      throw new OpenRouterNativeResourceError({
        error,
        secrets: [managementKey],
      })
    }
    const config: OpenRouterKeyResourceConfig = {
      account: input.account,
      request,
      managementKey,
      // OpenRouter's hosted API resolves its provider-owned default workspace at
      // `/workspaces/default`; never guess a replacement from workspace inventory.
      defaultWorkspace,
      workspaceNames: new Map(),
      pagination: createOpenRouterKeyPagination(),
    }
    config.workspaceNames.set(
      config.defaultWorkspace.id,
      getWorkspaceDisplayName(config.defaultWorkspace),
    )
    return config
  }

export const listOpenRouterKeyResources: OpenRouterAccountKeyDefinition["list"] =
  async (
    config,
    scope,
    query,
    options,
  ): Promise<AccountKeyResourcePage<OpenRouterKeyDetail>> => {
    const page = await config.pagination.list(
      {
        scopeKey: scope.scopeKey,
        limit: query?.limit,
        cursor: query?.cursor,
      },
      (offset) =>
        read(
          config,
          () =>
            fetchOpenRouterKeys(requestWithOptions(config, options), {
              workspaceId: scope.scopeKey,
              includeDisabled: true,
              offset,
            }),
          [scope.scopeKey],
        ),
    )
    return {
      items: page.keys.map((key) => toDetail(config, key, scope)),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    }
  }

export const getOpenRouterKeyResource: OpenRouterAccountKeyDefinition["get"] = (
  config,
  scope,
  hash,
  options,
) =>
  read(
    config,
    async () =>
      toDetail(
        config,
        assertKeyScope(
          await fetchOpenRouterKey(requestWithOptions(config, options), hash),
          scope,
        ),
        scope,
      ),
    [hash],
  )
