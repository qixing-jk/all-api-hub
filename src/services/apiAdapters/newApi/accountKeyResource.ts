import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  buildGroupDefaultTokenRequest,
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
} from "~/services/accounts/defaultTokenLifecycle/requests"
import { validateApiTokenInventory } from "~/services/accountTokens/apiTokenKey"
import { projectTokenCreatedAt } from "~/services/accountTokens/tokenCreatedAt"
import { projectLegacyTokenModelAccess } from "~/services/accountTokens/tokenModelAccess"
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
  ACCOUNT_KEY_PROVISIONING_UNKNOWN_PLACEMENT_REASONS,
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
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/keyManagement"
import type { NativeResourceMutationResult } from "~/services/apiAdapters/contracts/resourceNative"
import {
  mergeResourceEdits,
  resourceValuesEqual,
} from "~/services/apiAdapters/nativeResources/editableChanges"
import {
  isApiBusinessError,
  runNativeResourceMutation,
} from "~/services/apiAdapters/nativeResources/mutation"
import type {
  NewApiToken,
  NewApiTokenWrite,
} from "~/services/apiService/newApiFamily/tokenTypes"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { maskSecretForDisplay } from "~/utils/core/formatters"

import { tokenGroupFollowsAccount } from "./keyManagement"
import {
  createNewApiKeyEditor,
  toNewApiTokenWrite,
  type NewApiKeyEditCommand,
} from "./keyResourceEditor"
import {
  resolveNewApiFamilyTokenTransport,
  type NewApiFamilyTokenTransport,
} from "./tokenTransport"

const ACCOUNT_SCOPE_KEY = "account"
const ONE_API_SINGLETON_REQUIREMENT_KEY = "new-api-family:account-singleton"
const GROUP_REQUIREMENT_PREFIX = "new-api-family:group:"
const AUTO_GROUP_TOKEN_NAME_PATTERN = /^(.+) group \(auto\)$/

type NewApiAccountKeyResourceConfig = {
  readonly account: AccountKeyResourceOpenInput["account"]
  readonly request: ApiServiceRequest
  readonly transport: NewApiFamilyTokenTransport
}

const requestWithOptions = (
  config: NewApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): ApiServiceRequest =>
  options?.signal
    ? { ...config.request, abortSignal: options.signal }
    : config.request

const loadInheritedAccountGroup = async (
  config: NewApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<string | null> => {
  try {
    return await config.transport.fetchCurrentUserGroup(
      requestWithOptions(config, options),
    )
  } catch {
    // Compatible forks may not expose the current user group. Keep the
    // placement unknown so reconciliation remains fail-closed.
    return null
  }
}

const requireTokenId = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error("invalid_token_id")
  }
  return value as number
}

const encodeTokenId = (tokenId: number): string =>
  String(requireTokenId(tokenId))

const decodeTokenId = (resourceId: string): number => {
  if (!/^[1-9]\d*$/.test(resourceId)) throw new Error("invalid_token_id")
  return requireTokenId(Number(resourceId))
}

const tokenStatus = (token: NewApiToken): AccountKeyResourceFacts["status"] => {
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
  token: NewApiToken,
): (typeof ACCOUNT_KEY_PROVISIONING_COVERAGE)[keyof typeof ACCOUNT_KEY_PROVISIONING_COVERAGE] => {
  const status = tokenStatus(token)
  if (status === "enabled") return ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable
  if (status === "disabled" || status === "expired") {
    return ACCOUNT_KEY_PROVISIONING_COVERAGE.Unusable
  }
  return ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown
}

const encodeGroupRequirementKey = (group: string): string =>
  `${GROUP_REQUIREMENT_PREFIX}${encodeURIComponent(group)}`

const createRef = (
  config: NewApiAccountKeyResourceConfig,
  tokenId: number,
): AccountKeyResourceRef => ({
  accountId: config.account.id,
  siteType: config.account.siteType,
  scopeKey: ACCOUNT_SCOPE_KEY,
  resourceId: encodeTokenId(tokenId),
})

