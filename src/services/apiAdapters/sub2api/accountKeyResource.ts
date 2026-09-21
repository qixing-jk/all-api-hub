import { SITE_TYPES } from "~/constants/siteType"
import {
  DEFAULT_AUTO_PROVISION_KEY_NAME,
  getDefaultAccountKeyName,
  isAutomaticAccountKeyName,
} from "~/services/accounts/accountKeyNames"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import {
  defineAccountKeyResourceCapability,
  type AccountKeyResourcePage,
} from "~/services/apiAdapters/accountKeyResources/factory"
import {
  mapAccountKeyResourceFailure,
  mapAccountKeyResourceUncertainFailure,
} from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_PROVISIONING_COVERAGE,
  ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS,
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS,
  type AccountKeyProvisionedResource,
  type AccountKeyProvisioningRequirement,
  type AccountKeyProvisioningSnapshot,
  type AccountKeyResourceFacts,
  type AccountKeyResourceOpenInput,
  type AccountKeyResourceRef,
  type AccountKeyScope,
  type AccountRuntimeKeyResolution,
  type ResourceFailure,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import type { NativeResourceMutationResult } from "~/services/apiAdapters/contracts/resourceNative"
import {
  mergeResourceEdits,
  resourceValuesEqual,
} from "~/services/apiAdapters/nativeResources/editableChanges"
import {
  isApiBusinessError,
  runNativeResourceMutation,
} from "~/services/apiAdapters/nativeResources/mutation"
import {
  createSub2ApiKey,
  deleteApiToken,
  fetchSub2ApiGroupDescriptors,
  fetchSub2ApiKey,
  fetchSub2ApiKeys,
  updateSub2ApiKey,
} from "~/services/apiService/sub2api"
import type {
  Sub2ApiCreateKeyPayload,
  Sub2ApiNativeKey,
  Sub2ApiUpdateKeyPayload,
} from "~/services/apiService/sub2api/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { maskSecretForDisplay, normalizeToMs } from "~/utils/core/formatters"

import {
  createSub2ApiKeyEditor,
  toSub2ApiKeyEditable,
  type Sub2ApiKeyEditorCommand,
} from "./keyResourceEditor"

const ACCOUNT_SCOPE_KEY = "account"

type Sub2ApiAccountKeyResourceConfig = {
  readonly account: AccountKeyResourceOpenInput["account"]
  readonly request: ApiServiceRequest
}

const requestWithOptions = (
  config: Sub2ApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): ApiServiceRequest =>
  options?.signal
    ? { ...config.request, abortSignal: options.signal }
    : config.request

const toPositiveSafeInteger = (value: unknown): number | null =>
  Number.isSafeInteger(value) && (value as number) > 0
    ? (value as number)
    : null

const requireTokenId = (value: unknown): number => {
  const tokenId = toPositiveSafeInteger(value)
  if (tokenId === null) throw new Error("invalid_token_id")
  return tokenId
}

const encodeTokenId = (tokenId: number): string =>
  String(requireTokenId(tokenId))

const decodeTokenId = (resourceId: string): number => {
  if (!/^[1-9]\d*$/.test(resourceId)) throw new Error("invalid_token_id")
  return requireTokenId(Number(resourceId))
}

const toCanonicalGroupKey = (value: unknown): string | null =>
  toPositiveSafeInteger(value)?.toString() ?? null

const decodeGroupRequirementKey = (requirementKey: string): number => {
  if (!/^[1-9]\d*$/.test(requirementKey)) {
    throw new Error("invalid_group_requirement")
  }
  const groupId = Number(requirementKey)
  if (!Number.isSafeInteger(groupId)) {
    throw new Error("invalid_group_requirement")
  }
  return groupId
}

const tokenStatus = (
  token: Sub2ApiNativeKey,
): AccountKeyResourceFacts["status"] => {
  const expiry = normalizeToMs(token.expires_at)
  if (
    token.expires_at != null &&
    token.expires_at !== "" &&
    (expiry === null || (expiry < 0 && token.expires_at !== -1))
  )
    return "unknown"
  if (expiry && expiry > 0 && expiry <= Date.now()) return "expired"
  if (token.status === "expired") return "expired"
  if (token.status === "active" || token.status === 1) return "enabled"
  if (
    token.status === "inactive" ||
    token.status === "quota_exhausted" ||
    token.status === 0 ||
    token.status === 2
  )
    return "disabled"
  return "unknown"
}

