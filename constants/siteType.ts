// 站点名称常量
import merge from "lodash-es/merge"

export const ONE_API = "one-api"
export const NEW_API = "new-api"
export const ANYROUTER = "anyrouter"
export const VELOERA = "Veloera"
export const ONE_HUB = "one-hub"
export const DONE_HUB = "done-hub"
export const VO_API = "VoAPI"
export const SUPER_API = "Super-API"
export const RIX_API = "Rix-Api"
export const NEO_API = "neo-Api"
export const WONG_GONGYI = "wong-gongyi"
export const UNKNOWN_SITE = "unknown"

export type ManagedSiteType = typeof NEW_API | typeof VELOERA

export type SiteType = (typeof SITE_TITLE_RULES)[number]["name"]

// 定义网站类型及匹配规则
export const SITE_TITLE_RULES = [
  { name: ONE_API, regex: makeTitleRegex(ONE_API) },
  { name: NEW_API, regex: makeTitleRegex(NEW_API) },
  { name: ANYROUTER, regex: /\bany\s*router\b/i },
  { name: VELOERA, regex: makeTitleRegex(VELOERA) },
  { name: ONE_HUB, regex: makeTitleRegex(ONE_HUB) },
  { name: DONE_HUB, regex: makeTitleRegex(DONE_HUB) },
  { name: VO_API, regex: makeTitleRegex(VO_API) },
  { name: SUPER_API, regex: makeTitleRegex(SUPER_API) },
  { name: RIX_API, regex: makeTitleRegex(RIX_API) },
  { name: NEO_API, regex: makeTitleRegex(NEO_API) },
  /**
   * WONG公益站 uses localized titles; match the Chinese keyword with optional spacing.
   */
  { name: WONG_GONGYI, regex: /wong\s*公益站/i },
  { name: UNKNOWN_SITE, regex: makeTitleRegex(UNKNOWN_SITE) },
]

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
const DEFAULT_CHECKIN_PATH = "/app/me"
const DEFAULT_REDEEM_PATH = "/console/topup"

// 定义各站点对应的 API 路径
export const SITE_API_ROUTER: Record<string, any> = {
  [ONE_API]: { usagePath: DEFAULT_USAGE_PATH },
  [NEW_API]: { usagePath: DEFAULT_USAGE_PATH },
  [VO_API]: { usagePath: DEFAULT_USAGE_PATH, redeemPath: "/wallet" },
  [VELOERA]: {
    usagePath: "/app/logs/api-usage",
    checkInPath: "/app/me",
    redeemPath: "/app/wallet",
  },
  [ONE_HUB]: { usagePath: "/panel/log", redeemPath: "/panel/topup" },
  [DONE_HUB]: { usagePath: "/panel/log", redeemPath: "/panel/topup" },
  [RIX_API]: { usagePath: "/log", checkInPath: "/panel", redeemPath: "/topup" },
  [ANYROUTER]: { checkInPath: "/console/topup" },
  [WONG_GONGYI]: { checkInPath: "/console/topup" },
  Default: {
    usagePath: DEFAULT_USAGE_PATH,
    checkInPath: DEFAULT_CHECKIN_PATH,
    redeemPath: DEFAULT_REDEEM_PATH,
  },
}

/**
 * 获取站点对应的 API 路由对象
 * @param key 站点名称
 * @returns 对应的 API 路由对象，否则返回 Default 的路由对象
 */
export function getSiteApiRouter(key: string) {
  return merge({}, SITE_API_ROUTER["Default"], SITE_API_ROUTER[key])
}
