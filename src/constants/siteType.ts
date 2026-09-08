// 站点名称常量

import {
  ACCOUNT_SITE_TYPE_VALUES,
  MANAGED_SITE_TYPES,
  type AccountSiteType,
  type ManagedSiteType,
} from "~/services/accountSiteDefinitions/siteTypes"
import {
  getAccountSiteDomainRuleMetadata,
  getAccountSiteRouteMetadata,
  getAccountSiteTitleRuleMetadata,
} from "~/services/accountSiteOnboarding/metadata"

export { ACCOUNT_SITE_ADAPTER_FAMILIES } from "~/services/accountSiteDefinitions/contracts"
export {
  ACCOUNT_SITE_TYPES,
  ACCOUNT_SITE_TYPE_VALUES,
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_WEB_ORIGIN,
  MANAGED_SITE_TYPES,
  OPENROUTER_HOSTNAMES,
  OPENROUTER_WEB_ORIGIN,
  SHAREDCHAT_HOSTNAMES,
  SITE_TYPES,
  type AccountSiteType,
  type ManagedSiteType,
  type SiteType,
} from "~/services/accountSiteDefinitions/siteTypes"

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
 * 获取站点显式声明的页面路径（null 表示未提供页面导航）
 * @param key 站点名称
 * @returns 仅未知或无效类型使用未知站点的兜底配置
 */
export function getSiteRouteConfigForKey(key: unknown) {
  return getAccountSiteRouteMetadata(key)
}

/**
 * 获取账号站点对应的页面路径配置
 * @param accountSiteType 账号站点类型
 * @returns 完整页面路径配置；仅未知或无效类型使用兜底配置
 */
export function getAccountSiteApiRouter(accountSiteType: unknown) {
  return getSiteRouteConfigForKey(accountSiteType)
}
