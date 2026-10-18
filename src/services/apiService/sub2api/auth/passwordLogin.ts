import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import {
  passwordLoginRequest,
  runPasswordLoginContentAction,
  validatePasswordLoginContext,
  validatePasswordLoginRequest,
  type PasswordLoginContentRequest,
} from "~/services/accountLogin/passwordContent"
import type { AccountLoginResult } from "~/services/apiAdapters/contracts/accountLogin"
import { SUB2API_AUTH_STORAGE_KEYS } from "~/services/apiService/sub2api/auth/browserSession"
import { normalizeSub2ApiLoginIdentity } from "~/services/apiService/sub2api/oauth/protocol"
import { isRecord } from "~/utils/core/object"

import { requiresSub2ApiPasswordVerification } from "./passwordSettings"

let observed:
  | { requestId: string; token: string; refreshToken?: string }
  | undefined

/** Native Sub2API login uses an email, not a New API username/session contract. */
export function handleSub2ApiPasswordLogin(
  request: PasswordLoginContentRequest,
  reply: (result: AccountLoginResult) => void,
): true {
  let established = false
  return runPasswordLoginContentAction(
    reply,
    async () => {
      const { credentials, expectedIdentity, requestId } =
        validatePasswordLoginRequest(request)
      const previousToken = localStorage.getItem(
        SUB2API_AUTH_STORAGE_KEYS.accessToken,
      )
      const previousRefresh = localStorage.getItem(
        SUB2API_AUTH_STORAGE_KEYS.refreshToken,
      )
      const settings = await passwordLoginRequest("/api/v1/settings/public")
      if (settings.code !== 0 || !isRecord(settings.data))
        return { status: BROWSER_LOGIN_STATUS.Failed }
      const publicSettings = settings.data
      if (requiresSub2ApiPasswordVerification(publicSettings))
        return { status: BROWSER_LOGIN_STATUS.InteractionRequired }
      const login = await passwordLoginRequest("/api/v1/auth/login", {
        email: credentials.username,
        password: credentials.password,
      })
      if (login.code !== 0 || !isRecord(login.data))
        return { status: BROWSER_LOGIN_STATUS.Failed }
      const data = login.data
      if (data.requires_2fa === true)
        return { status: BROWSER_LOGIN_STATUS.InteractionRequired }
      established = true
      if (
        typeof data.access_token !== "string" ||
        !data.access_token.trim() ||
        !isRecord(data.user)
      )
        return { status: BROWSER_LOGIN_STATUS.Uncertain }
      observed = {
        requestId,
        token: data.access_token,
        ...(typeof data.refresh_token === "string" && data.refresh_token
          ? { refreshToken: data.refresh_token }
          : {}),
      }
      const identity = normalizeSub2ApiLoginIdentity(data.user.id)
      if (identity !== expectedIdentity)
        return { status: BROWSER_LOGIN_STATUS.IdentityMismatch }
      const self = await passwordLoginRequest("/api/v1/auth/me", undefined, {
        Authorization: `Bearer ${data.access_token}`,
      })
      if (
        self.code !== 0 ||
        !isRecord(self.data) ||
        !normalizeSub2ApiLoginIdentity(self.data.id)
      )
        return { status: BROWSER_LOGIN_STATUS.Uncertain }
      if (normalizeSub2ApiLoginIdentity(self.data.id) !== identity)
        return { status: BROWSER_LOGIN_STATUS.IdentityMismatch }
      if (
        localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken) !==
          previousToken ||
        localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.refreshToken) !==
          previousRefresh
      )
        return { status: BROWSER_LOGIN_STATUS.InteractionRequired }
      localStorage.setItem(
        SUB2API_AUTH_STORAGE_KEYS.accessToken,
        data.access_token,
      )
      localStorage.setItem(
        SUB2API_AUTH_STORAGE_KEYS.authUser,
        JSON.stringify(data.user),
      )
      if (typeof data.refresh_token === "string" && data.refresh_token.trim())
        localStorage.setItem(
          SUB2API_AUTH_STORAGE_KEYS.refreshToken,
          data.refresh_token,
        )
      else localStorage.removeItem(SUB2API_AUTH_STORAGE_KEYS.refreshToken)
      if (
        typeof data.expires_in === "number" &&
        Number.isFinite(data.expires_in) &&
        data.expires_in > 0
      )
        localStorage.setItem(
          SUB2API_AUTH_STORAGE_KEYS.tokenExpiresAt,
          String(Date.now() + data.expires_in * 1000),
        )
      else localStorage.removeItem(SUB2API_AUTH_STORAGE_KEYS.tokenExpiresAt)
      return { status: BROWSER_LOGIN_STATUS.Authenticated, identity }
    },
    () => established,
  )
}

/** Revoke this issued token family, preserving a concurrently replaced website session. */
export function handleClearSub2ApiPasswordLogin(
  request: PasswordLoginContentRequest,
  reply: (result: unknown) => void,
): true {
  return runPasswordLoginContentAction(reply, async () => {
    const requestId = validatePasswordLoginContext(request)
    const session = observed
    if (session?.requestId !== requestId)
      return { status: BROWSER_LOGIN_STATUS.Cancelled }
    observed = undefined
    if (session.refreshToken)
      await passwordLoginRequest("/api/v1/auth/logout", {
        refresh_token: session.refreshToken,
      })
    if (
      localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken) ===
      session.token
    ) {
      for (const key of [
        SUB2API_AUTH_STORAGE_KEYS.accessToken,
        SUB2API_AUTH_STORAGE_KEYS.refreshToken,
        SUB2API_AUTH_STORAGE_KEYS.authUser,
        SUB2API_AUTH_STORAGE_KEYS.tokenExpiresAt,
      ])
        localStorage.removeItem(key)
    }
    return { status: BROWSER_LOGIN_STATUS.Cancelled }
  })
}
