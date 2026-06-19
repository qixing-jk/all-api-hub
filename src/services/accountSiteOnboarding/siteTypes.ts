export const SITE_TYPES = {
  ONE_API: "one-api",
  NEW_API: "new-api",
  ANYROUTER: "anyrouter",
  VELOERA: "Veloera",
  ONE_HUB: "one-hub",
  DONE_HUB: "done-hub",
  V_API: "v-api",
  VO_API: "VoAPI",
  SUPER_API: "Super-API",
  RIX_API: "Rix-Api",
  NEO_API: "neo-Api",
  WONG_GONGYI: "wong-gongyi",
  SUB2API: "sub2api",
  OCTOPUS: "octopus",
  AXON_HUB: "axonhub",
  CLAUDE_CODE_HUB: "claude-code-hub",
  AIHUBMIX: "AIHubMix",
  UNKNOWN: "unknown",
} as const

export const AIHUBMIX_API_ORIGIN = "https://aihubmix.com"
export const AIHUBMIX_WEB_ORIGIN = "https://console.aihubmix.com"
export const AIHUBMIX_LOGIN_PATH = "/sign-in"
export const AIHUBMIX_HOSTNAMES = [
  "aihubmix.com",
  "www.aihubmix.com",
  "console.aihubmix.com",
] as const

export const ACCOUNT_SITE_TYPES = [
  SITE_TYPES.ONE_API,
  SITE_TYPES.NEW_API,
  SITE_TYPES.ANYROUTER,
  SITE_TYPES.VELOERA,
  SITE_TYPES.ONE_HUB,
  SITE_TYPES.DONE_HUB,
  SITE_TYPES.V_API,
  SITE_TYPES.VO_API,
  SITE_TYPES.SUPER_API,
  SITE_TYPES.RIX_API,
  SITE_TYPES.NEO_API,
  SITE_TYPES.WONG_GONGYI,
  SITE_TYPES.SUB2API,
  SITE_TYPES.AIHUBMIX,
  SITE_TYPES.UNKNOWN,
] as const

export type AccountSiteType = (typeof ACCOUNT_SITE_TYPES)[number]

export const ACCOUNT_SITE_TYPE_VALUES = [...ACCOUNT_SITE_TYPES]

export const MANAGED_SITE_TYPES = [
  SITE_TYPES.NEW_API,
  SITE_TYPES.VELOERA,
  SITE_TYPES.DONE_HUB,
  SITE_TYPES.OCTOPUS,
  SITE_TYPES.AXON_HUB,
  SITE_TYPES.CLAUDE_CODE_HUB,
] as const

export type ManagedSiteType = (typeof MANAGED_SITE_TYPES)[number]
