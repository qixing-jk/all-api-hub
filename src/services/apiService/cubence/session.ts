import { CUBENCE_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { createCookieOperationSession } from "~/services/apiTransport/cookieOperationSession"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

// Verified console cookie and non-rotating CRUD; retain Firefox's existing transport.
const session = createCookieOperationSession({
  origin: CUBENCE_WEB_ORIGIN,
  loginCookieName: "token",
})
export const getCubenceCookieSession = session.getSession
/** Keep the verified Chromium operation binding and the existing Firefox transport. */
export function withCubenceSession<T>(
  request: ApiServiceRequest,
  run: (request: ApiServiceRequest) => Promise<T>,
): Promise<T> {
  return import.meta.env.BROWSER === "firefox"
    ? run(request)
    : session.withSession(request, run)
}
