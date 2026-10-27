import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { AutoDetectCompletionError } from "~/services/accounts/autoDetectCompletion/types"
import { NOVITA_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountPersistenceCapability } from "~/services/apiAdapters/contracts/accountPersistence"
import { verifyNovitaCredentials } from "~/services/apiService/novita"
import { parseNovitaCredentials } from "~/services/apiService/novita/constants"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { t } from "~/utils/i18n/core"

/** Maps Novita failures to controlled local copy without losing typed classification. */
export function getNovitaSafeErrorMessage(
  error: unknown,
  unknownFallback: string,
): string {
  if (
    error instanceof AutoDetectCompletionError &&
    error.reason === AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch
  ) {
    return t("accountDialog:messages.autoDetectIdentityMismatch")
  }
  if (error instanceof ApiError) {
    if (error.code === API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH)
      return t("accountDialog:messages.autoDetectIdentityMismatch")
    if (error.code === API_ERROR_CODES.HTTP_401) {
      return t("messages:novita.credentialInvalid")
    }
    if (error.code === API_ERROR_CODES.NETWORK_ERROR) {
      return t("messages:novita.networkFallback")
    }
    const isMalformedResponse =
      error.code === API_ERROR_CODES.CONTENT_TYPE_MISMATCH ||
      error.code === API_ERROR_CODES.JSON_PARSE_ERROR ||
      (error.code == null && error.statusCode == null)
    if (isMalformedResponse) return t("messages:novita.malformedResponse")
  }
  return unknownFallback
}

export const novitaAccountPersistence: AccountPersistenceCapability = {
  async prepareIdentity({ accessToken, userId, existingAccount }) {
    const credential = accessToken.trim()
    const shouldValidate =
      existingAccount?.site_type !== SITE_TYPES.NOVITA ||
      credential !== (existingAccount.account_info.access_token?.trim() ?? "")
    if (!shouldValidate) {
      return userId.trim() || existingAccount?.account_info.id?.trim() || ""
    }
    const user = await verifyNovitaCredentials({
      baseUrl: NOVITA_WEB_ORIGIN,
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: credential },
    })
    const expectedIdentity =
      userId.trim() || existingAccount?.account_info.id?.trim()
    if (expectedIdentity && user.id !== expectedIdentity) {
      throw new AutoDetectCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
        new Error("Novita account identity mismatch"),
      )
    }
    return user.id
  },
  getValidationFailureMessage: (error) =>
    getNovitaSafeErrorMessage(error, t("messages:novita.networkFallback")),
  getHealthFailureReason: (error) =>
    getNovitaSafeErrorMessage(error, t("account:healthStatus.unknownError")),
  getOperationLogDetails: (_ordinaryDetails, safeDetails) => safeDetails,
  getCredentialKey: (accessToken) => accessToken?.trim() || undefined,
  getKeyAuthenticationSecret: (accessToken) =>
    parseNovitaCredentials(accessToken).apiKey || undefined,
}
