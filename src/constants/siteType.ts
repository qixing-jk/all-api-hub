// 站点名称常量
// eslint-disable-next-line import/extensions
import merge from "lodash-es/merge.js"

export const SITE_TYPES = {
  ONE_API: "one-api",
  NEW_API: "new-api",
  ANYROUTER: "anyrouter",
  VELOERA: "Veloera",
  ONE_HUB: "one-hub",
  DONE_HUB: "done-hub",
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

export const ACCOUNT_SITE_TYPES = [
  SITE_TYPES.ONE_API,
  SITE_TYPES.NEW_API,
  SITE_TYPES.ANYROUTER,
  SITE_TYPES.VELOERA,
  SITE_TYPES.ONE_HUB,
  SITE_TYPES.DONE_HUB,
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

/**
 * Checks whether a value is one of the supported account site type identifiers.
 */
export function isAccountSiteType(value: unknown): value is AccountSiteType {
  return (
    typeof value === "string" &&
    ACCOUNT_SITE_TYPE_VALUES.includes(value as AccountSiteType)
  )
}

/**
 * Checks whether a value is one of the site types with managed-site support.
 */
export function isManagedSiteType(value: unknown): value is ManagedSiteType {
  return (
    typeof value === "string" &&
    MANAGED_SITE_TYPES.includes(value as ManagedSiteType)
  )
}

// 定义网站类型及匹配规则
export const ACCOUNT_SITE_TITLE_RULES = [
  { name: SITE_TYPES.ONE_API, regex: makeTitleRegex(SITE_TYPES.ONE_API) },
  { name: SITE_TYPES.NEW_API, regex: makeTitleRegex(SITE_TYPES.NEW_API) },
  { name: SITE_TYPES.ANYROUTER, regex: /\bany\s*router\b/i },
  { name: SITE_TYPES.VELOERA, regex: makeTitleRegex(SITE_TYPES.VELOERA) },
  { name: SITE_TYPES.ONE_HUB, regex: makeTitleRegex(SITE_TYPES.ONE_HUB) },
  { name: SITE_TYPES.DONE_HUB, regex: makeTitleRegex(SITE_TYPES.DONE_HUB) },
  { name: SITE_TYPES.VO_API, regex: makeTitleRegex(SITE_TYPES.VO_API) },
  { name: SITE_TYPES.SUPER_API, regex: makeTitleRegex(SITE_TYPES.SUPER_API) },
  { name: SITE_TYPES.RIX_API, regex: makeTitleRegex(SITE_TYPES.RIX_API) },
  { name: SITE_TYPES.NEO_API, regex: makeTitleRegex(SITE_TYPES.NEO_API) },
  /**
   * WONG公益站 uses localized titles; match the Chinese keyword with optional spacing.
   */
  { name: SITE_TYPES.WONG_GONGYI, regex: /wong\s*公益站/i },
  { name: SITE_TYPES.SUB2API, regex: makeTitleRegex(SITE_TYPES.SUB2API) },
  { name: SITE_TYPES.AIHUBMIX, regex: makeTitleRegex(SITE_TYPES.AIHUBMIX) },
  { name: SITE_TYPES.UNKNOWN, regex: makeTitleRegex(SITE_TYPES.UNKNOWN) },
] as const

export const ACCOUNT_SITE_DOMAIN_RULES = [
  {
    name: SITE_TYPES.AIHUBMIX,
    // Domain-first detection avoids treating AIHubMix as a generic
    // One-API/New-API compatible site based on page title or fallback probes.
    hostnames: ["aihubmix.com", "www.aihubmix.com", "console.aihubmix.com"],
  },
] as const

/**
 * 根据站点名生成正则
 * - 自动处理连字符替换成 [-_ ]?
 * - 加上单词边界 \b，避免误匹配
 */
function makeTitleRegex(name: string): RegExp {
  const pattern = name.replace("-", "[-_ ]?")
  return new RegExp(`\\b${pattern}\\b`, "i")
}

// 默认的用量路径
const DEFAULT_USAGE_PATH = "/console/log"
const DEFAULT_CHECKIN_PATH = "/console/personal"
const DEFAULT_REDEEM_PATH = "/console/topup"
const DEFAULT_ADMIN_CREDENTIALS_PATH = DEFAULT_CHECKIN_PATH
const DEFAULT_SITE_ANNOUNCEMENTS_PATH = "/"

interface SiteRouteConfig {
  usagePath: string
  checkInPath: string
  adminCredentialsPath: string
  redeemPath: string
  siteAnnouncementsPath: string
}

// 定义各站点对应的 API 路径
const SITE_ROUTE_CONFIGS: Partial<
  Record<AccountSiteType, Partial<SiteRouteConfig>>
> & {
  Default: SiteRouteConfig
} = {
  [SITE_TYPES.ONE_API]: { usagePath: DEFAULT_USAGE_PATH },
  [SITE_TYPES.NEW_API]: {
    usagePath: DEFAULT_USAGE_PATH,
    checkInPath: "/console/personal",
    adminCredentialsPath: "/console/personal",
  },
  [SITE_TYPES.VO_API]: { usagePath: DEFAULT_USAGE_PATH, redeemPath: "/wallet" },
  [SITE_TYPES.VELOERA]: {
    usagePath: "/app/logs/api-usage",
    checkInPath: "/app/me",
    redeemPath: "/app/wallet",
    adminCredentialsPath: "/app/me",
  },
  [SITE_TYPES.ONE_HUB]: {
    usagePath: "/panel/log",
    redeemPath: "/panel/topup",
    adminCredentialsPath: "/panel/profile",
  },
  [SITE_TYPES.DONE_HUB]: {
    usagePath: "/panel/log",
    redeemPath: "/panel/topup",
    adminCredentialsPath: "/panel/profile",
  },
  [SITE_TYPES.RIX_API]: {
    usagePath: "/log",
    checkInPath: "/panel",
    redeemPath: "/topup",
  },
  [SITE_TYPES.ANYROUTER]: { checkInPath: "/console/topup" },
  [SITE_TYPES.WONG_GONGYI]: { checkInPath: "/console/topup" },
  [SITE_TYPES.SUB2API]: {
    usagePath: "/usage",
    redeemPath: "/redeem",
    siteAnnouncementsPath: "/dashboard",
  },
  Default: {
    usagePath: DEFAULT_USAGE_PATH,
    checkInPath: DEFAULT_CHECKIN_PATH,
    adminCredentialsPath: DEFAULT_ADMIN_CREDENTIALS_PATH,
    redeemPath: DEFAULT_REDEEM_PATH,
    siteAnnouncementsPath: DEFAULT_SITE_ANNOUNCEMENTS_PATH,
  },
}

/**
 * 获取站点对应的路径配置对象
 * @param key 站点名称
 * @returns 对应的路径配置对象，否则返回 Default 的路径配置对象
 */
export function getSiteRouteConfigForKey(key: AccountSiteType) {
  return merge({}, SITE_ROUTE_CONFIGS["Default"], SITE_ROUTE_CONFIGS[key])
}

/**
 * 获取账号站点对应的 API 路由对象
 * @param accountSiteType 账号站点类型
 * @returns 对应的 API 路由对象，否则返回 Default 的路由对象
 */
export function getAccountSiteApiRouter(accountSiteType: AccountSiteType) {
  return getSiteRouteConfigForKey(accountSiteType)
}
