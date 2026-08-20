import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  isCreatedApiToken,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  type TokenProvisioningCapability,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { resolveRequiredGroupDefaultTokenCreation } from "~/services/apiAdapters/tokenProvisioning/requiredGroup"

export const sub2ApiTokenProvisioning: TokenProvisioningCapability = {
  isInventoryTokenUsable: () => true,
  resolveDefaultTokenCreation: resolveRequiredGroupDefaultTokenCreation,
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
}
