import { passwordLoginRequest } from "~/services/accountLogin/passwordContent"
import {
  enterPasswordLogin,
  handlePasswordUi,
  type PasswordUiReply,
  type PasswordUiRequest,
  type PasswordUiSession,
} from "~/services/accountLogin/passwordUi"
import {
  isAgentRouterLoginUrl,
  isAgentRouterSystemName,
} from "~/services/accountLogin/providers/agentrouter/config"
import { parseNewApiDashboardAuthBundleResponse } from "~/services/apiService/newApi/dashboardAuth"
import { fetchBrowserOAuthRequest } from "~/services/browserOAuth/contentRequest"
import { isRecord } from "~/utils/core/object"

let bundle: { token: string; sid: string; identity: string } | undefined
/** Verify the current website session; auth material stays in this document. */
async function readSession(): Promise<PasswordUiSession | null> {
  const cached = JSON.parse(localStorage.getItem("user") || "null")
  const headers: Record<string, string> = bundle
    ? { Authorization: `Bearer ${bundle.token}` }
    : cached?.id != null
      ? { "New-Api-User": String(cached.id) }
      : {}
  const response = await fetchBrowserOAuthRequest("/api/user/self", { headers })
  if (response.ok) {
    const self = await response.json()
    if (self.success === true && isRecord(self.data) && self.data.id != null)
      return {
        identity: String(self.data.id),
        ...(typeof self.data.checked_in === "boolean"
          ? { checkedIn: self.data.checked_in }
          : String(cached?.id) === String(self.data.id) &&
              typeof cached?.checked_in === "boolean"
            ? { checkedIn: cached.checked_in }
            : {}),
      }
    if (self.success === false && !cached?.id) return null
    throw new Error("Invalid session")
  }
  if (response.status !== 401) throw new Error("Session unavailable")
  if (bundle) return null
  // Modern New API holds the bearer in the page's memory. Adopt its cookie
  // session once per document and keep all auth material inside this context.
  const refresh = await fetchBrowserOAuthRequest(
    "/api/user/auth/refresh",
    { method: "POST" },
    { mutationRisk: true },
  )
  if ([401, 404, 405].includes(refresh.status)) return null
  if (!refresh.ok) throw new Error("Session unavailable")
  const parsed = parseNewApiDashboardAuthBundleResponse(await refresh.json())
  if (parsed.kind !== "valid") throw new Error("Invalid session")
  bundle = {
    token: parsed.bundle.token,
    sid: parsed.bundle.sessionId,
    identity: String(parsed.bundle.user.id),
  }
  return readSession()
}
/** Revoke the observed site session without clearing a newer local identity. */
async function logout() {
  const previousUser = localStorage.getItem("user")
  if (bundle) {
    const result = await passwordLoginRequest(
      "/api/user/auth/logout",
      {},
      { "X-Auth-Session": bundle.sid },
    )
    if (result.success !== true) throw new Error("Logout failed")
  } else {
    const response = await fetchBrowserOAuthRequest(
      "/api/user/logout",
      {},
      { mutationRisk: true },
    )
    if (!response.ok || (await response.json()).success !== true)
      throw new Error("Logout failed")
  }
  bundle = undefined
  if (localStorage.getItem("user") !== previousUser)
    throw new Error("Session changed")
  localStorage.removeItem("user")
}
/** Runs native New API forms, including the canonical AgentRouter deployment. */
export function handleNewApiPasswordUi(
  request: PasswordUiRequest,
  reply: (result: PasswordUiReply) => void,
): true {
  return handlePasswordUi(request, reply, {
    readSession,
    logout,
    // Legacy New API (including AgentRouter) shows this choice when OAuth is
    // configured; the v1 frontend renders the password form alongside OAuth.
    enterPasswordLogin: () =>
      enterPasswordLogin([
        "使用 邮箱或用户名 登录",
        "Sign in with Email or Username",
        "使用 信箱或使用者名 登錄",
        "メールアドレスまたはユーザー名でログイン",
        "Connectez-vous avec votre e-mail ou votre nom d'utilisateur",
        "Войти с email или именем пользователя",
        "Đăng nhập bằng Email hoặc Tên người dùng",
      ]),
    async settings() {
      const status = await passwordLoginRequest("/api/status")
      if (status.success !== true || !isRecord(status.data))
        throw new Error("Invalid status")
      return {
        enabled:
          status.data.password_login_enabled !== false &&
          (!isAgentRouterLoginUrl(location.href) ||
            isAgentRouterSystemName(status.data.system_name)),
        verification: status.data.turnstile_check === true,
      }
    },
  })
}
