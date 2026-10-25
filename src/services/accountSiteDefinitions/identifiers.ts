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
  LAOZHANG: "laozhang",
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
  FREEMODEL: "freemodel",
  DAHL: "dahl",
  FOXCODE: "foxcode",
  XIAOEN: "xiaoen",
  EMRANK: "emrank",
  KRILL: "krill",
  CUBENCE: "cubence",
  RIGHT_CODE: "RightCode",
  RELAYFOR: "relayfor",
  REQUESTY: "requesty",
  OPENROUTER: "openrouter",
  OMNIROUTE: "omniroute",
  GPT_LOAD: "gpt-load",
  MAGPIE: "magpie",
  KIMI: "kimi",
  KIMI_GLOBAL: "kimi-global",
  DAYA: "daya",
  GRSAI: "grsai",
  UNKNOWN: "unknown",
} as const

export type SiteType = (typeof SITE_TYPES)[keyof typeof SITE_TYPES]

export const APIYI_HOSTNAME = "api.apiyi.com"

// Official console/API routes: docs.laozhang.ai/api-manual and the console's
// /api/status CustomAppList. Same account/System token verified 2026-10-05.
export const LAOZHANG_HOSTNAMES = [
  "api.laozhang.ai",
  "api2.laozhang.ai",
  "api-vip.laozhang.ai",
  "api-cf.laozhang.ai",
] as const

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

export const FREEMODEL_HOSTNAMES = ["freemodel.dev"] as const
export const DAHL_HOSTNAMES = ["inference.dahl.global"] as const
export const DAHL_WEB_ORIGIN = "https://inference.dahl.global"
/** FoxCode's logged-in console; its official inference routes are separate origins. */
export const FOXCODE_HOSTNAMES = ["foxcode.rjj.cc"] as const
export const FOXCODE_WEB_ORIGIN = "https://foxcode.rjj.cc"
/** Cookie sessions remain bound to the requested console, not the public migration domain. */
export const XIAOEN_HOSTNAMES = ["free.supxh.xin"] as const
export const XIAOEN_WEB_ORIGIN = "https://free.supxh.xin"
/**
 * EMRank serves the console, its `/api/*` account routes and the `/v1`
 * inference gateway from one origin; `docs.emrank.tech` and
 * `status.emrank.tech` are documentation/status only and never console
 * aliases. Verified 2026-10-16 on https://emrank.tech.
 */
export const EMRANK_HOSTNAMES = ["emrank.tech"] as const
export const EMRANK_WEB_ORIGIN = "https://emrank.tech"
export const EMRANK_DISPLAY_NAME = "EMRank"
/** OpenAI-compatible mount used by native SDK examples in the docs. */
export const EMRANK_API_BASE_URL = `${EMRANK_WEB_ORIGIN}/v1`
export const FOXCODE_INFERENCE_ORIGIN = "https://code1.newcli.com"
export const CUBENCE_HOSTNAMES = ["cubence.com"] as const
export const CUBENCE_WEB_ORIGIN = "https://cubence.com"
export const CUBENCE_API_ORIGIN = "https://api.cubence.com"
export const FREEMODEL_WEB_ORIGIN = "https://freemodel.dev"
export const FREEMODEL_OPENAI_BASE_URL = "https://api.freemodel.dev/v1"
export const FREEMODEL_ANTHROPIC_BASE_URL = "https://cc.freemodel.dev"

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

export const RELAYFOR_HOSTNAMES = ["relayfor.xyz"] as const
export const RELAYFOR_DISPLAY_NAME = "RelayFor"
export const RELAYFOR_LOGIN_PATH = "/auth/?mode=login"

/**
 * Requesty is a closed-source hosted LLM gateway. `app.requesty.ai` is the only
 * console (Clerk login); `api-v2.requesty.ai` serves the documented management
 * API under `/v1/manage/*` (Bearer manage key) and undocumented Clerk-session
 * console routes under `/v1/*`; `router.requesty.ai` is the OpenAI-compatible
 * inference gateway. `router.eu.requesty.ai` is a data-residency inference
 * variant, not an account alias. Domain roles: docs.requesty.ai/llms.txt,
 * verified 2026-10-21.
 */
export const REQUESTY_HOSTNAMES = ["app.requesty.ai"] as const
export const REQUESTY_DISPLAY_NAME = "Requesty"
export const REQUESTY_WEB_ORIGIN = "https://app.requesty.ai"
/** Management API host; requests must use absolute URLs against this origin. */
export const REQUESTY_MANAGE_API_ORIGIN = "https://api-v2.requesty.ai"
/** Public OpenAI-compatible inference gateway and model catalog origin. */
export const REQUESTY_API_BASE_URL = "https://router.requesty.ai/v1"

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

/**
 * Krill AI serves one console origin. `www.krill-ai.net` is the public entry
 * address and redirects to `www.krill-code.com/app`; the console session,
 * account API and saved account all live on the redirect target, so that is
 * the storage/duplicate origin. The `api*.krill-ai.net` and
 * `api.cdn-krill-ai.com` hosts are inference-only routes (advertised by
 * `GET /api/endpoint-settings/me`) and stay out of console detection.
 * Verified 2026-10-14.
 */
export const KRILL_HOSTNAMES = [
  "www.krill-code.com",
  "www.krill-ai.net",
] as const
export const KRILL_DISPLAY_NAME = "Krill AI"
/** Console origin owning the Cookie session and every `/api/*` account route. */
export const KRILL_WEB_ORIGIN = "https://www.krill-code.com"
/**
 * Default OpenAI-compatible export base URL: the provider's own `直连`
 * (overseas) route. The `均衡`/`cdn` routes are equivalent alternatives the
 * user can pick in the native console; the extension never falls back across
 * them automatically.
 */
export const KRILL_API_BASE_URL = "https://api.krill-ai.net/v1"

/**
 * Daya API (答鸭API) serves the console, account API and session on one origin.
 * The `.dayaai.com` Cookie domain also reaches the apex `dayaai.com` site ("去
 * AI 站"), but that is a separate AI chat product with unverified account
 * equivalence, so it stays out of console detection. `daya.to` and
 * `api-us.dayaai.com` are inference-only endpoints from `/api/v1/settings/public`.
 * Verified 2026-10-20.
 */
export const DAYA_HOSTNAMES = ["api.dayaai.com"] as const
export const DAYA_DISPLAY_NAME = "Daya API"
/** Console origin owning the `daya_sid` Cookie session and every `/api/v1/*` account route. */
export const DAYA_WEB_ORIGIN = "https://api.dayaai.com"
/**
 * Default OpenAI-compatible export base URL: the site's own 默认端点. The
 * 备用/回国 endpoints are equivalent alternatives the user picks in the native
 * console; the extension never falls back across them automatically.
 */
export const DAYA_API_BASE_URL = "https://daya.to/v1"
