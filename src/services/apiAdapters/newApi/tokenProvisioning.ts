import type { AccountSiteType } from "~/constants/siteType"
import {
  isCreatedApiToken,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  type TokenProvisioningCapability,
} from "~/services/apiAdapters/contracts/tokenProvisioning"

export const createNewApiTokenProvisioning = (
  _siteType: AccountSiteType,
): TokenProvisioningCapability => ({
  isInventoryTokenUsable: () => true,
  resolveDefaultTokenCreation: ({ defaultTokenData }) => ({
    kind: "create",
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
  getRepairPolicy: () => ({ kind: "eligible" }),
})
