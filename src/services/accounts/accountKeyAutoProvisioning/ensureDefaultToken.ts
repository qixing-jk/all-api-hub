import {
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  DefaultTokenLifecyclePolicyBlockedError,
  ensureDefaultTokenLifecycle,
} from "~/services/accounts/defaultTokenLifecycle"
import {
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_ERRORS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import { t } from "~/utils/i18n/core"

export {
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
  DEFAULT_USER_GROUP_NAME,
  buildGroupDefaultTokenRequest,
  generateDefaultTokenRequest,
  resolvePreferredDefaultUserGroup,
} from "~/services/accounts/defaultTokenLifecycle"

/**
 * Ensures that an API token exists for the supplied account by checking the
 * remote token inventory and lazily issuing a default token when none exist.
 *
 * This helper is safe to run in background contexts (no UI dependencies).
 */
export async function ensureDefaultApiTokenForAccount(params: {
  account: SiteAccount
  displaySiteData: DisplaySiteData
}): Promise<{ token: ApiToken; created: boolean }> {
  const { account, displaySiteData } = params
  const result = await ensureDefaultTokenLifecycle({
    workflow: TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision,
    account,
    displaySiteData,
  })

  if (
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready ||
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created
  ) {
    return {
      token: result.token,
      created: result.created,
    }
  }

  if (
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked &&
    (result.reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired ||
      result.reason ===
        TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable)
  ) {
    throw new DefaultTokenLifecyclePolicyBlockedError({
      reason: result.reason,
      message: t("messages:aihubmix.createRequiresOneTimeKeyDialog"),
    })
  }

  if (
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked &&
    result.reason === DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.CreateTokenFailed
  ) {
    throw new Error(TOKEN_PROVISIONING_ERRORS.CreateTokenFailed)
  }

  if (
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked &&
    (result.reason === DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.TokenNotFound ||
      result.reason ===
        DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.AmbiguousCreatedToken)
  ) {
    throw new Error(TOKEN_PROVISIONING_ERRORS.TokenNotFound)
  }

  throw new DefaultTokenLifecyclePolicyBlockedError({
    reason:
      result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked
        ? result.reason
        : TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
    message: t("messages:tokenProvisioning.createRequiresGroup"),
  })
}
