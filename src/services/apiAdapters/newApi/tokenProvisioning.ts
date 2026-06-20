import type { AccountSiteType } from "~/constants/siteType"
import {
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  isCreatedApiToken,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
  type TokenProvisioningCapability,
} from "~/services/apiAdapters/contracts/tokenProvisioning"

export const createNewApiTokenProvisioning = (
  _siteType: AccountSiteType,
): TokenProvisioningCapability => ({
  isInventoryTokenUsable: () => true,
  resolveDefaultTokenCreation: ({ defaultTokenData }) => ({
    kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
    tokenData: defaultTokenData,
    oneTimeSecret: false,
    recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
  }),
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
    kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible,
  }),
})
