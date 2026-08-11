import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  buildGroupDefaultTokenRequest,
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
} from "~/services/accounts/defaultTokenLifecycle/requests"
import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
import {
  defineAccountKeyResourceCapability,
  type AccountKeyResourceEditorDefinition,
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
  ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES,
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
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_TYPES,
  type NativeResourceMutationResult,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  isApiBusinessError,
  runNativeResourceMutation,
} from "~/services/apiAdapters/nativeResources/mutation"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ApiToken } from "~/types"

import { tokenGroupFollowsAccount } from "./keyManagement"
import {
  resolveNewApiFamilyTokenTransport,
  type NewApiFamilyTokenTransport,
} from "./tokenTransport"

const ACCOUNT_SCOPE_KEY = "account"
const TOKEN_NAME_FIELD_ID = "name"
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
  token: ApiToken,
  group: string,
): string | null => {
  if (!group) return null
  const currentName = token.name.trim()
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
  const tokens = await collectCompleteTokens(config, options)
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
  const before = await collectCompleteTokens(config, options)
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

  let after: ApiToken[]
  try {
    after = await collectCompleteTokens(config, options)
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
  let token: ApiToken | undefined
  try {
    token = (await collectCompleteTokens(config, options)).find(
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
  token: ApiToken,
  ref: AccountKeyResourceFacts["ref"],
): AccountKeyResourceFacts => ({
  ref,
  displayName: token.name?.trim() || `Token ${token.id}`,
  maskedLabel: token.key?.trim() || "••••",
  status: tokenStatus(token),
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
  ],
  searchValues: [
    String(token.id),
    token.name ?? "",
    token.key ?? "",
    token.group ?? "",
  ],
  actions: { canUpdate: true, canDelete: true },
})

const collectCompleteTokens = async (
  config: NewApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<ApiToken[]> =>
  config.transport.fetchAccountTokens(requestWithOptions(config, options))

const unsupportedCreateEditor =
  (): AccountKeyResourceEditorDefinition<never> => {
    throw new Error("account_key_resource_editor_not_implemented")
  }

type RenameTokenCommand = { readonly name: string }

const validateTokenName = (
  values: Record<string, unknown>,
): ResourceValidationResult => {
  const name = values[TOKEN_NAME_FIELD_ID]
  return typeof name === "string" && name.trim().length > 0
    ? { valid: true }
    : {
        valid: false,
        issues: [
          {
            fieldId: TOKEN_NAME_FIELD_ID,
            code: ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES.Required,
          },
        ],
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
  config: NewApiAccountKeyResourceConfig,
  ref: AccountKeyResourceRef,
  options?: ResourceOperationOptions,
): Promise<NativeResourceMutationResult<void, ResourceFailure>> => {
  const tokenId = decodeTokenId(ref.resourceId)
  const current = (await collectCompleteTokens(config, options)).find(
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
    const refreshed = (await collectCompleteTokens(config, options)).find(
      (token) => token.id === tokenId,
    )
    return refreshed?.name.trim() === targetDisplayName
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

/** Creates the New API-family native account-token resource capability. */
export const createNewApiAccountKeyResources = (siteType: AccountSiteType) =>
  defineAccountKeyResourceCapability({
    siteType,
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
    locatorFromListItem: (item: ApiToken) => requireTokenId(item.id),
    locatorFromDetail: (detail: ApiToken) => requireTokenId(detail.id),
    list: async (
      config,
      _scope,
      _query,
      options,
    ): Promise<AccountKeyResourcePage<ApiToken>> => {
      const items = await collectCompleteTokens(config, options)
      return { items, total: items.length }
    },
    get: async (config, _scope, tokenId, options) => {
      const token = (await collectCompleteTokens(config, options)).find(
        (candidate) => candidate.id === tokenId,
      )
      if (!token) throw new Error("token_not_found")
      return token
    },
    toListFacts: toFacts,
    toDetailFacts: toFacts,
    createEditor: async () => unsupportedCreateEditor(),
    editEditor: (_config, _scope, detail) => ({
      fields: [
        {
          fieldId: TOKEN_NAME_FIELD_ID,
          type: RESOURCE_FIELD_TYPES.Text,
          required: true,
        },
      ],
      initialValues: { [TOKEN_NAME_FIELD_ID]: detail.name },
      validate: validateTokenName,
      buildCommand: (values): RenameTokenCommand => ({
        name: (values[TOKEN_NAME_FIELD_ID] as string).trim(),
      }),
    }),
    create: async () => {
      throw new Error("account_key_resource_create_not_implemented")
    },
    update: async (
      config,
      _scope,
      detail,
      command: RenameTokenCommand,
      options,
    ) => {
      const updateResult = await runNativeResourceMutation({
        request: requestWithOptions(config, options),
        execute: async (request) =>
          await config.transport.updateApiToken(
            request,
            detail.id,
            toTokenUpdateRequest(detail, command.name),
          ),
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
        const updated = (await collectCompleteTokens(config, options)).find(
          (token) => token.id === detail.id,
        )
        return updated?.name === command.name
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