const tokenCoverage = (
  token: Sub2ApiNativeKey,
): (typeof ACCOUNT_KEY_PROVISIONING_COVERAGE)[keyof typeof ACCOUNT_KEY_PROVISIONING_COVERAGE] => {
  const status = tokenStatus(token)
  if (status === "enabled") return ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable
  if (status === "disabled" || status === "expired") {
    return ACCOUNT_KEY_PROVISIONING_COVERAGE.Unusable
  }
  return ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown
}

const createRef = (
  config: Sub2ApiAccountKeyResourceConfig,
  tokenId: number,
): AccountKeyResourceRef => ({
  accountId: config.account.id,
  siteType: SITE_TYPES.SUB2API,
  scopeKey: ACCOUNT_SCOPE_KEY,
  resourceId: encodeTokenId(tokenId),
})

const resolveAutoTemplateRenameTarget = (
  token: Sub2ApiNativeKey,
  groupDisplayName: string,
): string | null => {
  const currentName = token.name?.trim() || ""
  if (!isAutomaticAccountKeyName(currentName)) {
    return null
  }

  const targetDisplayName = getDefaultAccountKeyName(groupDisplayName)
  return currentName === targetDisplayName ? null : targetDisplayName
}

const loadRequirements = async (
  config: Sub2ApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
) => {
  const groups = await fetchSub2ApiGroupDescriptors(
    requestWithOptions(config, options),
  )
  const requirementByKey = new Map<string, AccountKeyProvisioningRequirement>()
  for (const group of groups) {
    const requirementKey = toCanonicalGroupKey(group.id)
    if (!requirementKey || requirementByKey.has(requirementKey)) {
      throw new Error("invalid_group_requirement")
    }
    requirementByKey.set(requirementKey, {
      requirementKey,
      displayName: group.displayName,
      provisioning: {
        kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
      },
    })
  }
  return {
    requirements: Array.from(requirementByKey.values()),
    requirementByKey,
  }
}

