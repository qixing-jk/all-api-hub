import toast from "react-hot-toast"

import {
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  ensureDefaultTokenLifecycle,
} from "~/services/accounts/defaultTokenLifecycle"
import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
import {
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import { t } from "~/utils/i18n/core"

type EnsureAccountApiTokenOptions = {
  toastId?: string
  defaultTokenData?: CreateTokenRequest
  explicitGroup?: string
}

/** Ensures an account has a usable API token, creating a default when allowed. */
export async function ensureAccountApiToken(
  account: SiteAccount,
  displaySiteData: DisplaySiteData,
  toastIdOrOptions?: string | EnsureAccountApiTokenOptions,
): Promise<ApiToken> {
  const options =
    typeof toastIdOrOptions === "string"
      ? { toastId: toastIdOrOptions }
      : toastIdOrOptions ?? {}

  toast.loading(t("messages:accountOperations.checkingApiKeys"), {
    id: options.toastId,
  })

  const result = await ensureDefaultTokenLifecycle({
    workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
    account,
    displaySiteData,
    defaultTokenData: options.defaultTokenData,
    explicitGroup: options.explicitGroup,
  })

  if (
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready ||
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created
  ) {
    return result.token
  }

  if (
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked &&
    (result.reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired ||
      result.reason ===
        TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable)
  ) {
    throw new Error(
      t("messages:tokenProvisioning.createRequiresOneTimeSecretHandling"),
    )
  }

  if (
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked &&
    result.reason === DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.CreateTokenFailed
  ) {
    throw new Error(t("messages:accountOperations.createTokenFailed"))
  }

  if (
    result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked &&
    (result.reason === DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.TokenNotFound ||
      result.reason ===
        DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.AmbiguousCreatedToken)
  ) {
    throw new Error(t("messages:accountOperations.tokenNotFound"))
  }

  throw new Error(t("messages:tokenProvisioning.createRequiresGroup"))
}
