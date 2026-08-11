import { SITE_TYPES } from "~/constants/siteType"
import {
  buildGroupDefaultTokenRequest,
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
} from "~/services/accounts/defaultTokenLifecycle/requests"
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
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_REASONS,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS,
  type AccountKeyProvisionedResource,
  type AccountKeyProvisioningSnapshot,
  type AccountKeyResourceFacts,
  type AccountKeyResourceOpenInput,
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
  deleteVoApiV2Token,
  fetchAllVoApiV2RawKeys,
  fetchVoApiV2KeyGroupDescriptors,
  renameVoApiV2Key,
  resolveVoApiV2KeySecretById,
} from "~/services/apiService/voapiV2"
import type { VoApiV2Key } from "~/services/apiService/voapiV2/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

const ACCOUNT_SCOPE_KEY = "account"
const AUTO_GROUP_TOKEN_NAME_PATTERN = /^(.+) group \(auto\)$/

type VoApiV2AccountKeyResourceConfig = {
  readonly account: AccountKeyResourceOpenInput["account"]
  readonly request: ApiServiceRequest
}

const requestWithOptions = (
  config: VoApiV2AccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): ApiServiceRequest =>
  options?.signal
    ? { ...config.request, abortSignal: options.signal }
    : config.request

const requireKeyId = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error("invalid_key_id")
  }
  return value as number
}

const encodeKeyId = (keyId: number): string => String(requireKeyId(keyId))

const decodeKeyId = (resourceId: string): number => {
  if (!/^[1-9]\d*$/.test(resourceId)) throw new Error("invalid_key_id")
  return requireKeyId(Number(resourceId))
}

const toCanonicalGroupKey = (value: unknown): string | null => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && String(parsed) === value ? value : null
}

const keyStatus = (key: VoApiV2Key): AccountKeyResourceFacts["status"] => {
  if (typeof key.enable !== "boolean") return "unknown"
  if (
    key.expireTime !== undefined &&
    (typeof key.expireTime !== "number" || !Number.isFinite(key.expireTime))
  ) {
    return "unknown"
  }
  if (typeof key.expireTime === "number" && key.expireTime > 0) {
    // VoAPI v2 deployments may return epoch seconds or milliseconds.
    const now =
      key.expireTime > 1_000_000_000_000
        ? Date.now()
        : Math.floor(Date.now() / 1000)
    if (key.expireTime <= now) return "expired"
  }
  return key.enable ? "enabled" : "disabled"
}

const keyCoverage = (
  key: VoApiV2Key,
): (typeof ACCOUNT_KEY_PROVISIONING_COVERAGE)[keyof typeof ACCOUNT_KEY_PROVISIONING_COVERAGE] => {
  const status = keyStatus(key)
  if (status === "enabled") return ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable
  if (status === "disabled" || status === "expired") {
    return ACCOUNT_KEY_PROVISIONING_COVERAGE.Unusable
  }
  return ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown
}

const createRef = (config: VoApiV2AccountKeyResourceConfig, keyId: number) => ({
  accountId: config.account.id,
  siteType: SITE_TYPES.VO_API_V2,
  scopeKey: ACCOUNT_SCOPE_KEY,
  resourceId: encodeKeyId(keyId),
})

const toFacts = (
  key: VoApiV2Key,
  ref: AccountKeyResourceFacts["ref"],
): AccountKeyResourceFacts => ({
  ref,
  displayName: key.name?.trim() || `Key ${key.id}`,
  maskedLabel: key.tokenMasked?.trim() || "••••",
  status: keyStatus(key),
  fields: [
    {
      fieldId: "groups",
      kind: "list",
      value: (key.groups ?? []).map(String),
    },
    {
      fieldId: "boundlessAmount",
      kind: "boolean",
      value: key.boundlessAmount === true,
    },
  ],
  searchValues: [
    String(key.id),
    key.name ?? "",
    key.tokenMasked ?? "",
    ...(key.groups ?? []).map(String),
  ],
  actions: { canUpdate: false, canDelete: true },
})

const mapFailure = mapAccountKeyResourceFailure