const inspectProvisioning = async (
  config: Sub2ApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<AccountKeyProvisioningSnapshot> => {
  const [{ requirements, requirementByKey }, tokens] = await Promise.all([
    loadRequirements(config, options),
    fetchSub2ApiKeys(requestWithOptions(config, options)),
  ])

  return {
    requirements,
    items: tokens.map((token) => {
      const groupKey = toCanonicalGroupKey(token.group_id)
      const groupName = token.group_name?.trim() || ""
      const requirement = groupKey ? requirementByKey.get(groupKey) : undefined
      const placement =
        groupKey && groupName && requirement
          ? {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
              requirementKeys: [groupKey],
            }
          : groupKey && groupName
            ? {
                kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned,
                placementKey: groupKey,
                displayName: groupName,
              }
            : !groupKey && !groupName
              ? { kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unmanaged }
              : { kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown }
      const renameTarget =
        requirement && groupName
          ? resolveAutoTemplateRenameTarget(token, requirement.displayName)
          : null

      return {
        ref: createRef(config, token.id),
        ...(placement.kind === ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned
          ? { displayName: token.name?.trim() || `Key ${token.id}` }
          : {}),
        placement,
        coverage: tokenCoverage(token),
        ...(renameTarget
          ? { renameSuggestion: { targetDisplayName: renameTarget } }
          : {}),
      }
    }),
  }
}

const provisionRequirement = async (
  config: Sub2ApiAccountKeyResourceConfig,
  requirementKey: string,
  options?: ResourceOperationOptions,
): Promise<
  NativeResourceMutationResult<AccountKeyProvisionedResource, ResourceFailure>
> => {
  const request = requestWithOptions(config, options)
  const groupId = decodeGroupRequirementKey(requirementKey)
  const groups = await fetchSub2ApiGroupDescriptors(request)
  if (!groups.some((group) => group.id === groupId)) {
    throw new Error("invalid_group_requirement")
  }

  const before = await fetchSub2ApiKeys(request)
  const beforeIds = new Set(before.map((token) => requireTokenId(token.id)))
  const createResult = await runNativeResourceMutation({
    request,
    execute: async (mutationRequest) =>
      await createSub2ApiKey(mutationRequest, {
        name: DEFAULT_AUTO_PROVISION_KEY_NAME,
        group_id: groupId,
        quota: 0,
      }),
    mapFailure,
    classifyError: (error) =>
      isApiBusinessError(error) ? "not-applied" : undefined,
  })
  if (createResult.certainty === "not-applied") return createResult
  const created =
    createResult.certainty === "applied" ? createResult.value : undefined
  const createdToken =
    created && typeof created === "object" ? created : undefined
  const createdId = toPositiveSafeInteger(createdToken?.id)
  if (
    createdToken &&
    createdId !== null &&
    !beforeIds.has(createdId) &&
    createdToken.group_id === groupId
  ) {
    return {
      certainty: "applied",
      value: { ref: createRef(config, createdId) },
    }
  }

  let reconciliationError: unknown
  try {
    const after = await fetchSub2ApiKeys(request)
    const newTokens = after.filter((token) => !beforeIds.has(token.id))
    const [newToken] = newTokens
    if (
      newToken &&
      newTokens.length === 1 &&
      newToken.group_id === groupId &&
      Boolean(newToken.group_name?.trim())
    ) {
      return {
        certainty: "applied",
        value: { ref: createRef(config, newToken.id) },
      }
    }
  } catch (error) {
    reconciliationError = error
    // Inventory failure cannot prove whether the mutation applied.
  }

  return {
    certainty: "possibly-applied",
    failure: mapAccountKeyResourceUncertainFailure(
      createResult.certainty === "possibly-applied"
        ? createResult.failure
        : reconciliationError,
    ),
  }
}

const renameProvisionedResource = async (
  config: Sub2ApiAccountKeyResourceConfig,
  ref: AccountKeyResourceRef,
  options?: ResourceOperationOptions,
): Promise<NativeResourceMutationResult<void, ResourceFailure>> => {
  const request = requestWithOptions(config, options)
  const tokenId = decodeTokenId(ref.resourceId)
  const current = await fetchSub2ApiKey(request, tokenId)
  if (current.id !== tokenId) {
    return {
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound },
    }
  }

  const groupKey = toCanonicalGroupKey(current.group_id)
  const groupName = current.group_name?.trim() || ""
  const { requirementByKey } = await loadRequirements(config, options)
  const requirement = groupKey ? requirementByKey.get(groupKey) : undefined
  if (!requirement || !groupName) {
    return {
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    }
  }
  const targetDisplayName = resolveAutoTemplateRenameTarget(
    current,
    requirement.displayName,
  )
  if (!targetDisplayName) {
    return {
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    }
  }

  const updateResult = await runNativeResourceMutation({
    request,
    execute: async (mutationRequest) =>
      await updateSub2ApiKey(mutationRequest, tokenId, {
        name: targetDisplayName,
      }),
    mapFailure,
    classifyError: (error) =>
      isApiBusinessError(error) ? "not-applied" : undefined,
  })
  if (updateResult.certainty === "not-applied") return updateResult

  try {
    const refreshed = await fetchSub2ApiKey(request, tokenId)
    return refreshed.id === tokenId &&
      refreshed.name.trim() === targetDisplayName
      ? { certainty: "applied", value: undefined }
      : {
          certainty: "possibly-applied",
          failure: mapAccountKeyResourceUncertainFailure(
            updateResult.certainty === "possibly-applied"
              ? updateResult.failure
              : undefined,
          ),
        }
  } catch (error) {
    return {
      certainty: "possibly-applied",
      failure: mapAccountKeyResourceUncertainFailure(
        updateResult.certainty === "possibly-applied"
          ? updateResult.failure
          : error,
      ),
    }
  }
}

