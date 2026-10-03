/**
 * Registered site-type names and the addresses the site definitions need.
 *
 * IMPORTANT: `wxt.config.ts` imports this module by relative path, so it is
 * evaluated by jiti before the bundler resolves aliases. This module must stay
 * free of `~/` imports — adding one breaks `pnpm dev` and `pnpm build` while
 * unit tests and `tsc` stay green. Per-deployment addresses live in
 * `~/constants/deploymentApiOrigins`, which consumers import directly.
 */
export const SITE_TYPES = {
  ONE_API: "one-api",
  NEW_API: "new-api",
  APIYI: "apiyi",
  MODELFLARE: "ModelFlare",
  ANYROUTER: "anyrouter",
  VELOERA: "Veloera",
  ONE_HUB: "one-hub",
  DONE_HUB: "done-hub",
  V_API: "v-api",
  VO_API_V2: "voapi-v2",
  VO_API: "VoAPI",
  SUPER_API: "Super-API",
  RIX_API: "Rix-Api",
  NEO_API: "neo-Api",
  WONG_GONGYI: "wong-gongyi",
  SUB2API: "sub2api",
  OCTOPUS: "octopus",
  AXON_HUB: "axonhub",
  CLAUDE_CODE_HUB: "claude-code-hub",
  CLI_PROXY_API: "cli-proxy-api",
  AIHUBMIX: "AIHubMix",
  SHAREDCHAT: "sharedchat",
  RIGHT_CODE: "RightCode",
  OPENROUTER: "openrouter",
  OMNIROUTE: "omniroute",
  KIMI: "kimi",
  KIMI_GLOBAL: "kimi-global",
  GRSAI: "grsai",
  UNKNOWN: "unknown",
} as const

export type SiteType = (typeof SITE_TYPES)[keyof typeof SITE_TYPES]

export const APIYI_HOSTNAME = "api.apiyi.com"

export const AGENT_ROUTER_ORIGIN = "https://agentrouter.org"

export const MODELFLARE_HOSTNAME = "modelflare.dev"

/**
 * ModelFlare's New API-derived account endpoints expect the user id in this
 * deployment-specific header: https://modelflare.dev/
 */
export const MODELFLARE_USER_ID_HEADER_NAME = "X-ModelFlare-User"

export const AIHUBMIX_API_ORIGIN = "https://aihubmix.com"
export const AIHUBMIX_WEB_ORIGIN = "https://console.aihubmix.com"
export const AIHUBMIX_LOGIN_PATH = "/sign-in"
export const AIHUBMIX_HOSTNAMES = [
  "aihubmix.com",
  "www.aihubmix.com",
  "console.aihubmix.com",
] as const

export const SHAREDCHAT_HOSTNAMES = ["new.sharedchat.cc"] as const
export const SHAREDCHAT_WEB_ORIGIN = "https://new.sharedchat.cc"

/**
 * Right Code is served on three equivalent domains that share one account
 * database; the account is stored against whichever host it was detected on.
 * https://www.right.codes, https://right.codes and https://rightapi.ai
 */
export const RIGHTCODE_HOSTNAMES = [
  "right.codes",
  "www.right.codes",
  "rightapi.ai",
] as const
export const RIGHTCODE_DISPLAY_NAME = "RightCode"
export const RIGHTCODE_LOGIN_PATH = "/login"

export const OPENROUTER_HOSTNAMES = ["openrouter.ai"] as const

export const KIMI_HOSTNAMES = ["platform.kimi.com"] as const
export const KIMI_GLOBAL_HOSTNAMES = ["platform.kimi.ai"] as const
export const KIMI_DISPLAY_NAME = "Kimi"
export const KIMI_GLOBAL_DISPLAY_NAME = "Kimi Global"
export const KIMI_CONSOLE_ORIGIN = "https://platform.kimi.com"
export const KIMI_GLOBAL_CONSOLE_ORIGIN = "https://platform.kimi.ai"
export const KIMI_API_BASE_URL = "https://api.moonshot.cn/v1"
export const KIMI_GLOBAL_API_BASE_URL = "https://api.moonshot.ai/v1"
export const OPENROUTER_DISPLAY_NAME = "OpenRouter"
export const OPENROUTER_WEB_ORIGIN = "https://openrouter.ai"
export const OPENROUTER_API_BASE_URL = `${OPENROUTER_WEB_ORIGIN}/api/v1`

/** Returns whether the supplied URL belongs to the canonical OpenRouter origin. */
export function isCanonicalOpenRouterUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim())
    return (
      parsed.protocol === "https:" && parsed.origin === OPENROUTER_WEB_ORIGIN
    )
  } catch {
    return false
  }
}

/**
 * Grsai serves one account database from two equivalent console domains:
 * https://grsai.com and https://grsai.ai (the domain its own document links
 * use). `www.grsai.com` redirects to the canonical origin and `www.grsai.ai`
 * does not resolve, so neither needs its own entry.
 */
export const GRSAI_HOSTNAMES = ["grsai.com", "grsai.ai"] as const
export const GRSAI_DISPLAY_NAME = "Grsai"
/**
 * Console (account, key and model) API. The console origin itself only serves
 * the Next.js frontend; every data call goes to this host.
 */
export const GRSAI_CONSOLE_API_ORIGIN = "https://eb.grsaiapi.com"
/**
 * OpenAI-compatible endpoint the account's `sk-` keys are used against, taken
 * from the console's own node information (overseas host). The deployment has no
 * `GET /v1/models`, so the model catalog comes from the console API instead.
 */
export const GRSAI_API_BASE_URL = "https://grsaiapi.com/v1"
/** Settings entry of the account whose keys carry the credits. */
export const GRSAI_ACCOUNT_PATH = "/dashboard"
