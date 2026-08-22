import {
  generateDefaultTokenRequest,
  normalizeDefaultTokenRequestName,
  resolveDefaultTokenLifecycleDecisionDetails,
  resolvePreferredDefaultUserGroup,
} from "~/services/accounts/defaultTokenLifecycle"
import type {
  CreateTokenRequest,
  UserGroupInfo,
} from "~/services/accountTokens/tokenProvisioningModel"
import {
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_ERRORS,
  TOKEN_PROVISIONING_WORKFLOWS,
  type TokenProvisioningBlockReason,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { DisplaySiteData } from "~/types"
import { t } from "~/utils/i18n/core"

/**
 * Resolution kinds for default-token quick-create policy.
 */
export const TOKEN_QUICK_CREATE_RESOLUTION_KINDS = {
  Ready: "ready",
  SelectionRequired: "selection_required",
  Blocked: "blocked",
} as const

export type DefaultTokenQuickCreateResolution =
  | {
      kind: typeof TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready
      tokenData: CreateTokenRequest
    }
  | {
      kind: typeof TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired
      allowedGroups: string[]
      suggestedGroup: string
      groups: Record<string, UserGroupInfo>
    }
  | {
      kind: typeof TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked
      reason: TokenProvisioningBlockReason
      message: string
    }

export type DefaultTokenGroupSelection = Pick<
  Extract<
    DefaultTokenQuickCreateResolution,
    { kind: typeof TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired }
  >,
  "allowedGroups" | "suggestedGroup" | "groups"
>

const getDefaultTokenProvisioningBlockMessage = (
  reason: TokenProvisioningBlockReason,
): string => {
  if (reason === TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired) {
    return t("messages:tokenProvisioning.createRequiresAvailableGroup")
  }

  if (reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired) {
    return t("messages:tokenProvisioning.createRequiresOneTimeSecretHandling")
  }

  return t("messages:tokenProvisioning.createRequiresGroup")
}

/** Resolves the current default-token quick-create state from adapter policy. */
export async function resolveDefaultTokenQuickCreateResolution(
  account: DisplaySiteData,
  options: { explicitGroup?: string } = {},
): Promise<DefaultTokenQuickCreateResolution> {
  const { decision, userGroups } =
    await resolveDefaultTokenLifecycleDecisionDetails({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
      displaySiteData: account,
      defaultTokenData: generateDefaultTokenRequest(),
      explicitGroup: options.explicitGroup,
      missingUserGroupsMessage:
        TOKEN_PROVISIONING_ERRORS.GroupInventoryNotImplemented,
    })

  if (decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create) {
    return {
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
      tokenData: normalizeDefaultTokenRequestName(decision.tokenData),
    }
  }

  if (
    decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired
  ) {
    return {
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
      allowedGroups: decision.allowedGroups,
      suggestedGroup: resolvePreferredDefaultUserGroup(decision.allowedGroups),
      groups: userGroups ?? {},
    }
  }

  if (decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups) {
    throw new Error(TOKEN_PROVISIONING_ERRORS.GroupInventoryNotImplemented)
  }

  return {
    kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked,
    reason: decision.reason,
    message: getDefaultTokenProvisioningBlockMessage(decision.reason),
  }
}
