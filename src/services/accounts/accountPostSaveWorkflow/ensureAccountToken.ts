import {
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  ensureDefaultTokenLifecycle,
  inspectDefaultTokenInventory,
  selectSingleNewApiTokenByIdDiff,
} from "~/services/accounts/defaultTokenLifecycle"
import {
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { DisplaySiteData, SiteAccount } from "~/types"
import { t } from "~/utils/i18n/core"

import {
  ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES,
  ENSURE_ACCOUNT_TOKEN_RESULT_KINDS,
  type AccountTokenInventoryState,
  type EnsureAccountTokenResult,
} from "./constants"

export { selectSingleNewApiTokenByIdDiff }

/**
 * Preserves the post-save inventory helper's legacy call shape.
 */
export function inspectAccountTokenInventory(params: {
  displaySiteData: DisplaySiteData
}): Promise<AccountTokenInventoryState> {
  return inspectDefaultTokenInventory({
    workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
    displaySiteData: params.displaySiteData,
  })
}

/**
 * Ensures a saved account has a token that can be used by post-save automation.
 */
export async function ensureAccountTokenForPostSaveWorkflow(params: {
  account: SiteAccount
  displaySiteData: DisplaySiteData
}): Promise<EnsureAccountTokenResult> {
  const result = await ensureDefaultTokenLifecycle({
    workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
    account: params.account,
    displaySiteData: params.displaySiteData,
  })

  if (result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: result.token,
      created: false,
    }
  }

  if (result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: result.token,
      created: true,
      oneTimeSecret: result.oneTimeSecret,
    }
  }

  if (result.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.SelectionRequired) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
      allowedGroups: result.allowedGroups,
      existingTokenIds: result.existingTokenIds,
    }
  }

  if (
    result.reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired ||
    result.reason ===
      TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable
  ) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable,
      message: t("messages:aihubmix.createRequiresOneTimeKeyDialog"),
    }
  }

  if (
    result.reason === TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired ||
    result.reason === DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.MissingUserGroups
  ) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
      message: t("messages:sub2api.createRequiresAvailableGroup"),
    }
  }

  return {
    kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
    code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
    message: t("messages:accountOperations.createTokenFailed"),
  }
}
