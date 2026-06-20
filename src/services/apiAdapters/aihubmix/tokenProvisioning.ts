import {
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  isCreatedApiToken,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
  TOKEN_PROVISIONING_WORKFLOWS,
  type TokenProvisioningCapability,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import {
  hasUsableApiTokenKey,
  isMaskedApiTokenKey,
} from "~/services/apiService/common/apiKey"
import type { ApiToken } from "~/types"
import { ACCOUNT_KEY_REPAIR_SKIP_REASONS } from "~/types/accountKeyAutoProvisioning"

const hasUsableFullTokenSecret = (token: ApiToken): boolean =>
  hasUsableApiTokenKey(token.key) && !isMaskedApiTokenKey(token.key)

export const aihubmixTokenProvisioning: TokenProvisioningCapability = {
  isInventoryTokenUsable: ({ token }) => hasUsableFullTokenSecret(token),
  resolveDefaultTokenCreation: ({ defaultTokenData, workflow }) => {
    if (workflow !== TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired,
      }
    }

    // AIHubMix only exposes the full key in the create response; later reads can be masked.
    return {
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: defaultTokenData,
      oneTimeSecret: true,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.CreatedResponseFirst,
    }
  },
  classifyCreatedToken: ({ result }) => {
    if (!result) {
      return {
        kind: "failed",
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
      }
    }

    if (isCreatedApiToken(result) && hasUsableFullTokenSecret(result)) {
      return {
        kind: "usable",
        token: result,
        oneTimeSecret: true,
      }
    }

    return {
      kind: "unavailable",
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable,
    }
  },
  getRepairPolicy: () => ({
    kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Skipped,
    skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey,
  }),
}
