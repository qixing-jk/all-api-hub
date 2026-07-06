export const SITE_TYPES = {
  ONE_API: "one-api",
  NEW_API: "new-api",
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
  AIHUBMIX: "AIHubMix",
  SHAREDCHAT: "sharedchat",
  UNKNOWN: "unknown",
} as const

export type SiteType = (typeof SITE_TYPES)[keyof typeof SITE_TYPES]

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
