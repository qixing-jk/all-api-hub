import { passwordLoginRequest } from "~/services/accountLogin/passwordContent"
import {
  handlePasswordUi,
  type PasswordUiReply,
  type PasswordUiRequest,
  type PasswordUiSession,
} from "~/services/accountLogin/passwordUi"
import {
  clearSub2ApiBrowserSession,
  SUB2API_AUTH_STORAGE_KEYS,
} from "~/services/apiService/sub2api/auth/browserSession"
import { fetchBrowserOAuthRequest } from "~/services/browserOAuth/contentRequest"
import { isRecord } from "~/utils/core/object"

import { requiresSub2ApiPasswordVerification } from "./passwordSettings"

/** Verify the website bearer without rotating or exporting it. */
async function readSession(): Promise<PasswordUiSession | null> {
  const token = localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken)
  if (!token) return null
  const response = await fetchBrowserOAuthRequest("/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401) return null
  if (!response.ok) throw new Error("Session unavailable")
  const body = await response.json()
  if (
    body.code !== 0 ||
    !isRecord(body.data) ||
    body.data.id == null ||
    localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken) !== token
  )
    throw new Error("Invalid session")
  return { identity: String(body.data.id) }
}
/** Runs the shared native UI flow with Sub2API session semantics. */
export function handleSub2ApiPasswordUi(
  request: PasswordUiRequest,
  reply: (result: PasswordUiReply) => void,
): true {
  return handlePasswordUi(request, reply, {
    readSession,
    async logout() {
      const token = localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken)
      const refresh = localStorage.getItem(
        SUB2API_AUTH_STORAGE_KEYS.refreshToken,
      )
      const result = await passwordLoginRequest(
        "/api/v1/auth/logout",
        refresh ? { refresh_token: refresh } : {},
      )
      if (result.code !== 0) throw new Error("Logout failed")
      if (
        localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken) !== token ||
        localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.refreshToken) !== refresh
      )
        throw new Error("Session changed")
      clearSub2ApiBrowserSession()
    },
    async settings() {
      const settings = await passwordLoginRequest("/api/v1/settings/public")
      if (settings.code !== 0 || !isRecord(settings.data))
        throw new Error("Invalid settings")
      const data = settings.data
      return {
        enabled: true,
        verification: requiresSub2ApiPasswordVerification(data),
      }
    },
  })
}
