import {
  getDefaultAccountKeyName,
  isAutomaticAccountKeyName,
} from "~/services/accounts/accountKeyNames"
import {
  mapAccountKeyResourceUncertainFailure,
  mapAccountKeyResourceFailure as mapFailure,
} from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  type AccountKeyProvisionedResource,
  type AccountKeyProvisioningRequirement,
  type AccountKeyProvisioningSnapshot,
  type AccountKeyResourceRef,
  type ResourceFailure,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { NativeResourceMutationResult } from "~/services/apiAdapters/contracts/resourceNative"
import {
  isApiBusinessError,
  runNativeResourceMutation,
} from "~/services/apiAdapters/nativeResources/mutation"
import { tokenCoverage } from "~/services/apiAdapters/newApi/accountKeyDisplayFacts"
import {
  createRef,
  decodeTokenId,
} from "~/services/apiAdapters/newApi/accountKeyIdentity"
import {
  collectValidatedInventoryTokens,
  loadInheritedAccountGroup,
  readEditableToken,
  requestWithOptions,
} from "~/services/apiAdapters/newApi/accountKeyInventory"
import { type NewApiAccountKeyResourceConfig } from "~/services/apiAdapters/newApi/accountKeyResourceConfig"
import {
  createNewApiKeyEditor,
  toNewApiTokenWrite,
  type NewApiTokenWriteBody,
} from "~/services/apiAdapters/newApi/keyResourceEditor"
import { type NewApiKeyVariant } from "~/services/apiAdapters/newApi/keyVariant"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"

const resolveAutoTemplateRenameTarget = (
  token: NewApiToken,
  group: string,
): string | null => {
  if (!group) return null
  const currentName = token.name?.trim() || ""
  if (!isAutomaticAccountKeyName(currentName)) {
    return null
  }

  const targetDisplayName = getDefaultAccountKeyName(group)
  return currentName === targetDisplayName ? null : targetDisplayName
}

const loadRequirements = (
  config: NewApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<readonly AccountKeyProvisioningRequirement[]> =>
  config.variant.group.loadRequirements(
    () => config.transport.fetchUserGroups(requestWithOptions(config, options)),
    config.account.name?.trim() || config.request.baseUrl,
  )

const resolveRequirementGroup = async (
  config: NewApiAccountKeyResourceConfig,
  requirementKey: string,
  options?: ResourceOperationOptions,
): Promise<string> =>
  config.variant.group.resolveRequirementGroup(
    await loadRequirements(config, options),
    requirementKey,
  )

export const inspectProvisioning = async (
  config: NewApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<AccountKeyProvisioningSnapshot> => {
  const tokens = await collectValidatedInventoryTokens(config, options)
  const requirements = await loadRequirements(config, options)
  const followsAccountGroup = config.variant.group.followsAccount
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
    emptyRequirementsAction: "default-creation",
    items: tokens.map((token) => {
      const group = token.group?.trim() || ""
      const effectiveGroup = group || currentUserGroup || ""
      const requirementKey = requirementByName.get(effectiveGroup)
      const placement = config.variant.group.resolvePlacement(
        token,
        requirementByName,
        currentUserGroup,
      )
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

export const provisionRequirement = async (
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
    execute: async (request) => {
      const editor = createNewApiKeyEditor(config.variant, request, undefined, {
        preferredGroup: group,
      })
      return config.transport.createApiToken(
        request,
        editor.buildCommand(editor.initialValues).values,
      )
    },
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
  const [createdToken] = created
  if (created.length !== 1 || !createdToken) {
    return {
      certainty: "possibly-applied",
      failure: mapAccountKeyResourceUncertainFailure(
        createResult.certainty === "possibly-applied"
          ? createResult.failure
          : undefined,
      ),
    }
  }
  const placementMatches = config.variant.group.matchesCreatedPlacement(
    createdToken,
    requirementKey,
  )
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

const toTokenUpdateRequest = (
  variant: NewApiKeyVariant,
  token: NewApiToken,
  name: string,
): NewApiTokenWriteBody => ({ ...toNewApiTokenWrite(token, variant), name })

export const renameProvisionedResource = async (
  config: NewApiAccountKeyResourceConfig,
  ref: AccountKeyResourceRef,
  options?: ResourceOperationOptions,
): Promise<NativeResourceMutationResult<void, ResourceFailure>> => {
  const tokenId = decodeTokenId(ref.resourceId)
  const listed = (await collectValidatedInventoryTokens(config, options)).find(
    (token) => token.id === tokenId,
  )
  if (!listed) {
    return {
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound },
    }
  }

  const current = await readEditableToken(config, listed, options)

  const explicitGroup = current.group?.trim() || ""
  const group =
    explicitGroup ||
    (config.variant.group.followsAccount
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
        toTokenUpdateRequest(config.variant, current, targetDisplayName),
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
