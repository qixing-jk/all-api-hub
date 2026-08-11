import { SITE_TYPES } from "~/constants/siteType"
import {
  buildGroupDefaultTokenRequest,
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
  generateDefaultTokenRequest,
} from "~/services/accounts/defaultTokenLifecycle/requests"
import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
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
import type { NativeResourceMutationResult } from "~/services/apiAdapters/contracts/resourceNative"
import {
  isApiBusinessError,
  runNativeResourceMutation,
} from "~/services/apiAdapters/nativeResources/mutation"
import {
  createSub2ApiTokenForGroupId,
  deleteApiToken,
  fetchAccountTokens,
  fetchSub2ApiGroupDescriptors,
  fetchTokenById,
  resolveApiTokenKey,
  updateApiToken,
} from "~/services/apiService/sub2api"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ApiToken } from "~/types"

const ACCOUNT_SCOPE_KEY = "account"
const AUTO_GROUP_TOKEN_NAME_PATTERN = /^(.+) group \(auto\)$/

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

const tokenStatus = (token: ApiToken): AccountKeyResourceFacts["status"] => {
  if (token.expired_time !== -1) {
    if (!Number.isSafeInteger(token.expired_time) || token.expired_time < 0) {
      return "unknown"
    }
    if (token.expired_time <= Math.floor(Date.now() / 1000)) return "expired"
  }
  if (token.status === 1) return "enabled"
  if (token.status === 2) return "disabled"
  return "unknown"
}

