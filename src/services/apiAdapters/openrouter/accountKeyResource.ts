import { SITE_TYPES } from "~/constants/siteType"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import { UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS } from "~/services/accounts/runtimeKeyModelAccess"
import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import {
  defineAccountKeyResourceCapability,
  type AccountKeyResourcePage,
} from "~/services/apiAdapters/accountKeyResources/factory"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  type AccountKeyResourceFacts,
  type AccountKeyResourceOpenInput,
  type AccountKeyScope,
  type AccountKeyScopeInventory,
  type ResourceFailure,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import type { NativeResourceMutationResult } from "~/services/apiAdapters/nativeResources/factory"
import { createOpenRouterKeyPagination } from "~/services/apiAdapters/openrouter/keyPagination"
import {
  createOpenRouterKey,
  deleteOpenRouterKey,
  fetchOpenRouterDefaultWorkspace,
  fetchOpenRouterKey,
  fetchOpenRouterKeys,
  fetchOpenRouterWorkspaceMembers,
  fetchOpenRouterWorkspaces,
  updateOpenRouterKey,
  type OpenRouterKeyInfo,
  type OpenRouterWorkspace,
  type OpenRouterWorkspaceMember,
} from "~/services/apiService/openrouter"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  isAbortError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import { t } from "~/utils/i18n/core"

import {
  createOpenRouterKeyEditorSession,
  createOpenRouterKeyEditSession,
  toLimitMode,
  toLimitReset,
  type OpenRouterKeyDetail,
} from "./keyEditorSession"
import { OPENROUTER_KEY_FIELD_IDS } from "./keyResourceFields"

const PAGE_SIZE = 100
const MAX_PAGES = 100

// OpenRouter's Management API uses a Management Key for `/keys` and workspace
// inventory. It documents no later key reveal: plaintext is create-response-only,
// so post-dispatch mutations are reconciled once and never replayed.
// https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml

type OpenRouterKeyResourceConfig = {
  readonly account: AccountKeyResourceOpenInput["account"]
  readonly request: ApiServiceRequest
  readonly managementKey: string
  readonly defaultWorkspace: OpenRouterWorkspace
  readonly workspaceNames: Map<string, string>
  readonly pagination: ReturnType<typeof createOpenRouterKeyPagination>
}

type OpenRouterNativeFailure = {
  readonly error: unknown
  readonly secrets: readonly string[]
}

class OpenRouterNativeResourceError extends Error {
  constructor(readonly failure: OpenRouterNativeFailure) {
    super("openrouter_native_resource_failure")
    this.name = "OpenRouterNativeResourceError"
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const getStructuredStatus = (error: unknown): number | undefined => {
  if (error instanceof ApiError) return error.statusCode
  if (!isRecord(error)) return undefined
  const status = error.statusCode ?? error.status
  return typeof status === "number" && Number.isInteger(status)
    ? status
    : undefined
}

const getWorkspaceDisplayName = (workspace: OpenRouterWorkspace): string =>
  workspace.name.trim() || workspace.slug

const workspaceScope = (
  workspace: OpenRouterWorkspace,
  defaultWorkspaceId: string,
): AccountKeyScope => ({
  scopeKey: workspace.id,
  routeKey: workspace.slug,
  displayName: getWorkspaceDisplayName(workspace),
  isDefault: workspace.id === defaultWorkspaceId,
  ...(workspace.id === defaultWorkspaceId || workspace.slug === workspace.name
    ? {}
    : { secondaryLabel: workspace.slug }),
})

const nativeFailure = (
  error: unknown,
  config: Pick<OpenRouterKeyResourceConfig, "managementKey">,
  extraSecrets: readonly string[] = [],
): OpenRouterNativeResourceError =>
  new OpenRouterNativeResourceError({
    error,
    secrets: [config.managementKey, ...extraSecrets],
  })

const mapNativeFailure = (
  failure: OpenRouterNativeFailure,
): ResourceFailure => {
  const { error } = failure
  const status = getStructuredStatus(error)
  const code =
    isAbortError(error) || status === 499
      ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted
      : status === 401
        ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed
        : status === 403
          ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied
          : status === 404
            ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound
            : typeof status === "number" && status >= 500
              ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable
              : typeof status === "number" && status >= 400
                ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected
                : ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected
  const message = toSanitizedErrorSummary(error, [...failure.secrets]).trim()

  return {
    code,
    message: message || t("account:healthStatus.unknownError"),
    ...(error instanceof ApiError && error.upstreamCode
      ? { upstreamCode: error.upstreamCode }
      : {}),
  }
}

const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof OpenRouterNativeResourceError) {
    return mapNativeFailure(error.failure)
  }
  if (isRecord(error) && "error" in error && "secrets" in error) {
    return mapNativeFailure(error as OpenRouterNativeFailure)
  }
  return mapNativeFailure({ error, secrets: [] })
}

