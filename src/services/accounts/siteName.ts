import { ACCOUNT_SITE_TITLE_RULES, SITE_TYPES } from "~/constants/siteType"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"

/**
 * 提取域名关键部分（排除 www 与常见双后缀）供 UI 显示默认站点名使用。
 * @param hostname 待分析的主机名
 * @returns 规范化后的前缀并首字母大写
 */
export function extractDomainPrefix(hostname: string): string {
  if (!hostname) return ""

  // 移除 www. 前缀
  const withoutWww = hostname.replace(/^www\./, "")

  // 处理子域名情况，例如：xxx.xx.google.com -> google
  const parts = withoutWww.split(".")
  if (parts.length >= 2) {
    // 如果是常见的二级域名（如 .com.cn, .co.uk 等），取倒数第三个部分
    const lastPart = parts[parts.length - 1]
    const secondLastPart = parts[parts.length - 2]

    // 检查是否为双重后缀
    const doubleSuffixes = ["com", "net", "org", "gov", "edu", "co"]
    if (
      parts.length >= 3 &&
      doubleSuffixes.includes(secondLastPart) &&
      lastPart.length === 2
    ) {
      // 首字母大写
      return (
        parts[parts.length - 3].charAt(0).toUpperCase() +
        parts[parts.length - 3].slice(1)
      )
    }

    // 否则返回倒数第二个部分
    return secondLastPart.charAt(0).toUpperCase() + secondLastPart.slice(1)
  }

  return withoutWww.charAt(0).toUpperCase() + withoutWww.slice(1)
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
 * @param siteStatusInfo Optional pre-fetched site status info to avoid redundant API calls when resolving the display name.
 * @returns 计算后的站点名称
 */
export async function getSiteName(
  input: browser.tabs.Tab | string,
  siteTypeHint?: string,
  siteStatusInfo?: { system_name?: string | null } | null,
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
    let resolvedSiteStatus = siteStatusInfo
    if (!resolvedSiteStatus) {
      try {
        resolvedSiteStatus = await getApiService(siteTypeHint).fetchSiteStatus({
          baseUrl: hostWithProtocol,
          auth: {
            authType: AuthTypeEnum.None,
          },
        })
      } catch {
        resolvedSiteStatus = null
      }
    }
    if (
      resolvedSiteStatus?.system_name &&
      isNotDefaultSiteName(resolvedSiteStatus.system_name)
    ) {
      return resolvedSiteStatus.system_name
    }
  }

  // 5. 最后从域名获取
  return extractDomainPrefix(urlObj.hostname)
}
