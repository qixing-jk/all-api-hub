import {
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  isCreatedApiToken,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
  TOKEN_PROVISIONING_WORKFLOWS,
  type TokenProvisioningCapability,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import { ACCOUNT_KEY_REPAIR_SKIP_REASONS } from "~/types/accountKeyAutoProvisioning"

const createWithGroup = (
  defaultTokenData: CreateTokenRequest,
  group: string,
) => ({
  kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
  tokenData: { ...defaultTokenData, group },
  oneTimeSecret: false,
  recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
})

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

export const sub2ApiTokenProvisioning: TokenProvisioningCapability = {
  isInventoryTokenUsable: () => true,
  resolveDefaultTokenCreation: ({
    defaultTokenData,
    explicitGroup,
    userGroups,
    workflow,
  }) => {
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
  },
  classifyCreatedToken: ({ result }) => {
    if (isCreatedApiToken(result)) {
      return {
        kind: "usable",
        token: result,
        oneTimeSecret: false,
      }
    }

    if (result) {
      return { kind: "needs_inventory_refetch" }
    }

    return {
      kind: "failed",
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
    }
  },
  getRepairPolicy: () => ({
    kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Skipped,
    skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
  }),
}