const read = async <T>(
  config: OpenRouterKeyResourceConfig,
  operation: () => Promise<T>,
  extraSecrets: readonly string[] = [],
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw nativeFailure(error, config, extraSecrets)
  }
}

const requestWithOptions = (
  config: OpenRouterKeyResourceConfig,
  options?: ResourceOperationOptions,
): ApiServiceRequest =>
  options?.signal
    ? { ...config.request, abortSignal: options.signal }
    : config.request

const isUnreconciledMutationFailure = (error: unknown): boolean => {
  const status = getStructuredStatus(error)
  return (
    isAbortError(error) || status === 408 || status === 429 || status === 499
  )
}

const isKnownRejection = (error: unknown): boolean => {
  const status = getStructuredStatus(error)
  return (
    !isUnreconciledMutationFailure(error) &&
    typeof status === "number" &&
    status >= 400 &&
    status < 500
  )
}

const mutationFailure = <T>(
  error: unknown,
  config: OpenRouterKeyResourceConfig,
  extraSecrets: readonly string[] = [],
): NativeResourceMutationResult<T, OpenRouterNativeFailure> => {
  const failure = { error, secrets: [config.managementKey, ...extraSecrets] }
  return isKnownRejection(error)
    ? { certainty: "not-applied", failure }
    : { certainty: "possibly-applied", failure }
}

// OpenRouter documents only the opaque `creator_user_id` on key responses; it
// does not provide a human-facing member name there. Project only a localized
// presence label and keep the identifier confined to the mutation projection.
const toCreatorDisplay = (creatorUserId: string | null): string =>
  creatorUserId
    ? t("keyManagement:openRouter.editor.options.creator.unknown")
    : t("keyManagement:openRouter.editor.options.creator.none")

const toDetail = (
  config: OpenRouterKeyResourceConfig,
  key: OpenRouterKeyInfo,
  scope?: AccountKeyScope,
): OpenRouterKeyDetail => ({
  key,
  workspaceDisplay:
    config.workspaceNames.get(key.workspace_id) ??
    scope?.displayName ??
    t("keyManagement:openRouter.editor.options.workspace.unknown"),
  creatorDisplay: toCreatorDisplay(key.creator_user_id),
})

const assertKeyScope = (
  key: OpenRouterKeyInfo,
  scope: AccountKeyScope,
): OpenRouterKeyInfo => {
  if (key.workspace_id !== scope.scopeKey) throw new Error("key_scope_mismatch")
  return key
}

const assertKeyCorrelation = (
  key: OpenRouterKeyInfo,
  scope: AccountKeyScope,
  hash: string,
): OpenRouterKeyInfo => {
  const scopedKey = assertKeyScope(key, scope)
  if (scopedKey.hash !== hash) throw new Error("key_locator_mismatch")
  return scopedKey
}

