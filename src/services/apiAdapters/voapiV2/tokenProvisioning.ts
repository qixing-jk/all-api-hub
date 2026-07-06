import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
  type TokenProvisioningCapability,
} from "~/services/apiAdapters/contracts/tokenProvisioning"

const normalizeGroupNames = (groups: Record<string, unknown>): string[] => {
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

export const voApiV2TokenProvisioning: TokenProvisioningCapability = {
  isInventoryTokenUsable: ({ token }) => Boolean(token.id),
  resolveDefaultTokenCreation({ defaultTokenData, explicitGroup, userGroups }) {
    if (defaultTokenData.unlimited_quota) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable,
      }
    }

    const normalizedExplicitGroup = explicitGroup?.trim()
    if (normalizedExplicitGroup) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: { ...defaultTokenData, group: normalizedExplicitGroup },
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }
    }

    if (!userGroups) {
      return { kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups }
    }

    const allowedGroups = normalizeGroupNames(userGroups)
    if (allowedGroups.length === 0) {
      return { kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups }
    }

    if (allowedGroups.length === 1) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: { ...defaultTokenData, group: allowedGroups[0] },
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }
    }

    return {
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
      allowedGroups,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
    }
  },
  classifyCreatedToken() {
    return { kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch }
  },
  getRepairPolicy() {
    return { kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible }
  },
}