const toFacts = (
  token: Sub2ApiNativeKey,
  ref: AccountKeyResourceFacts["ref"],
): AccountKeyResourceFacts => ({
  ref,
  displayName: token.name?.trim() || `Key ${token.id}`,
  maskedLabel: maskSecretForDisplay(token.key ?? ""),
  status: tokenStatus(token),
  runtimeKey: {
    modelAccess: {
      groups: token.group_name ? [token.group_name] : null,
      allowedModelIds: null,
      suggestedModelIds: [],
    },
    legacyTokenId: token.id,
    createdAt: normalizeToMs(token.created_at) ?? undefined,
  },
  fields: [
    { fieldId: "group", kind: "text", value: token.group_name?.trim() || "" },
    {
      fieldId: "unlimitedQuota",
      kind: "boolean",
      value: Number(token.quota) <= 0,
    },
    { fieldId: "quota", kind: "number", value: Number(token.quota) || 0 },
    {
      fieldId: "quota_used",
      kind: "number",
      value: Number(token.quota_used) || 0,
    },
    {
      fieldId: "remainingQuotaUsd",
      kind: "number",
      value:
        Math.max(0, Number(token.quota) - Number(token.quota_used ?? 0)) || 0,
    },
    {
      fieldId: "ip_whitelist",
      kind: "list",
      value: toSub2ApiKeyEditable(token).ip_whitelist,
    },
    {
      fieldId: "expires_at",
      kind: "text",
      value: toSub2ApiKeyEditable(token).expires_at,
    },
  ],
  searchValues: [
    String(token.id),
    token.name ?? "",
    maskSecretForDisplay(token.key ?? ""),
    token.group_name ?? "",
  ],
  actions: { canUpdate: true, canDelete: true },
})

const mapFailure = mapAccountKeyResourceFailure

/** Correlate native create responses or a unique new key without replaying writes. */
async function createNativeKey(
  config: Sub2ApiAccountKeyResourceConfig,
  payload: Sub2ApiCreateKeyPayload,
  options?: ResourceOperationOptions,
) {
  const request = requestWithOptions(config, options)
  const before = new Set((await fetchSub2ApiKeys(request)).map((key) => key.id))
  const matches = (key: Sub2ApiNativeKey) =>
    !before.has(key.id) &&
    key.name === payload.name &&
    (key.group_id ?? null) === (payload.group_id ?? null)
  const result = await runNativeResourceMutation({
    request,
    execute: (mutationRequest) => createSub2ApiKey(mutationRequest, payload),
    mapFailure,
    classifyError: (error) =>
      isApiBusinessError(error) ? "not-applied" : undefined,
  })
  if (result.certainty === "not-applied") return result
  if (result.certainty === "applied" && result.value && matches(result.value))
    return { certainty: "applied" as const, value: { detail: result.value } }
  try {
    const candidates = (await fetchSub2ApiKeys(request)).filter(matches)
    const [candidate] = candidates
    if (candidates.length === 1 && candidate)
      return { certainty: "applied" as const, value: { detail: candidate } }
  } catch (error) {
    return {
      certainty: "possibly-applied" as const,
      failure: mapAccountKeyResourceUncertainFailure(error),
    }
  }
  return {
    certainty: "possibly-applied" as const,
    failure: mapAccountKeyResourceUncertainFailure(
      result.certainty === "possibly-applied" ? result.failure : undefined,
    ),
  }
}

const resolveRuntimeKey = async (
  config: Sub2ApiAccountKeyResourceConfig,
  ref: AccountKeyResourceRef,
  options?: ResourceOperationOptions,
): Promise<AccountRuntimeKeyResolution> => {
  const request = requestWithOptions(config, options)
  const tokenId = decodeTokenId(ref.resourceId)
  try {
    const token = await fetchSub2ApiKey(request, tokenId)
    if (token.id !== tokenId || !hasUsableApiTokenKey(token.key ?? "")) {
      return {
        kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
        failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
      }
    }
    return {
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: token.key.trim(),
    }
  } catch (error) {
    return {
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: mapFailure(error),
    }
  }
}