const inspectProvisioning = async (
  config: VoApiV2AccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<AccountKeyProvisioningSnapshot> => {
  const request = requestWithOptions(config, options)
  const [groups, keys] = await Promise.all([
    fetchVoApiV2KeyGroupDescriptors(request),
    fetchAllVoApiV2RawKeys(request),
  ])
  const requirementKeys = new Set(groups.map((group) => group.requirementKey))
  const groupByRequirementKey = new Map(
    groups.map((group) => [group.requirementKey, group] as const),
  )

  return {
    requirements: groups.map((group) => ({
      requirementKey: group.requirementKey,
      displayName: group.displayName,
      provisioning: {
        kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.InputRequired,
        reasonCode:
          ACCOUNT_KEY_REQUIREMENT_PROVISIONING_REASONS.FiniteQuotaRequired,
      },
    })),
    items: keys.map((key) => {
      const groupKeys: string[] = []
      const seenGroupKeys = new Set<string>()
      let validGroupIdentity =
        Array.isArray(key.groups) && key.groups.length > 0
      for (const group of key.groups ?? []) {
        const groupKey = toCanonicalGroupKey(group)
        if (!groupKey || seenGroupKeys.has(groupKey)) {
          validGroupIdentity = false
          break
        }
        seenGroupKeys.add(groupKey)
        groupKeys.push(groupKey)
      }
      const knownGroupKeys = groupKeys.filter((groupKey) =>
        requirementKeys.has(groupKey),
      )
      const unknownGroupKeys = groupKeys.filter(
        (groupKey) => !requirementKeys.has(groupKey),
      )
      const placement = !validGroupIdentity
        ? { kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown }
        : unknownGroupKeys.length === 0
          ? {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
              requirementKeys: knownGroupKeys,
            }
          : knownGroupKeys.length === 0
            ? {
                kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned,
                placementKey:
                  unknownGroupKeys.length === 1
                    ? unknownGroupKeys[0]
                    : JSON.stringify(unknownGroupKeys),
                displayName: unknownGroupKeys.join(", "),
              }
            : { kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown }
      const currentName = key.name?.trim() || ""
      const singleKnownGroup =
        knownGroupKeys.length === 1 && unknownGroupKeys.length === 0
          ? groupByRequirementKey.get(knownGroupKeys[0])
          : undefined
      const targetDisplayName = singleKnownGroup
        ? buildGroupDefaultTokenRequest(singleKnownGroup.displayName).name
        : ""
      const renameSuggested =
        targetDisplayName !== "" &&
        currentName !== targetDisplayName &&
        (currentName === DEFAULT_AUTO_PROVISION_TOKEN_NAME ||
          AUTO_GROUP_TOKEN_NAME_PATTERN.test(currentName))

      return {
        ref: createRef(config, key.id),
        ...(placement.kind === ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned
          ? { displayName: currentName || `Key ${key.id}` }
          : {}),
        placement,
        coverage: keyCoverage(key),
        ...(renameSuggested ? { renameSuggestion: { targetDisplayName } } : {}),
      }
    }),
  }
}

const resolveRuntimeKey = async (
  config: VoApiV2AccountKeyResourceConfig,
  ref: AccountKeyResourceFacts["ref"],
  options?: ResourceOperationOptions,
): Promise<AccountRuntimeKeyResolution> => {
  try {
    if (ref.scopeKey !== ACCOUNT_SCOPE_KEY) throw new Error("invalid_scope")
    const keyId = decodeKeyId(ref.resourceId)
    const key = (
      await fetchAllVoApiV2RawKeys(requestWithOptions(config, options))
    ).find((candidate) => candidate.id === keyId)
    if (!key) {
      return {
        kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
        failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound },
      }
    }
    return {
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: await resolveVoApiV2KeySecretById(
        requestWithOptions(config, options),
        key.id,
      ),
    }
  } catch (error) {
    return {
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: mapFailure(error),
    }
  }
}