const resolveAutoTemplateRenameTarget = (
  token: NewApiToken,
  group: string,
): string | null => {
  if (!group) return null
  const currentName = token.name?.trim() || ""
  if (
    currentName !== DEFAULT_AUTO_PROVISION_TOKEN_NAME &&
    !AUTO_GROUP_TOKEN_NAME_PATTERN.test(currentName)
  ) {
    return null
  }

  const targetDisplayName = buildGroupDefaultTokenRequest(group).name
  return currentName === targetDisplayName ? null : targetDisplayName
}

const loadRequirements = async (
  config: NewApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<readonly AccountKeyProvisioningRequirement[]> => {
  if (config.account.siteType === SITE_TYPES.ONE_API) {
    return [
      {
        requirementKey: ONE_API_SINGLETON_REQUIREMENT_KEY,
        displayName: config.account.name?.trim() || config.request.baseUrl,
        provisioning: {
          kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
        },
      },
    ]
  }

  const groups = await config.transport.fetchUserGroups(
    requestWithOptions(config, options),
  )
  const normalizedGroups = Object.keys(groups)
    .map((group) => group.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
  if (new Set(normalizedGroups).size !== normalizedGroups.length) {
    throw new Error("duplicate_group_requirement")
  }
  return normalizedGroups.map((group) => ({
    requirementKey: encodeGroupRequirementKey(group),
    displayName: group,
    provisioning: {
      kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
    },
  }))
}

const resolveRequirementGroup = async (
  config: NewApiAccountKeyResourceConfig,
  requirementKey: string,
  options?: ResourceOperationOptions,
): Promise<string> => {
  const requirement = (await loadRequirements(config, options)).find(
    (candidate) => candidate.requirementKey === requirementKey,
  )
  if (!requirement) throw new Error("invalid_requirement_key")
  if (config.account.siteType === SITE_TYPES.ONE_API) return ""
  if (!requirementKey.startsWith(GROUP_REQUIREMENT_PREFIX)) {
    throw new Error("invalid_requirement_key")
  }
  try {
    const group = decodeURIComponent(
      requirementKey.slice(GROUP_REQUIREMENT_PREFIX.length),
    )
    if (!group || encodeGroupRequirementKey(group) !== requirementKey) {
      throw new Error("invalid_requirement_key")
    }
    return group
  } catch {
    throw new Error("invalid_requirement_key")
  }
}

const inspectProvisioning = async (
  config: NewApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<AccountKeyProvisioningSnapshot> => {
  const tokens = await collectValidatedInventoryTokens(config, options)
  const requirements = await loadRequirements(config, options)
  const followsAccountGroup = tokenGroupFollowsAccount(config.account.siteType)
  const hasInheritedGroupToken =
    followsAccountGroup && tokens.some((token) => !token.group?.trim())
  let currentUserGroup: string | null = null
  if (hasInheritedGroupToken) {
    currentUserGroup = await loadInheritedAccountGroup(config, options)
  }
  const requirementByName = new Map(
    requirements.map((requirement) => [
      requirement.displayName,
      requirement.requirementKey,
    ]),
  )

  return {
    requirements,
    items: tokens.map((token) => {
      const group = token.group?.trim() || ""
      const effectiveGroup = group || currentUserGroup || ""
      const requirementKey = requirementByName.get(effectiveGroup)
      const placement =
        config.account.siteType === SITE_TYPES.ONE_API
          ? {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
              requirementKeys: [ONE_API_SINGLETON_REQUIREMENT_KEY],
            }
          : requirementKey
            ? {
                kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
                requirementKeys: [requirementKey],
              }
            : group
              ? {
                  kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned,
                  placementKey: encodeGroupRequirementKey(group),
                  displayName: group,
                }
              : followsAccountGroup
                ? {
                    kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown,
                    reasonCode:
                      ACCOUNT_KEY_PROVISIONING_UNKNOWN_PLACEMENT_REASONS.InheritedAccountGroupUnavailable,
                  }
                : { kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown }
      const renameTarget = requirementKey
        ? resolveAutoTemplateRenameTarget(token, effectiveGroup)
        : null

      return {
        ref: createRef(config, token.id),
        ...(placement.kind === ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned
          ? { displayName: token.name?.trim() || `Token ${token.id}` }
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
  config: NewApiAccountKeyResourceConfig,
  requirementKey: string,
  options?: ResourceOperationOptions,
): Promise<
  NativeResourceMutationResult<AccountKeyProvisionedResource, ResourceFailure>
> => {
  const before = await collectValidatedInventoryTokens(config, options)
  const group = await resolveRequirementGroup(config, requirementKey, options)
  const beforeIds = new Set(before.map((token) => token.id))

  const createResult = await runNativeResourceMutation({
    request: requestWithOptions(config, options),
    execute: async (request) =>
      await config.transport.createApiToken(
        request,
        buildGroupDefaultTokenRequest(group),
      ),
    mapFailure,
    classifyError: (error) =>
      isApiBusinessError(error) ? "not-applied" : undefined,
  })
  if (createResult.certainty === "not-applied") {
    return createResult
  }
  if (createResult.certainty === "applied" && createResult.value === false) {
    return {
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected },
    }
  }

  let after: NewApiToken[]
  try {
    after = await collectValidatedInventoryTokens(config, options)
  } catch (error) {
    return {
      certainty: "possibly-applied",
      failure: mapAccountKeyResourceUncertainFailure(
        createResult.certainty === "possibly-applied"
          ? createResult.failure
          : error,
      ),
    }
  }

  const created = after.filter((token) => !beforeIds.has(token.id))
  if (created.length !== 1) {
    return {
      certainty: "possibly-applied",
      failure: mapAccountKeyResourceUncertainFailure(
        createResult.certainty === "possibly-applied"
          ? createResult.failure
          : undefined,
      ),
    }
  }
  const createdToken = created[0]
  const placementMatches =
    config.account.siteType === SITE_TYPES.ONE_API
      ? requirementKey === ONE_API_SINGLETON_REQUIREMENT_KEY
      : encodeGroupRequirementKey(createdToken.group?.trim() || "") ===
        requirementKey
  if (!placementMatches) {
    return {
      certainty: "possibly-applied",
      failure: mapAccountKeyResourceUncertainFailure(
        createResult.certainty === "possibly-applied"
          ? createResult.failure
          : undefined,
      ),
    }
  }

  return {
    certainty: "applied",
    value: { ref: createRef(config, createdToken.id) },
  }
}

const resolveRuntimeKey = async (
  config: NewApiAccountKeyResourceConfig,
  ref: AccountKeyResourceRef,
  options?: ResourceOperationOptions,
): Promise<AccountRuntimeKeyResolution> => {
  const tokenId = decodeTokenId(ref.resourceId)
  let token: NewApiToken | undefined
  try {
    token = (await collectValidatedInventoryTokens(config, options)).find(
      (candidate) => candidate.id === tokenId,
    )
  } catch (error) {
    return {
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: mapFailure(error),
    }
  }
  if (!token) {
    return {
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound },
    }
  }

  try {
    const secret = await config.transport.resolveApiTokenKey(
      requestWithOptions(config, options),
      token,
    )
    return {
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret,
    }
  } catch (error) {
    return {
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: mapFailure(error),
    }
  }
}

const toFacts = (
  token: NewApiToken,
  ref: AccountKeyResourceFacts["ref"],
): AccountKeyResourceFacts => ({
  ref,
  displayName: token.name?.trim() || `Token ${token.id}`,
  maskedLabel: maskSecretForDisplay(token.key ?? ""),
  status: tokenStatus(token),
  runtimeKey: {
    modelAccess: projectLegacyTokenModelAccess(token),
    legacyTokenId: token.id,
    createdAt: projectTokenCreatedAt(token),
    notes: token.note,
  },
  fields: [
    { fieldId: "group", kind: "text", value: token.group?.trim() || "" },
    {
      fieldId: "unlimitedQuota",
      kind: "boolean",
      value: token.unlimited_quota,
    },
    {
      fieldId: "remainingQuota",
      kind: "number",
      value: token.remain_quota,
    },
    { fieldId: "usedQuota", kind: "number", value: token.used_quota },
    { fieldId: "expired_time", kind: "number", value: token.expired_time },
    ...(Number.isFinite(token.accessed_time) && token.accessed_time > 0
      ? [
          {
            fieldId: "accessed_time",
            kind: "number" as const,
            value: token.accessed_time,
          },
        ]
      : []),
    {
      fieldId: "models",
      kind: "list",
      value: projectLegacyTokenModelAccess(token).allowedModelIds ?? [],
    },
    { fieldId: "allow_ips", kind: "text", value: token.allow_ips ?? "" },
  ],
  searchValues: [
    String(token.id),
    token.name ?? "",
    maskSecretForDisplay(token.key ?? ""),
    token.group ?? "",
  ],
  actions: { canUpdate: true, canDelete: true },
})

const collectValidatedInventoryTokens = async (
  config: NewApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<NewApiToken[]> =>
  validateApiTokenInventory(
    await config.transport.fetchAccountTokens(
      requestWithOptions(config, options),
    ),
  )

const toTokenUpdateRequest = (
  token: NewApiToken,
  name: string,
): NewApiTokenWrite => ({ ...toNewApiTokenWrite(token), name })

const renameProvisionedResource = async (
  config: NewApiAccountKeyResourceConfig,
  ref: AccountKeyResourceRef,
  options?: ResourceOperationOptions,
): Promise<NativeResourceMutationResult<void, ResourceFailure>> => {
  const tokenId = decodeTokenId(ref.resourceId)
  const current = (await collectValidatedInventoryTokens(config, options)).find(
    (token) => token.id === tokenId,
  )
  if (!current) {
    return {
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound },
    }
  }

  const explicitGroup = current.group?.trim() || ""
  const group =
    explicitGroup ||
    (tokenGroupFollowsAccount(config.account.siteType)
      ? await loadInheritedAccountGroup(config, options)
      : "") ||
    ""
  const requirements = await loadRequirements(config, options)
  if (!requirements.some((requirement) => requirement.displayName === group)) {
    return {
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    }
  }
  const targetDisplayName = resolveAutoTemplateRenameTarget(current, group)
  if (!targetDisplayName) {
    return {
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    }
  }

  const updateResult = await runNativeResourceMutation({
    request: requestWithOptions(config, options),
    execute: async (request) =>
      await config.transport.updateApiToken(
        request,
        current.id,
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
    const refreshed = (
      await collectValidatedInventoryTokens(config, options)
    ).find((token) => token.id === tokenId)
    return refreshed?.name?.trim() === targetDisplayName
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

const mapFailure = mapAccountKeyResourceFailure

/** Confirm the editable command, allowing absent fork fields to retain their defaults. */
const matchesNewApiTokenWrite = (
  token: NewApiToken,
  command: NewApiTokenWrite,
  allowQuotaConsumption = false,
) => {
  const actual = toNewApiTokenWrite(token)
  return (Object.keys(command) as (keyof NewApiTokenWrite)[]).every(
    (key) =>
      resourceValuesEqual(actual[key], command[key]) ||
      (key === "remain_quota" &&
        allowQuotaConsumption &&
        actual.remain_quota < command.remain_quota),
  )
}

/** Creates the New API-family native account-token resource capability. */
export const createNewApiAccountKeyResources = (siteType: AccountSiteType) =>
  defineAccountKeyResourceCapability({
    siteType,
    inventorySecretAvailability: INVENTORY_SECRET_AVAILABILITIES.Recoverable,
    openConfig: async (input) => ({
      account: input.account,
      request: input.request,
      transport: resolveNewApiFamilyTokenTransport(siteType),
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
    locatorFromListItem: (item: NewApiToken) => requireTokenId(item.id),
    locatorFromDetail: (detail: NewApiToken) => requireTokenId(detail.id),
    list: async (
      config,
      _scope,
      _query,
      options,
    ): Promise<AccountKeyResourcePage<NewApiToken>> => {
      const items = await collectValidatedInventoryTokens(config, options)
      return { items, total: items.length }
    },
    get: async (config, _scope, tokenId, options) => {
      const token = (
        await collectValidatedInventoryTokens(config, options)
      ).find((candidate) => candidate.id === tokenId)
      if (!token) throw new Error("token_not_found")
      return token
    },
    toListFacts: toFacts,
    toDetailFacts: toFacts,
    createEditor: async (config) =>
      createNewApiKeyEditor(siteType, config.request, config.transport),
    editEditor: (config, _scope, detail) =>
      createNewApiKeyEditor(siteType, config.request, config.transport, detail),
    create: async (config, _scope, command: NewApiKeyEditCommand, options) => {
      const before = await collectValidatedInventoryTokens(config, options)
      const beforeIds = new Set(before.map((token) => token.id))
      const result = await runNativeResourceMutation({
        request: requestWithOptions(config, options),
        execute: (request) =>
          config.transport.createApiToken(request, command.values),
        mapFailure,
        classifyError: (error) =>
          isApiBusinessError(error) ? "not-applied" : undefined,
      })
      if (result.certainty === "not-applied") return result
      if (result.certainty === "applied" && result.value === false) {
        return {
          certainty: "not-applied" as const,
          failure: {
            code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
          },
        }
      }
      try {
        const after = await collectValidatedInventoryTokens(config, options)
        const created = after.filter(
          (token) =>
            !beforeIds.has(token.id) &&
            matchesNewApiTokenWrite(token, command.values),
        )
        if (created.length === 1)
          return {
            certainty: "applied" as const,
            value: { detail: created[0] },
          }
      } catch (error) {
        return {
          certainty: "possibly-applied" as const,
          failure: mapAccountKeyResourceUncertainFailure(error),
        }
      }
      return {
        certainty: "possibly-applied" as const,
        failure: mapAccountKeyResourceUncertainFailure(),
      }
    },
    update: async (
      config,
      _scope,
      detail,
      command: NewApiKeyEditCommand,
      options,
    ) => {
      const latest = toNewApiTokenWrite(detail)
      const values = mergeResourceEdits(
        command.baseline,
        command.values,
        latest,
      )
      if (!values)
        return {
          certainty: "not-applied" as const,
          failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ResourceChanged },
        }
      if (latest.group === "auto" && values.group !== "auto") {
        if (values.cross_group_retry !== undefined)
          values.cross_group_retry = false
        if (values.auto_groups !== undefined) values.auto_groups = null
      }
      if (resourceValuesEqual(values, latest))
        return { certainty: "applied" as const, value: detail }
      const updateResult = await runNativeResourceMutation({
        request: requestWithOptions(config, options),
        execute: async (request) =>
          await config.transport.updateApiToken(request, detail.id, values),
        mapFailure,
        classifyError: (error) =>
          isApiBusinessError(error) ? "not-applied" : undefined,
      })
      if (updateResult.certainty === "not-applied") return updateResult
      if (
        updateResult.certainty === "applied" &&
        updateResult.value === false
      ) {
        return {
          certainty: "not-applied" as const,
          failure: {
            code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
          },
        }
      }
      try {
        const updated = (
          await collectValidatedInventoryTokens(config, options)
        ).find((token) => token.id === detail.id)
        // Quota can decrease between the write and this read. A lost response
        // still requires exact evidence when the user changed the quota itself.
        const allowQuotaConsumption =
          updateResult.certainty === "applied" ||
          values.remain_quota === latest.remain_quota
        return updated &&
          matchesNewApiTokenWrite(updated, values, allowQuotaConsumption)
          ? { certainty: "applied" as const, value: updated }
          : {
              certainty: "possibly-applied" as const,
              failure: mapAccountKeyResourceUncertainFailure(
                updateResult.certainty === "possibly-applied"
                  ? updateResult.failure
                  : undefined,
              ),
            }
      } catch (error) {
        return {
          certainty: "possibly-applied" as const,
          failure: mapAccountKeyResourceUncertainFailure(
            updateResult.certainty === "possibly-applied"
              ? updateResult.failure
              : error,
          ),
        }
      }
    },
    delete: async (config, _scope, tokenId, options) => {
      const result = await runNativeResourceMutation({
        request: requestWithOptions(config, options),
        execute: async (request) =>
          await config.transport.deleteApiToken(request, tokenId),
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
