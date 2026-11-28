import { fetchUserInfo } from "~/services/apiService/pmplan"
import { ApiError } from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

/** Exercise the packaged provider transport without exposing response credentials. */
async function pmplanCookieTransportProbe(baseUrl: string, cookie?: string) {
  try {
    const user = await fetchUserInfo({
      baseUrl,
      directRequestReason: API_DIRECT_REQUEST_REASONS.CallerManaged,
      auth: { authType: AuthTypeEnum.Cookie, userId: "42", cookie },
    })
    return { success: true, userId: user.id }
  } catch (error) {
    return {
      success: false,
      errorCode: error instanceof ApiError ? error.code : "UNEXPECTED_ERROR",
    }
  }
}

declare global {
  interface Window {
    pmplanCookieTransportProbe: typeof pmplanCookieTransportProbe
  }
}

window.pmplanCookieTransportProbe = pmplanCookieTransportProbe
