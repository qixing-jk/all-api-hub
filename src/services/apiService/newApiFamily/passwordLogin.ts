import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import {
  passwordLoginRequest,
  runPasswordLoginContentAction,
  validatePasswordLoginContext,
  validatePasswordLoginRequest,
  type PasswordLoginContentRequest,
} from "~/services/accountLogin/passwordContent"
import {
  isAgentRouterLoginUrl,
  isAgentRouterSystemName,
} from "~/services/accountLogin/providers/agentrouter/config"
import type { AccountLoginResult } from "~/services/apiAdapters/contracts/accountLogin"
import { parseNewApiDashboardAuthBundleResponse } from "~/services/apiService/newApi/dashboardAuth"
import { isRecord } from "~/utils/core/object"

import { encryptNewApiPassword } from "./passwordEncryption"

let observed: { requestId: string; identity: string; sid?: string } | undefined

/** New API native username/password login, verified against the server's self endpoint. */
export function handleNewApiPasswordLogin(
  request: PasswordLoginContentRequest,
  reply: (result: AccountLoginResult) => void,
): true {
  let established = false
  return runPasswordLoginContentAction(
    reply,
    async () => {
      const { credentials, expectedIdentity, requestId } =
        validatePasswordLoginRequest(request)
      const status = await passwordLoginRequest("/api/status")
      if (status.success !== true || !isRecord(status.data))
        return { status: BROWSER_LOGIN_STATUS.Failed }
      if (
        isAgentRouterLoginUrl(location.href) &&
        !isAgentRouterSystemName(status.data.system_name)
      )
        return { status: BROWSER_LOGIN_STATUS.Unsupported }
      if (status.data.password_login_enabled === false)
        return { status: BROWSER_LOGIN_STATUS.Unsupported }
      if (status.data.turnstile_check === true)
        return { status: BROWSER_LOGIN_STATUS.InteractionRequired }
      const passwordFields =
        status.data.password_login_encryption_enabled === true
          ? await encryptNewApiPassword(credentials.password)
          : { password: credentials.password }
      const login = await passwordLoginRequest("/api/user/login", {
        username: credentials.username,
        ...passwordFields,
      })
      if (login.success !== true || !isRecord(login.data))
        return { status: BROWSER_LOGIN_STATUS.Failed }
      if (login.data.require_2fa === true)
        return { status: BROWSER_LOGIN_STATUS.InteractionRequired }
      established = true
      const parsed = parseNewApiDashboardAuthBundleResponse(login)
      if (parsed.kind === "malformed")
        return { status: BROWSER_LOGIN_STATUS.Uncertain }
      const user = parsed.kind === "valid" ? parsed.bundle.user : login.data
      const identity = String(user.id ?? "")
      if (!identity) return { status: BROWSER_LOGIN_STATUS.Uncertain }
      observed = {
        requestId,
        identity,
        ...(parsed.kind === "valid" ? { sid: parsed.bundle.sessionId } : {}),
      }
      if (identity !== expectedIdentity)
        return { status: BROWSER_LOGIN_STATUS.IdentityMismatch }
      const self = await passwordLoginRequest(
        "/api/user/self",
        undefined,
        parsed.kind === "valid"
          ? { Authorization: `Bearer ${parsed.bundle.token}` }
          : { "New-Api-User": identity },
      )
      if (self.success !== true || !isRecord(self.data) || self.data.id == null)
        return { status: BROWSER_LOGIN_STATUS.Uncertain }
      if (String(self.data.id) !== identity)
        return { status: BROWSER_LOGIN_STATUS.IdentityMismatch }
      if (parsed.kind !== "valid")
        localStorage.setItem("user", JSON.stringify(user))
      return {
        status: BROWSER_LOGIN_STATUS.Authenticated,
        identity,
        ...(typeof user.checked_in === "boolean"
          ? { evidence: { checkedIn: user.checked_in } }
          : {}),
      }
    },
    () => established,
  )
}

/** Revoke only a session actually observed by this request; a newer session survives. */
export function handleClearNewApiPasswordLogin(
  request: PasswordLoginContentRequest,
  reply: (result: unknown) => void,
): true {
  return runPasswordLoginContentAction(reply, async () => {
    const requestId = validatePasswordLoginContext(request)
    const session = observed
    if (session?.requestId !== requestId)
      return { status: BROWSER_LOGIN_STATUS.Cancelled }
    observed = undefined
    if (session.sid) {
      // Current New API enforces the expected sid before clearing its refresh cookie.
      await passwordLoginRequest(
        "/api/user/auth/logout",
        {},
        { "X-Auth-Session": session.sid },
      )
    } else {
      const self = await passwordLoginRequest("/api/user/self", undefined, {
        "New-Api-User": session.identity,
      })
      if (
        self.success !== true ||
        !isRecord(self.data) ||
        String(self.data.id) !== session.identity
      )
        return { status: BROWSER_LOGIN_STATUS.Cancelled }
      await passwordLoginRequest("/api/user/logout", undefined, undefined, true)
      const cached = JSON.parse(localStorage.getItem("user") || "null")
      if (isRecord(cached) && String(cached.id) === session.identity)
        localStorage.removeItem("user")
    }
    return { status: BROWSER_LOGIN_STATUS.Cancelled }
  })
}