const renameProvisionedResource = async (
  config: VoApiV2AccountKeyResourceConfig,
  ref: AccountKeyResourceFacts["ref"],
  options?: ResourceOperationOptions,
): Promise<NativeResourceMutationResult<void, ResourceFailure>> => {
  const request = requestWithOptions(config, options)
  const keyId = decodeKeyId(ref.resourceId)
  const [groups, keys] = await Promise.all([
    fetchVoApiV2KeyGroupDescriptors(request),
    fetchAllVoApiV2RawKeys(request),
  ])
  const key = keys.find((candidate) => candidate.id === keyId)
  if (!key) {
    return {
      certainty: "not-applied" as const,
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound },
    }
  }
  const groupKeys = (key.groups ?? []).map(toCanonicalGroupKey)
  if (
    groupKeys.length !== 1 ||
    !groupKeys[0] ||
    !groups.some((group) => group.requirementKey === groupKeys[0])
  ) {
    return {
      certainty: "not-applied" as const,
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    }
  }
  const group = groups.find(
    (candidate) => candidate.requirementKey === groupKeys[0],
  )!
  const currentName = key.name?.trim() || ""
  const targetDisplayName = buildGroupDefaultTokenRequest(
    group.displayName,
  ).name
  if (
    currentName === targetDisplayName ||
    (currentName !== DEFAULT_AUTO_PROVISION_TOKEN_NAME &&
      !AUTO_GROUP_TOKEN_NAME_PATTERN.test(currentName))
  ) {
    return {
      certainty: "not-applied" as const,
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    }
  }

  const renameResult = await runNativeResourceMutation({
    request,
    execute: async (mutationRequest) =>
      await renameVoApiV2Key(mutationRequest, keyId, targetDisplayName),
    mapFailure,
    classifyError: (error) =>
      isApiBusinessError(error) ? "not-applied" : undefined,
  })
  if (renameResult.certainty === "not-applied") return renameResult
  if (renameResult.certainty === "applied") {
    if (renameResult.value === false) {
      return {
        certainty: "not-applied" as const,
        failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected },
      }
    }
  }

  try {
    const refreshed = (await fetchAllVoApiV2RawKeys(request)).find(
      (candidate) => candidate.id === keyId,
    )
    return refreshed?.name?.trim() === targetDisplayName
      ? { certainty: "applied" as const, value: undefined }
      : {
          certainty: "possibly-applied" as const,
          failure: mapAccountKeyResourceUncertainFailure(
            renameResult.certainty === "possibly-applied"
              ? renameResult.failure
              : undefined,
          ),
        }
  } catch (error) {
    return {
      certainty: "possibly-applied" as const,
      failure: mapAccountKeyResourceUncertainFailure(
        renameResult.certainty === "possibly-applied"
          ? renameResult.failure
          : error,
      ),
    }
  }
}

const rejectProvisionWithoutFiniteQuotaInput = async (): Promise<
  NativeResourceMutationResult<AccountKeyProvisionedResource, ResourceFailure>
> => ({
  certainty: "not-applied",
  failure: {
    code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ConfigurationRequired,
  },
})

/** VoAPI v2-native account key resources for one saved account. */
export const voApiV2AccountKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.VO_API_V2,
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
    provision: rejectProvisionWithoutFiniteQuotaInput,
    rename: renameProvisionedResource,
  },
  runtimeKey: { resolve: resolveRuntimeKey },
  defaultScopeKey: () => ACCOUNT_SCOPE_KEY,
  encodeLocator: encodeKeyId,
  decodeLocator: decodeKeyId,
  locatorFromListItem: (item: VoApiV2Key) => requireKeyId(item.id),
  locatorFromDetail: (detail: VoApiV2Key) => requireKeyId(detail.id),
  list: async (
    config,
    _scope,
    _query,
    options,
  ): Promise<AccountKeyResourcePage<VoApiV2Key>> => {
    const items = await fetchAllVoApiV2RawKeys(
      requestWithOptions(config, options),
    )
    return { items, total: items.length }
  },
  get: async (config, _scope, keyId, options) => {
    const key = (
      await fetchAllVoApiV2RawKeys(requestWithOptions(config, options))
    ).find((candidate) => candidate.id === keyId)
    if (!key) throw new Error("key_not_found")
    return key
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
  delete: async (config, _scope, keyId, options) => {
    const result = await runNativeResourceMutation({
      request: requestWithOptions(config, options),
      execute: async (mutationRequest) =>
        await deleteVoApiV2Token(mutationRequest, keyId),
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
