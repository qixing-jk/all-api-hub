import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  isCreatedApiToken,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
  type TokenProvisioningCapability,
} from "~/services/apiAdapters/contracts/tokenProvisioning"

export const defaultTokenProvisioning: TokenProvisioningCapability = {
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
        kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
        token: result,
        oneTimeSecret: false,
      }
    }

    if (result) {
      return { kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch }
    }

    return {
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Failed,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
    }
  },
  getRepairPolicy: () => ({
    kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible,
  }),
}
