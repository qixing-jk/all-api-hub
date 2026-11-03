import { SITE_TYPES, type SiteType } from "./identifiers"

/** Client budgets, not promises about a deployment's server configuration. */
export interface SiteRequestBudget {
  readonly maxConcurrentPerSite: number
  readonly requestsPerMinute: number
  readonly burst: number
}

const fallback = {
  maxConcurrentPerSite: 2,
  requestsPerMinute: 30,
  burst: 4,
} as const
const budget = (requestsPerMinute: number): SiteRequestBudget => ({
  maxConcurrentPerSite: 2,
  requestsPerMinute,
  burst: 8,
})

/**
 * Verified ordinary account API defaults with headroom for the browser.
 * Unverified forks and hosted consoles use a conservative client budget.
 * Source routes, versions and the complete type inventory: docs/agents/request-limits.md.
 */
const budgets = {
  [SITE_TYPES.ONE_API]: budget(144),
  [SITE_TYPES.NEW_API]: budget(108),
  [SITE_TYPES.APIYI]: fallback,
  [SITE_TYPES.LAOZHANG]: fallback,
  [SITE_TYPES.MODELFLARE]: fallback,
  [SITE_TYPES.ANYROUTER]: fallback,
  [SITE_TYPES.VELOERA]: fallback,
  [SITE_TYPES.ONE_HUB]: budget(90),
  [SITE_TYPES.DONE_HUB]: budget(90),
  [SITE_TYPES.V_API]: fallback,
  [SITE_TYPES.VO_API_V2]: fallback,
  [SITE_TYPES.VO_API]: fallback,
  [SITE_TYPES.SUPER_API]: fallback,
  [SITE_TYPES.RIX_API]: fallback,
  [SITE_TYPES.NEO_API]: fallback,
  [SITE_TYPES.WONG_GONGYI]: fallback,
  [SITE_TYPES.SUB2API]: budget(48),
  [SITE_TYPES.OCTOPUS]: fallback,
  [SITE_TYPES.AXON_HUB]: fallback,
  [SITE_TYPES.CLAUDE_CODE_HUB]: fallback,
  [SITE_TYPES.CLI_PROXY_API]: fallback,
  [SITE_TYPES.AIHUBMIX]: fallback,
  [SITE_TYPES.SHAREDCHAT]: fallback,
  [SITE_TYPES.FREEMODEL]: fallback,
  [SITE_TYPES.DAHL]: fallback,
  [SITE_TYPES.FOXCODE]: fallback,
  [SITE_TYPES.XIAOEN]: fallback,
  [SITE_TYPES.EMRANK]: fallback,
  [SITE_TYPES.KRILL]: fallback,
  [SITE_TYPES.CUBENCE]: fallback,
  [SITE_TYPES.RIGHT_CODE]: fallback,
  [SITE_TYPES.RELAYFOR]: fallback,
  [SITE_TYPES.REQUESTY]: fallback,
  [SITE_TYPES.OPENROUTER]: fallback,
  [SITE_TYPES.OMNIROUTE]: fallback,
  [SITE_TYPES.GPT_LOAD]: fallback,
  [SITE_TYPES.MAGPIE]: fallback,
  [SITE_TYPES.KIMI]: fallback,
  [SITE_TYPES.KIMI_GLOBAL]: fallback,
  [SITE_TYPES.DAYA]: fallback,
  [SITE_TYPES.PMAPI]: fallback,
  [SITE_TYPES.AIMLAPI]: fallback,
  [SITE_TYPES.GRSAI]: fallback,
  [SITE_TYPES.VERCEL_AI_GATEWAY]: fallback,
  [SITE_TYPES.NANOGPT]: fallback,
  [SITE_TYPES.NOVITA]: fallback,
  [SITE_TYPES.UNKNOWN]: fallback,
} satisfies Record<SiteType, SiteRequestBudget>

/** Resolves every registered type; compatibility alone never inherits an upstream rate. */
export function getSiteRequestBudget(siteType?: string): SiteRequestBudget {
  return siteType && Object.hasOwn(budgets, siteType)
    ? budgets[siteType as SiteType]
    : fallback
}