const tokenCoverage = (
  token: ApiToken,
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
  token: ApiToken,
  groupDisplayName: string,
): string | null => {
  const currentName = token.name?.trim() || ""
  if (
    currentName !== DEFAULT_AUTO_PROVISION_TOKEN_NAME &&
    !AUTO_GROUP_TOKEN_NAME_PATTERN.test(currentName)
  ) {
    return null
  }

  const targetDisplayName = buildGroupDefaultTokenRequest(groupDisplayName).name
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
    fetchAccountTokens(requestWithOptions(config, options)),
  ])

  return {
    requirements,
    items: tokens.map((token) => {
      const groupKey = toCanonicalGroupKey(token.sub2api_group_id)
      const groupName = token.group?.trim() || ""
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

  const before = await fetchAccountTokens(request)
  const beforeIds = new Set(before.map((token) => requireTokenId(token.id)))
  const createResult = await runNativeResourceMutation({
    request,
    execute: async (mutationRequest) =>
      await createSub2ApiTokenForGroupId(
        mutationRequest,
        generateDefaultTokenRequest(),
        groupId,
      ),
    mapFailure,
    classifyError: (error) =>
      isApiBusinessError(error) ? "not-applied" : undefined,
  })
  if (createResult.certainty === "not-applied") return createResult
  if (createResult.certainty === "applied" && createResult.value === false) {
    return {
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected },
    }
  }
  const created =
    createResult.certainty === "applied" ? createResult.value : undefined
  const createdToken =
    created && typeof created === "object" ? created : undefined
  const createdId = toPositiveSafeInteger(createdToken?.id)
  if (
    createdToken &&
    createdId !== null &&
    !beforeIds.has(createdId) &&
    createdToken.sub2api_group_id === groupId
  ) {
    return {
      certainty: "applied",
      value: { ref: createRef(config, createdId) },
    }
  }

  let reconciliationError: unknown
  try {
    const after = await fetchAccountTokens(request)
    const newTokens = after.filter((token) => !beforeIds.has(token.id))
    if (
      newTokens.length === 1 &&
      newTokens[0].sub2api_group_id === groupId &&
      Boolean(newTokens[0].group?.trim())
    ) {
      return {
        certainty: "applied",
        value: { ref: createRef(config, newTokens[0].id) },
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

const toTokenUpdateRequest = (
  token: ApiToken,
  name: string,
): CreateTokenRequest => ({
  name,
  remain_quota: token.remain_quota,
  expired_time: token.expired_time,
  unlimited_quota: token.unlimited_quota,
  model_limits_enabled: token.model_limits_enabled ?? false,
  model_limits: token.model_limits ?? token.models ?? "",
  allow_ips: token.allow_ips ?? "",
  group: token.group ?? "",
})

const renameProvisionedResource = async (
  config: Sub2ApiAccountKeyResourceConfig,
  ref: AccountKeyResourceRef,
  options?: ResourceOperationOptions,
): Promise<NativeResourceMutationResult<void, ResourceFailure>> => {
  const request = requestWithOptions(config, options)
  const tokenId = decodeTokenId(ref.resourceId)
  const current = await fetchTokenById(request, tokenId)
  if (current.id !== tokenId) {
    return {
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound },
    }
  }

  const groupKey = toCanonicalGroupKey(current.sub2api_group_id)
  const groupName = current.group?.trim() || ""
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
      await updateApiToken(
        mutationRequest,
        tokenId,
        toTokenUpdateRequest(current, targetDisplayName),
      ),
    mapFailure,
    classifyError: (error) =>
      isApiBusinessError(error) ? "not-applied" : undefined,
  })
  if (updateResult.certainty === "not-applied") return updateResult
  if (updateResult.certainty === "applied") {
    if (updateResult.value === false) {
      return {
        certainty: "not-applied",
        failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected },
      }
    }
  }

  try {
    const refreshed = await fetchTokenById(request, tokenId)
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
  token: ApiToken,
  ref: AccountKeyResourceFacts["ref"],
): AccountKeyResourceFacts => ({
  ref,
  displayName: token.name?.trim() || `Key ${token.id}`,
  maskedLabel: token.key?.trim() || "••••",
  status: tokenStatus(token),
  fields: [
    { fieldId: "group", kind: "text", value: token.group?.trim() || "" },
    {
      fieldId: "unlimitedQuota",
      kind: "boolean",
      value: token.unlimited_quota,
    },
    { fieldId: "remainingQuota", kind: "number", value: token.remain_quota },
  ],
  searchValues: [
    String(token.id),
    token.name ?? "",
    token.key ?? "",
    token.group ?? "",
  ],
  actions: { canUpdate: false, canDelete: true },
})

const mapFailure = mapAccountKeyResourceFailure

const resolveRuntimeKey = async (
  config: Sub2ApiAccountKeyResourceConfig,
  ref: AccountKeyResourceRef,
  options?: ResourceOperationOptions,
): Promise<AccountRuntimeKeyResolution> => {
  const request = requestWithOptions(config, options)
  const tokenId = decodeTokenId(ref.resourceId)
  try {
    const token = await fetchTokenById(request, tokenId)
    if (token.id !== tokenId) {
      return {
        kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
        failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
      }
    }
    return {
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: await resolveApiTokenKey(request, token),
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
  locatorFromListItem: (item: ApiToken) => requireTokenId(item.id),
  locatorFromDetail: (detail: ApiToken) => requireTokenId(detail.id),
  list: async (
    config,
    _scope,
    _query,
    options,
  ): Promise<AccountKeyResourcePage<ApiToken>> => {
    const items = await fetchAccountTokens(requestWithOptions(config, options))
    return { items, total: items.length }
  },
  get: async (config, _scope, tokenId, options) => {
    const token = (
      await fetchAccountTokens(requestWithOptions(config, options))
    ).find((candidate) => candidate.id === tokenId)
    if (!token) throw new Error("token_not_found")
    return token
  },
  toListFacts: toFacts,
  toDetailFacts: toFacts,
  createEditor: async () => {
    throw new Error("account_key_resource_create_not_implemented")
  },
  editEditor: () => {
    throw new Error("account_key_resource_edit_not_implemented")
  },
  create: async () => {
    throw new Error("account_key_resource_create_not_implemented")
  },
  update: async () => {
    throw new Error("account_key_resource_update_not_implemented")
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