/** Sub2API-native account key resources for one saved account. */
export const sub2ApiAccountKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.SUB2API,
  inventorySecretAvailability: INVENTORY_SECRET_AVAILABILITIES.Recoverable,
  defaultCreation: "select-requirement",
  openConfig: async (input) => ({
    account: input.account,
    request: input.request,
  }),
  listScopes: async (config): Promise<readonly AccountKeyScope[]> => [
    {
      scopeKey: ACCOUNT_SCOPE_KEY,
      routeKey: ACCOUNT_SCOPE_KEY,
      displayName: config.account.name?.trim() || config.request.baseUrl,
      isDefault: true,
    },
  ],
  provisioning: {
    inspect: inspectProvisioning,
    provision: provisionRequirement,
    rename: renameProvisionedResource,
  },
  runtimeKey: { resolve: resolveRuntimeKey },
  defaultScopeKey: () => ACCOUNT_SCOPE_KEY,
  encodeLocator: encodeTokenId,
  decodeLocator: decodeTokenId,
  locatorFromListItem: (item: Sub2ApiNativeKey) => requireTokenId(item.id),
  locatorFromDetail: (detail: Sub2ApiNativeKey) => requireTokenId(detail.id),
  list: async (
    config,
    _scope,
    _query,
    options,
  ): Promise<AccountKeyResourcePage<Sub2ApiNativeKey>> => {
    const items = await fetchSub2ApiKeys(requestWithOptions(config, options))
    return { items, total: items.length }
  },
  get: async (config, _scope, tokenId, options) => {
    return fetchSub2ApiKey(requestWithOptions(config, options), tokenId)
  },
  toListFacts: toFacts,
  toDetailFacts: toFacts,
  createEditor: async (config, _scope, options, _inventory, intent) =>
    createSub2ApiKeyEditor(
      config.request,
      undefined,
      intent,
      intent
        ? await fetchSub2ApiGroupDescriptors(
            requestWithOptions(config, options),
          )
        : undefined,
    ),
  editEditor: (config, _scope, detail) =>
    createSub2ApiKeyEditor(config.request, detail),
  create: async (config, _scope, command: Sub2ApiKeyEditorCommand, options) =>
    createNativeKey(config, command.create, options),
  update: async (
    config,
    _scope,
    detail,
    command: Sub2ApiKeyEditorCommand,
    options,
  ) => {
    const latest = toSub2ApiKeyEditable(detail)
    const merged = mergeResourceEdits(command.baseline, command.values, latest)
    if (!merged)
      return {
        certainty: "not-applied" as const,
        failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ResourceChanged },
      }
    const changed = Object.fromEntries(
      Object.entries(merged).filter(
        ([key, value]) =>
          !resourceValuesEqual(value, latest[key as keyof typeof latest]),
      ),
    ) as Partial<Sub2ApiUpdateKeyPayload>
    if (!Object.keys(changed).length)
      return { certainty: "applied" as const, value: detail }
    const request = requestWithOptions(config, options)
    const result = await runNativeResourceMutation({
      request,
      execute: (mutationRequest) =>
        updateSub2ApiKey(mutationRequest, detail.id, changed),
      mapFailure,
      classifyError: (error) =>
        isApiBusinessError(error) ? "not-applied" : undefined,
    })
    if (result.certainty === "not-applied") return result
    try {
      const updated = await fetchSub2ApiKey(request, detail.id)
      const actual = toSub2ApiKeyEditable(updated)
      if (
        Object.entries(changed).every(([key, value]) =>
          resourceValuesEqual(value, actual[key as keyof typeof actual]),
        )
      )
        return { certainty: "applied" as const, value: updated }
    } catch (error) {
      return {
        certainty: "possibly-applied" as const,
        failure: mapAccountKeyResourceUncertainFailure(error),
      }
    }
    return {
      certainty: "possibly-applied" as const,
      failure: mapAccountKeyResourceUncertainFailure(
        result.certainty === "possibly-applied" ? result.failure : undefined,
      ),
    }
  },
  delete: async (config, _scope, tokenId, options) => {
    const result = await runNativeResourceMutation({
      request: requestWithOptions(config, options),
      execute: async (mutationRequest) =>
        await deleteApiToken(mutationRequest, tokenId),
      mapFailure,
      classifyError: (error) =>
        isApiBusinessError(error) ? "not-applied" : undefined,
    })
    return result.certainty === "applied"
      ? result.value === false
        ? {
            certainty: "not-applied" as const,
            failure: {
              code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
            },
          }
        : { certainty: "applied" as const, value: undefined }
      : result
  },
  mapFailure,
})
