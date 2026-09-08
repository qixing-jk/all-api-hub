import { SITE_TYPES } from "~/constants/siteType"
import type { AccountPersistenceCapability } from "~/services/apiAdapters/contracts/accountPersistence"
import { validateManagementKey } from "~/services/apiService/openrouter"
import {
  OPENROUTER_CREDITS_ENDPOINT,
  OPENROUTER_KEY_ENDPOINT,
} from "~/services/apiService/openrouter/constants"
import { OpenRouterManagementKeyRequiredError } from "~/services/apiService/openrouter/errors"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { t } from "~/utils/i18n/core"

import { resolveOpenRouterAccountUserId } from "./accountIdentity"

/** Maps OpenRouter failures to controlled local copy without losing typed classification. */
function getOpenRouterSafeErrorMessage(
  error: unknown,
  unknownFallback: string,
): string {
  if (error instanceof OpenRouterManagementKeyRequiredError) {
    return t("messages:openrouter.managementKeyRequired")
  }
  if (error instanceof ApiError) {
    if (error.code === API_ERROR_CODES.HTTP_401) {
      return t("messages:openrouter.credentialInvalid")
    }
    if (error.code === API_ERROR_CODES.HTTP_403) {
      return t("messages:openrouter.permissionDenied")
    }
    if (error.code === API_ERROR_CODES.NETWORK_ERROR) {
      return t("messages:openrouter.networkFallback")
    }
    const hasOpenRouterResponseEndpoint =
      error.endpoint === OPENROUTER_KEY_ENDPOINT ||
      error.endpoint === OPENROUTER_CREDITS_ENDPOINT
    const hasExplicitMalformedResponseCode =
      error.code === API_ERROR_CODES.CONTENT_TYPE_MISMATCH ||
      error.code === API_ERROR_CODES.JSON_PARSE_ERROR
    const isLocalStructureValidationError =
      hasOpenRouterResponseEndpoint &&
      error.code == null &&
      error.statusCode == null
    if (hasExplicitMalformedResponseCode || isLocalStructureValidationError) {
      return t("messages:openrouter.malformedResponse")
    }
  }
  return unknownFallback
}

export const openRouterAccountPersistence: AccountPersistenceCapability = {
  async prepareIdentity({ accessToken, userId, existingAccount }) {
    const credential = accessToken.trim()
    const shouldValidate =
      existingAccount?.site_type !== SITE_TYPES.OPENROUTER ||
      credential !== (existingAccount.account_info.access_token?.trim() ?? "")
    const validation = shouldValidate
      ? await validateManagementKey({ accessToken: credential })
      : {}
    return resolveOpenRouterAccountUserId({
      enteredUserId: userId,
      creatorUserId: validation.userId,
      existingUserId: existingAccount?.account_info.id,
    })
  },
  getValidationFailureMessage: (error) =>
    getOpenRouterSafeErrorMessage(
      error,
      t("messages:openrouter.networkFallback"),
    ),
  getHealthFailureReason: (error) =>
    getOpenRouterSafeErrorMessage(
      error,
      t("account:healthStatus.unknownError"),
    ),
  getOperationLogDetails: (_ordinaryDetails, safeDetails) => safeDetails,
  getCredentialKey: (accessToken) => accessToken?.trim() || undefined,
}
