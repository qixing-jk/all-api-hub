import type { Sub2ApiPublicSettingsData } from "../type"

const PROVIDER_SETTINGS = {
  github: { enabled: "github_oauth_enabled", label: "GitHub" },
  google: { enabled: "google_oauth_enabled", label: "Google" },
  linuxdo: { enabled: "linuxdo_oauth_enabled", label: "Linux DO" },
  oidc: { enabled: "oidc_oauth_enabled", label: "OIDC" },
  dingtalk: { enabled: "dingtalk_oauth_enabled", label: "DingTalk" },
  wechat: { enabled: "wechat_oauth_open_enabled", label: "WeChat" },
} as const

export type Sub2ApiOAuthProvider = keyof typeof PROVIDER_SETTINGS

const COMPLETION_PATH = "/dashboard"
const COMPLETION_REQUEST_PARAM = "all_api_hub_login"

/** Restricts backend start routes to the implemented OAuth providers. */
export function isSub2ApiOAuthProvider(
  value: unknown,
): value is Sub2ApiOAuthProvider {
  return typeof value === "string" && Object.hasOwn(PROVIDER_SETTINGS, value)
}

/**
 * PublicSettings advertises enabled providers, without client IDs or authorize URLs.
 * Wei-Shaw/sub2api@881f320: dto/settings.go and frontend/src/api/auth.ts.
 * Extensions use WeChat's external-browser "open" mode, never MP/mobile modes;
 * an old aggregate WeChat flag alone does not establish that capability.
 */
export function discoverSub2ApiOAuthMethods(
  settings: Sub2ApiPublicSettingsData,
  providers: readonly Sub2ApiOAuthProvider[],
) {
  return providers.flatMap((id) => {
    const provider = PROVIDER_SETTINGS[id]
    if (settings[provider.enabled] !== true) return []
    const oidcName =
      typeof settings.oidc_oauth_provider_name === "string"
        ? settings.oidc_oauth_provider_name.trim()
        : ""
    return [
      { id, label: id === "oidc" && oidcName ? oidcName : provider.label },
    ]
  })
}

/** Action CAPTCHA belongs to the website's interactive OAuth start form. */
export function requiresSub2ApiOAuthInteraction(
  settings: Sub2ApiPublicSettingsData,
): boolean {
  // LoginView.vue / auth_oauth_captcha_start.go: Tencent/Aliyun gate OAuth starts;
  // the ordinary Turnstile login flag does not gate the GET OAuth route.
  return (
    settings.tencent_captcha_enabled === true ||
    settings.aliyun_captcha_enabled === true
  )
}

/** Binds the post-login page to this operation, rather than an existing dashboard. */
function completionUrl(origin: string, requestId: string): URL {
  const url = new URL(COMPLETION_PATH, origin)
  url.searchParams.set(COMPLETION_REQUEST_PARAM, requestId)
  return url
}

/**
 * The site's backend owns state cookies, PKCE and the provider authorization URL.
 * Wei-Shaw/sub2api@881f320: frontend/src/api/auth.ts and server/routes/auth.go.
 * A top-level GET preserves redirect/cookie semantics across old and new callbacks.
 */
export function buildSub2ApiOAuthStartUrl(
  origin: string,
  provider: Sub2ApiOAuthProvider,
  requestId: string,
): string {
  const redirect = completionUrl(origin, requestId)
  const start = new URL("/api/v1/auth/oauth/" + provider + "/start", origin)
  start.searchParams.set("redirect", redirect.pathname + redirect.search)
  start.searchParams.set("intent", "login")
  if (provider === "wechat") start.searchParams.set("mode", "open")
  return start.href
}

/** Accepts only the exact same-origin redirect requested by this login. */
export function isSub2ApiOAuthCompletionUrl(
  url: URL,
  origin: string,
  requestId: string,
): boolean {
  return url.href === completionUrl(origin, requestId).href
}

/** Sub2API user IDs are positive integers, not usernames or cached display names. */
export function normalizeSub2ApiLoginIdentity(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null
  }
  if (typeof value !== "string") return null
  const id = value.trim()
  return /^[1-9]\d*$/.test(id) ? id : null
}