const toFacts = (
  detail: OpenRouterKeyDetail,
  ref: AccountKeyResourceFacts["ref"],
): AccountKeyResourceFacts => {
  const key = detail.key
  const expired = key.expires_at
    ? Date.parse(key.expires_at) <= Date.now()
    : false
  const status = expired ? "expired" : key.disabled ? "disabled" : "enabled"
  const field = OPENROUTER_KEY_FIELD_IDS
  return {
    ref,
    displayName: key.name,
    maskedLabel: key.label,
    status,
    runtimeKey: {
      modelAccess: UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS,
      createdAt: Date.parse(key.created_at),
    },
    fields: [
      { fieldId: field.Name, kind: "text", value: key.name },
      {
        fieldId: field.Workspace,
        kind: "text",
        value: detail.workspaceDisplay,
      },
      {
        fieldId: field.Creator,
        kind: "text",
        value: detail.creatorDisplay,
      },
      { fieldId: field.LimitMode, kind: "text", value: toLimitMode(key.limit) },
      ...(key.limit === null
        ? []
        : [
            { fieldId: field.Limit, kind: "number" as const, value: key.limit },
          ]),
      ...(key.limit_remaining === null
        ? []
        : [
            {
              fieldId: field.LimitRemaining,
              kind: "number" as const,
              value: key.limit_remaining,
            },
          ]),
      {
        fieldId: field.LimitReset,
        kind: "text",
        value: toLimitReset(key.limit_reset),
      },
      { fieldId: field.Disabled, kind: "boolean", value: key.disabled },
      {
        fieldId: field.IncludeByokInLimit,
        kind: "boolean",
        value: key.include_byok_in_limit,
      },
      { fieldId: field.Usage, kind: "number", value: key.usage },
      {
        fieldId: field.UsageDaily,
        kind: "number",
        value: key.usage_daily,
      },
      {
        fieldId: field.UsageWeekly,
        kind: "number",
        value: key.usage_weekly,
      },
      {
        fieldId: field.UsageMonthly,
        kind: "number",
        value: key.usage_monthly,
      },
      { fieldId: field.ByokUsage, kind: "number", value: key.byok_usage },
      {
        fieldId: field.ByokUsageDaily,
        kind: "number",
        value: key.byok_usage_daily,
      },
      {
        fieldId: field.ByokUsageWeekly,
        kind: "number",
        value: key.byok_usage_weekly,
      },
      {
        fieldId: field.ByokUsageMonthly,
        kind: "number",
        value: key.byok_usage_monthly,
      },
      { fieldId: field.CreatedAt, kind: "text", value: key.created_at },
      ...(key.updated_at
        ? [
            {
              fieldId: field.UpdatedAt,
              kind: "text" as const,
              value: key.updated_at,
            },
          ]
        : []),
      ...(key.expires_at
        ? [
            {
              fieldId: field.ExpiresAt,
              kind: "text" as const,
              value: key.expires_at,
            },
          ]
        : []),
    ],
    searchValues: [
      key.name,
      key.label,
      status,
      detail.workspaceDisplay,
      detail.creatorDisplay,
    ],
    actions: { canUpdate: true, canDelete: true },
  }
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

const drainMembers = async (
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

const loadWorkspaceScopeInventory = async (
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

/** OpenRouter native key resources use only the documented Management API fields. */
export const openRouterAccountKeyResources = defineAccountKeyResourceCapability(
  {
    siteType: SITE_TYPES.OPENROUTER,
    defaultCreation: "editor-defaults",
    // OpenRouter returns plaintext only from key creation; existing inventory
    // rows expose an opaque hash and masked key. Local profile associations are
    // the only supported historical recovery source.
    inventorySecretAvailability:
      INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
    openConfig: async (input, options) => {
      const request = input.request
      const managementKey = request.auth.accessToken?.trim() ?? ""
      let defaultWorkspace: OpenRouterWorkspace
      try {
        defaultWorkspace = await fetchOpenRouterDefaultWorkspace(
          options?.signal
            ? { ...request, abortSignal: options.signal }
            : request,
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
    },
    listScopes: async (config, options) =>
      (await loadWorkspaceScopeInventory(config, options)).scopes,
    listScopeInventory: loadWorkspaceScopeInventory,
    defaultScopeKey: (config) => config.defaultWorkspace.id,
    encodeLocator: (hash) => hash,
    decodeLocator: (resourceId) => resourceId,
    locatorFromListItem: (item: OpenRouterKeyDetail) => item.key.hash,
    locatorFromDetail: (detail: OpenRouterKeyDetail) => detail.key.hash,
    list: async (
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
    },
    get: (config, scope, hash, options) =>
      read(
        config,
        async () =>
          toDetail(
            config,
            assertKeyScope(
              await fetchOpenRouterKey(
                requestWithOptions(config, options),
                hash,
              ),
              scope,
            ),
            scope,
          ),
        [hash],
      ),
    toListFacts: (item, ref) => toFacts(item, ref),
    toDetailFacts: (detail, ref) => toFacts(detail, ref),
    createEditor: async (config, scope, options, scopeInventory, intent) => {
      const scopeEntries =
        scopeInventory?.scopes ??
        (await loadWorkspaceScopeInventory(config, options)).scopes
      return createOpenRouterKeyEditorSession({
        scope,
        scopeEntries,
        intent,
        loadMembers: (workspaceId, loadOptions) =>
          read(config, () => drainMembers(config, workspaceId, loadOptions), [
            workspaceId,
          ]),
      })
    },
    editEditor: (_config, scope, detail) =>
      createOpenRouterKeyEditSession(scope, detail),
    create: async (config, _scope, command, options) => {
      let created: Awaited<ReturnType<typeof createOpenRouterKey>>
      try {
        // OpenRouter only returns plaintext `key` in this POST response; do not retry a lost acknowledgement.
        created = await createOpenRouterKey(
          requestWithOptions(config, options),
          command.input,
        )
      } catch (error) {
        return mutationFailure(error, config)
      }

      const appliedScopeKey = created.key.workspace_id
      const appliedScope: AccountKeyScope =
        appliedScopeKey === command.destinationScope.scopeKey
          ? command.destinationScope
          : {
              ...command.destinationScope,
              scopeKey: appliedScopeKey,
              routeKey: appliedScopeKey,
              displayName:
                config.workspaceNames.get(appliedScopeKey) ??
                t("keyManagement:openRouter.editor.options.workspace.unknown"),
              isDefault: appliedScopeKey === config.defaultWorkspace.id,
            }
      const detail = toDetail(config, created.key, appliedScope)
      const ref = {
        accountId: config.account.id,
        siteType: SITE_TYPES.OPENROUTER,
        scopeKey: appliedScopeKey,
        resourceId: created.key.hash,
      }
      return {
        certainty: "applied" as const,
        value: {
          detail,
          scopeKey: appliedScopeKey,
          createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
            ref,
            displayName: created.key.name,
            secret: created.plaintextKey,
            credential: {
              accountName: config.account.name ?? "OpenRouter",
              apiType: API_TYPES.OPENAI_COMPATIBLE,
              baseUrl: OPENROUTER_API_BASE_URL,
              siteType: SITE_TYPES.OPENROUTER,
              tagIds: [],
            },
          }),
        },
      }
    },
    update: async (config, scope, detail, command, options) => {
      if (Object.keys(command.input).length === 0)
        return { certainty: "applied" as const, value: detail }
      try {
        return {
          certainty: "applied" as const,
          value: toDetail(
            config,
            assertKeyScope(
              await updateOpenRouterKey(
                requestWithOptions(config, options),
                detail.key.hash,
                command.input,
              ),
              scope,
            ),
            scope,
          ),
        }
      } catch (error) {
        if (isKnownRejection(error)) {
          return mutationFailure(error, config, [detail.key.hash])
        }
        if (isUnreconciledMutationFailure(error)) {
          return mutationFailure(error, config, [detail.key.hash])
        }
        try {
          const current = toDetail(
            config,
            assertKeyScope(
              await fetchOpenRouterKey(
                requestWithOptions(config, options),
                detail.key.hash,
              ),
              scope,
            ),
            scope,
          )
          const matches =
            (command.requested.name === undefined ||
              current.key.name === command.requested.name) &&
            (command.requested.disabled === undefined ||
              current.key.disabled === command.requested.disabled) &&
            (command.requested.limit === undefined ||
              current.key.limit === command.requested.limit) &&
            (command.requested.limitReset === undefined ||
              current.key.limit_reset === command.requested.limitReset) &&
            (command.requested.includeByokInLimit === undefined ||
              current.key.include_byok_in_limit ===
                command.requested.includeByokInLimit)
          return matches
            ? { certainty: "applied" as const, value: current }
            : mutationFailure(error, config, [detail.key.hash])
        } catch {
          return mutationFailure(error, config, [detail.key.hash])
        }
      }
    },
    delete: async (config, scope, hash, options) => {
      await read(
        config,
        async () =>
          assertKeyCorrelation(
            await fetchOpenRouterKey(requestWithOptions(config, options), hash),
            scope,
            hash,
          ),
        [hash],
      )
      try {
        await deleteOpenRouterKey(requestWithOptions(config, options), hash)
        return { certainty: "applied" as const, value: undefined }
      } catch (error) {
        if (isKnownRejection(error)) {
          return mutationFailure(error, config, [hash])
        }
        if (isUnreconciledMutationFailure(error)) {
          return mutationFailure(error, config, [hash])
        }
        try {
          await fetchOpenRouterKey(requestWithOptions(config, options), hash)
          return mutationFailure(error, config, [hash])
        } catch (readError) {
          if (getStructuredStatus(readError) === 404)
            return { certainty: "applied" as const, value: undefined }
          return mutationFailure(error, config, [hash])
        }
      }
    },
    mapFailure,
  },
)
