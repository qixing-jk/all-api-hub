import { SITE_TYPES } from "~/constants/siteType"
import { REQUESTY_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountPersistenceCapability } from "~/services/apiAdapters/contracts/accountPersistence"
import { resolveRequestyAccountUserId } from "~/services/apiAdapters/requesty/account/accountIdentity"
import { fetchRequestyAccountIdentity } from "~/services/apiService/requesty"
import { AuthTypeEnum } from "~/types"
import { getErrorMessage } from "~/utils/core/error"

/** Account identity follows the organization; credential ownership remains key-scoped. */
export const requestyAccountPersistence: AccountPersistenceCapability = {
  async prepareIdentity({ accessToken, userId, existingAccount }) {
    const credential = accessToken.trim()
    const credentialUnchanged =
      existingAccount?.site_type === SITE_TYPES.REQUESTY &&
      credential !== "" &&
      credential ===
        (existingAccount.account_info.access_token?.trim() ?? "") &&
      Boolean(existingAccount.account_info.id?.trim())
    if (credentialUnchanged) {
      return existingAccount.account_info.id.trim()
    }

    const info = await fetchRequestyAccountIdentity({
      baseUrl: REQUESTY_WEB_ORIGIN,
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: credential },
    })
    // A form may still carry the previous credential's identity after a paste.
    // Only a new detection's local fallback may survive credential replacement.
    const entered = userId.trim()
    const fallback =
      entered !== existingAccount?.account_info.id?.trim() ? entered : undefined
    return resolveRequestyAccountUserId(info.orgId, fallback)
  },
  getValidationFailureMessage: (error) => getErrorMessage(error),
  getHealthFailureReason: (error) => getErrorMessage(error),
  getOperationLogDetails: (ordinaryDetails) => ordinaryDetails,
  getCredentialKey: (accessToken) => accessToken?.trim() || undefined,
}
