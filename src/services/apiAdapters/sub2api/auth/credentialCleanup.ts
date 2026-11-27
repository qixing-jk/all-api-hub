import { SITE_TYPES } from "~/constants/siteType"
import type { AccountLoginCredential } from "~/services/apiAdapters/contracts/accountLogin"
import { SUB2API_AUTH_LOGOUT_ENDPOINT } from "~/services/apiService/sub2api/type"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { isRecord } from "~/utils/core/object"
import { t } from "~/utils/i18n/core"

/** Revoke only the newly issued family, without the website's ambient Cookie. */
export async function discardSub2ApiLoginCredential(
  baseUrl: string,
  credential: AccountLoginCredential,
): Promise<void> {
  if (!credential.accessToken || !credential.sub2apiAuth?.refreshToken) return
  const result = await fetchApiResponse(
    {
      siteType: SITE_TYPES.SUB2API,
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: credential.accessToken,
      },
      directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
      requestTimeoutMs: 5000,
    },
    {
      endpoint: SUB2API_AUTH_LOGOUT_ENDPOINT,
      options: {
        method: "POST",
        body: JSON.stringify({
          refresh_token: credential.sub2apiAuth.refreshToken,
        }),
        credentials: "omit",
        redirect: "error",
      },
    },
  )
  if (!result.ok || !isRecord(result.body) || result.body.code !== 0)
    throw new Error(t("messages:errors.api.browserLoginCleanupUnconfirmed"))
}
