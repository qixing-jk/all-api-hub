// 站点名称常量
// eslint-disable-next-line import/extensions
import merge from "lodash-es/merge.js"

import {
  DEFAULT_SITE_ROUTE_CONFIG,
  getAccountSiteDomainRuleMetadata,
  getAccountSiteRouteOverrideMetadata,
  getAccountSiteTitleRuleMetadata,
} from "~/services/accountSiteOnboarding/metadata"
import {
  ACCOUNT_SITE_TYPE_VALUES,
  MANAGED_SITE_TYPES,
  type AccountSiteType,
  type ManagedSiteType,
} from "~/services/accountSiteOnboarding/siteTypes"

export {
  ACCOUNT_SITE_TYPES,
  ACCOUNT_SITE_TYPE_VALUES,
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_LOGIN_PATH,
  AIHUBMIX_WEB_ORIGIN,
  MANAGED_SITE_TYPES,
  SITE_TYPES,
  type AccountSiteType,
  type ManagedSiteType,
} from "~/services/accountSiteOnboarding/siteTypes"

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
export const ACCOUNT_SITE_TITLE_RULES = getAccountSiteTitleRuleMetadata()

export const ACCOUNT_SITE_DOMAIN_RULES = getAccountSiteDomainRuleMetadata()

/**
 * 获取站点对应的路径配置对象
 * @param key 站点名称
 * @returns 对应的路径配置对象，否则返回 Default 的路径配置对象
 */
export function getSiteRouteConfigForKey(key: AccountSiteType) {
  return merge(
    {},
    DEFAULT_SITE_ROUTE_CONFIG,
    getAccountSiteRouteOverrideMetadata(key),
  )
}

/**
 * 获取账号站点对应的 API 路由对象
 * @param accountSiteType 账号站点类型
 * @returns 对应的 API 路由对象，否则返回 Default 的路由对象
 */
export function getAccountSiteApiRouter(accountSiteType: AccountSiteType) {
  return getSiteRouteConfigForKey(accountSiteType)
}
