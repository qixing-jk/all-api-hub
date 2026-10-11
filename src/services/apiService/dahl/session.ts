import { DAHL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { createCookieOperationSession } from "~/services/apiTransport/cookieOperationSession"

// Dahl's HttpOnly console session is distinct from inference keys. Bind it across
// UUID verification, native writes and readback; never follow a changed browser login.
const session = createCookieOperationSession({
  origin: DAHL_WEB_ORIGIN,
  loginCookieName: "dahl_session",
})
export const withDahlSession = session.withSession
export const getDahlCookieSession = session.getSession
