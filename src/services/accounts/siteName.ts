import {
  ACCOUNT_SITE_TITLE_RULES,
  isAccountSiteType,
  SITE_TYPES,
} from "~/constants/siteType"
import type { AccountBootstrapFacts } from "~/services/apiAdapters/contracts/accountBootstrap"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { AuthTypeEnum } from "~/types"
import { getRegistrableDomain } from "~/utils/core/domain"

/**
 * 提取可注册域名的名称部分供 UI 显示默认站点名使用；无可注册域名时保留主机名。
 * @param hostname 待分析的主机名
 * @returns 规范化后的前缀并首字母大写
 */
export function extractDomainPrefix(hostname: string): string {
  if (!hostname) return ""

  const domain = getRegistrableDomain(hostname)
  const name = domain ? domain.split(".")[0] : hostname
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * 判断站点名称是否仍是默认标题（如“未知站点”），用于决定是否替换。
 * @param siteName 待检测的站点名称
 * @returns true 表示不是默认名称
 */
function isNotDefaultSiteName(siteName: string): boolean {
  return !ACCOUNT_SITE_TITLE_RULES.some(
    (rule) => rule.name !== SITE_TYPES.UNKNOWN && rule.regex.test(siteName),
  )
}

/**
 * 根据 Tab、URL 或站点状态信息推断最终展示的站点名称。
 * @param input 可能为浏览器 Tab 对象或字符串 URL
 * @param siteTypeHint Optional site-type hint so site-specific API overrides can
 * be used when resolving the display name.
 * @param bootstrapFacts Optional pre-fetched facts; null marks a completed empty lookup and avoids a redundant request.
 * @returns 计算后的站点名称
 */
export async function getSiteName(
  input: browser.tabs.Tab | string,
  siteTypeHint?: string,
  bootstrapFacts?: AccountBootstrapFacts | null,
): Promise<string> {
  // 1. 统一提取信息
  const urlString = typeof input === "string" ? input : input.url ?? ""
  const tabTitle = typeof input === "string" ? null : input.title

  // 2. 优先从 Tab 标题获取
  if (tabTitle && isNotDefaultSiteName(tabTitle)) {
    return tabTitle
  }

  // 3. 解析 URL
  let urlObj: URL
  try {
    urlObj = new URL(urlString)
  } catch {
    return urlString.split("/")[0] || ""
  }
  const hostWithProtocol = `${urlObj.protocol}//${urlObj.host}`

  // 4. 仅在已知 siteType 时才请求站点状态，避免为未知站点增加额外探测请求。
  if (siteTypeHint) {
    let resolvedFacts = bootstrapFacts
    if (
      resolvedFacts === undefined &&
      siteTypeHint &&
      isAccountSiteType(siteTypeHint)
    ) {
      try {
        const accountBootstrap =
          getSiteTypeCapabilities(siteTypeHint).account?.bootstrap
        resolvedFacts = accountBootstrap
          ? await accountBootstrap.loadBootstrapFacts({
              baseUrl: hostWithProtocol,
              auth: {
                authType: AuthTypeEnum.None,
              },
            })
          : null
      } catch {
        resolvedFacts = null
      }
    }
    if (
      resolvedFacts?.displayName &&
      isNotDefaultSiteName(resolvedFacts.displayName)
    ) {
      return resolvedFacts.displayName
    }
  }

  // 5. 最后从域名获取
  return extractDomainPrefix(urlObj.hostname)
}
