import { SITE_TYPES } from "~/constants/siteType"
import { NANOGPT_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountPersistenceCapability } from "~/services/apiAdapters/contracts/accountPersistence"
import { fetchUserInfo } from "~/services/apiService/nanogpt"
import { NANOGPT_MANAGEMENT_IDENTITY_PREFIX } from "~/services/apiService/nanogpt/constants"
import { parseNanoGptCredentials } from "~/services/apiService/nanogpt/credentials"
import {
  nanoGptManagementIdentity,
  verifyNanoGptManagementCredential,
} from "~/services/apiService/nanogpt/managementIdentity"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum } from "~/types"
import { t } from "~/utils/i18n/core"

/** Admission errors stay separate from configuration-only data-refresh fallback. */
const safeMessage = (error: unknown) =>
  error instanceof ApiError &&
  error.code === API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH
    ? t("accountDialog:messages.autoDetectIdentityMismatch")
    : toSanitizedErrorSummary(error, [])

/** A pasted inference key must prove the account identity before persistence. */
export const nanoGptAccountPersistence: AccountPersistenceCapability = {
  async prepareIdentity({ accessToken, userId, existingAccount }) {
    const credential = accessToken.trim()
    const previous =
      existingAccount?.site_type === SITE_TYPES.NANOGPT
        ? existingAccount.account_info
        : undefined
    const expectedIdentity = userId.trim() || previous?.id?.trim() || ""
    if (
      previous?.id &&
      credential === previous.access_token.trim() &&
      expectedIdentity === previous.id
    )
      return previous.id
    const pair = parseNanoGptCredentials(credential)
    const request = {
      directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
      baseUrl: NANOGPT_WEB_ORIGIN,
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: credential },
    }
    if (pair.managementToken) await verifyNanoGptManagementCredential(request)
    if (!pair.apiKey) {
      if (!pair.managementToken)
        throw new ApiError(
          "NanoGPT credential required",
          undefined,
          undefined,
          API_ERROR_CODES.FEATURE_UNSUPPORTED,
        )
      return nanoGptManagementIdentity(request)
    }
    const identity = await fetchUserInfo({
      directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
      baseUrl: NANOGPT_WEB_ORIGIN,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: credential,
        ...(expectedIdentity &&
        !expectedIdentity.startsWith(NANOGPT_MANAGEMENT_IDENTITY_PREFIX)
          ? { userId: expectedIdentity }
          : {}),
      },
    })
    return identity.id
  },
  getKeyAuthenticationSecret: (credential) =>
    parseNanoGptCredentials(credential).apiKey || undefined,
  getValidationFailureMessage: safeMessage,
  getHealthFailureReason: safeMessage,
  getOperationLogDetails: (_ordinaryDetails, safeDetails) => safeDetails,
}
