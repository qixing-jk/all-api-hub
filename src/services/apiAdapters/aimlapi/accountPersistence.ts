import { SITE_TYPES } from "~/constants/siteType"
import { AIMLAPI_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { fetchAimlApiUserInfo } from "~/services/apiAdapters/aimlapi/accountIdentity"
import type { AccountPersistenceCapability } from "~/services/apiAdapters/contracts/accountPersistence"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { t } from "~/utils/i18n/core"

import { forgetDeletedAimlApiAccountCredentials } from "./connectionCredentials"

/**
 * Maps AI/ML API failures to local copy without echoing upstream text.
 *
 * Problem bodies can repeat the credential or route the caller used, so the
 * account layer only ever sees a controlled message.
 */
function getAimlApiSafeErrorMessage(
  error: unknown,
  unknownFallback: string,
): string {
  if (error instanceof ApiError) {
    if (error.code === API_ERROR_CODES.HTTP_401)
      return t("messages:aimlapi.credentialInvalid")
    if (error.code === API_ERROR_CODES.HTTP_403)
      return t("messages:aimlapi.credentialScopeDenied")
    if (error.code === API_ERROR_CODES.NETWORK_ERROR)
      return t("messages:aimlapi.networkFallback")
    if (
      error.code === API_ERROR_CODES.JSON_PARSE_ERROR ||
      error.code === API_ERROR_CODES.CONTENT_TYPE_MISMATCH
    )
      return t("messages:aimlapi.malformedResponse")
  }
  return unknownFallback
}

export const aimlApiAccountPersistence: AccountPersistenceCapability = {
  cleanupDeletedAccount: (account) =>
    forgetDeletedAimlApiAccountCredentials(String(account.account_info.id)),
  async prepareIdentity({ accessToken, userId, aimlApiKey, existingAccount }) {
    const credential = accessToken.trim()
    const regularKey = aimlApiKey?.trim() ?? ""
    const unchangedCredential =
      existingAccount?.site_type === SITE_TYPES.AIMLAPI &&
      credential ===
        (existingAccount.account_info.access_token?.trim() ?? "") &&
      regularKey === (existingAccount.aimlApiAuth?.apiKey?.trim() ?? "")
    // Re-saving an untouched credential keeps the stored identity instead of
    // re-reading it; a changed key is always re-verified.
    if (unchangedCredential && userId.trim()) return userId.trim()

    // `GET /v1/key` proves the management key; with a regular key present the
    // billing detail also names the account, which is the better identity.
    const info = await fetchAimlApiUserInfo({
      baseUrl: AIMLAPI_WEB_ORIGIN,
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: credential },
      ...(regularKey ? { aimlApiKey: regularKey } : {}),
    })
    return info.id
  },
  getValidationFailureMessage: (error) =>
    getAimlApiSafeErrorMessage(error, t("messages:aimlapi.networkFallback")),
  getHealthFailureReason: (error) =>
    getAimlApiSafeErrorMessage(error, t("account:healthStatus.unknownError")),
  getOperationLogDetails: (_ordinaryDetails, safeDetails) => safeDetails,
}
