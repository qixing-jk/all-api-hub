import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
import {
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
  type DefaultTokenCreationDecision,
  type ResolveDefaultTokenCreationRequest,
} from "~/services/apiAdapters/contracts/tokenProvisioning"

type CreateDefaultTokenDecision = Extract<
  DefaultTokenCreationDecision,
  { kind: typeof DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create }
>

const createWithGroup = (
  defaultTokenData: CreateTokenRequest,
  group: string,
): CreateDefaultTokenDecision => ({
  kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
  tokenData: { ...defaultTokenData, group },
  oneTimeSecret: false,
  recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
})

/** Normalizes provider group maps into stable selectable names. */
export const normalizeTokenProvisioningGroupNames = (
  groups: Record<string, unknown>,
): string[] => {
  const seen = new Set<string>()
  const normalizedGroups: string[] = []

  for (const group of Object.keys(groups)) {
    const normalizedGroup = group.trim()
    if (!normalizedGroup || seen.has(normalizedGroup)) continue

    seen.add(normalizedGroup)
    normalizedGroups.push(normalizedGroup)
  }

  return normalizedGroups
}

/** Resolves token creation for providers that require an explicit user group. */
export const resolveRequiredGroupDefaultTokenCreation = ({
  defaultTokenData,
  explicitGroup,
  userGroups,
  workflow,
}: ResolveDefaultTokenCreationRequest): DefaultTokenCreationDecision => {
  const normalizedExplicitGroup = explicitGroup?.trim()
  if (normalizedExplicitGroup) {
    return createWithGroup(defaultTokenData, normalizedExplicitGroup)
  }

  if (
    workflow !== TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection &&
    workflow !== TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation
  ) {
    return {
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
    }
  }

  if (!userGroups) {
    return { kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups }
  }

  const groups = normalizeTokenProvisioningGroupNames(userGroups)
  if (groups.length === 0) {
    return {
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
    }
  }

  if (groups.length === 1) {
    return createWithGroup(defaultTokenData, groups[0])
  }

  return {
    kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
    allowedGroups: groups,
    reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
  }
}
