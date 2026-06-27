import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  getAccountSiteCompatUserIdHeaderRules,
  getAccountSiteDomainRules,
  getAccountSiteTitleRules,
} from "~/services/accountSiteOnboarding/registry"
import { ApiError } from "~/services/apiService/common/errors"
import { fetchApi, fetchApiData } from "~/services/apiService/common/utils"
import { SUB2API_AUTH_ME_ENDPOINT } from "~/services/apiService/sub2api/type"
import { AuthTypeEnum } from "~/types"
import {
  canUseTempWindowFetch,
  tempWindowFetch,
} from "~/utils/browser/tempWindowFetch"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("DetectSiteType")
const COMPAT_USER_ID_HEADER_MESSAGE_RULES =
  getAccountSiteCompatUserIdHeaderRules().map(({ headerName, siteType }) => ({
    siteType,
    regex: new RegExp(
      headerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[-_ ]?"),
      "i",
    ),
  }))

/**
 * Fetch the raw HTML title from the site root.
 *
 * not get final title after js execution, because some sites may change title after load, but we want the original one for better site type detection accuracy.
 */
export const fetchSiteOriginalTitle = async (url: string) => {
  const parseTitle = (html: string) => {
    const match = html.match(/<title>(.*?)<\/title>/i) // simple, case-insensitive title extract
    return match ? match[1] : ""
  }

  const fetchUrl = new URL("/", url).toString()
  const tempRequestId = safeRandomUUID(`fetch-title-${fetchUrl}`)

  // 尝试临时上下文获取标题，确保通过 WAF/盾后读取真实页面内容
  try {
    if (await canUseTempWindowFetch()) {
      const tempResult = await tempWindowFetch({
        originUrl: fetchUrl,
        fetchUrl,
        responseType: "text",
        fetchOptions: {
          credentials: "include",
          cache: "no-store",
        },
        requestId: tempRequestId,
      })

      if (tempResult?.success && typeof tempResult.data === "string") {
        const title = parseTitle(tempResult.data)
        logger.debug("原始 document title (temp context)", { title })
        return title
      }
    }
  } catch (error) {
    logger.warn("temp context title fetch failed, fallback", error)
  }

  // 临时上下文失败则直接 fetch，可能拿到缓存或被 WAF 误拦截，但总比没有数据好
  const html = await fetchApi<string>(
    {
      baseUrl: url,
      auth: { authType: AuthTypeEnum.None },
    },
    {
      endpoint: "/",
      responseType: "text",
      options: {
        cache: "no-store",
      },
    },
    true,
  )
  const title = parseTitle(html)
  logger.debug("原始 document title (direct fetch)", { title })
  return title
}

/**
 * Runs ordered matching against an API error message:
 * 1. Known site-specific compat user-id header markers from upstream auth errors
 * 2. Whole-message matching against existing site detection rules
 */
function detectAccountSiteTypeFromApiErrorMessage(
  message: string,
): AccountSiteType {
  const normalizedMessage = message.trim()
  if (!normalizedMessage) {
    return SITE_TYPES.UNKNOWN
  }

  for (const knownRule of COMPAT_USER_ID_HEADER_MESSAGE_RULES) {
    if (knownRule.regex.test(normalizedMessage)) {
      return knownRule.siteType
    }
  }

  for (const rule of getAccountSiteTitleRules()) {
    if (rule.regex.test(normalizedMessage)) {
      return rule.name
    }
  }

  return SITE_TYPES.UNKNOWN
}

/**
 * Probes the /api/user/self endpoint using cookie auth and infers the site
 * type from One/New API-family auth error messages when title detection fails.
 */
async function detectNewApiFamilySiteTypeFromCompatAuthError(
  url: string,
): Promise<AccountSiteType> {
  try {
    await fetchApiData<unknown>(
      {
        baseUrl: url,
        auth: { authType: AuthTypeEnum.Cookie },
      },
      {
        endpoint: "/api/user/self",
        options: {
          cache: "no-store",
        },
      },
    )
  } catch (error) {
    if (error instanceof ApiError) {
      return detectAccountSiteTypeFromApiErrorMessage(error.message)
    }
    throw error
  }
  return SITE_TYPES.UNKNOWN
}

/**
 * Returns whether a parsed response body is a plain JSON object.
 */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Probe Sub2API's JWT identity endpoint without opening a browser context.
 *
 * Source: https://github.com/Wei-Shaw/sub2api
 * `/api/v1/auth/me` is protected by JWT middleware; without Authorization,
 * upstream returns a JSON object with a string `code`. The endpoint-shape signal
 * is enough to identify white-label Sub2API deployments in the current adapter
 * set without relying on the visible page title.
 */
async function detectSub2ApiFromAuthEndpoint(
  url: string,
): Promise<AccountSiteType> {
  try {
    const response = await fetch(new URL(SUB2API_AUTH_ME_ENDPOINT, url), {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
    })

    const contentType = response.headers.get("content-type") || ""
    if (!/\bjson\b/i.test(contentType)) {
      return SITE_TYPES.UNKNOWN
    }

    const responseBody = (await response.json()) as unknown
    if (isJsonObject(responseBody) && typeof responseBody.code === "string") {
      return SITE_TYPES.SUB2API
    }
  } catch (error) {
    logger.debug("Sub2API auth endpoint probe failed", { url, error })
  }

  return SITE_TYPES.UNKNOWN
}

/**
 * detectAccountSiteTypeFromDomain parses the URL hostname and compares it
 * case-insensitively against account-site domain rules. It returns the matched
 * AccountSiteType rule name, or SITE_TYPES.UNKNOWN when parsing fails or no
 * domain rule matches.
 */
function detectAccountSiteTypeFromDomain(url: string): AccountSiteType {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    const matchedRule = getAccountSiteDomainRules().find((rule) =>
      rule.hostnames.some((allowedHostname) => allowedHostname === hostname),
    )
    return matchedRule?.name ?? SITE_TYPES.UNKNOWN
  } catch {
    return SITE_TYPES.UNKNOWN
  }
}

export const getAccountSiteType = async (
  url: string,
): Promise<AccountSiteType> => {
  const domainSiteType = detectAccountSiteTypeFromDomain(url)
  if (domainSiteType !== SITE_TYPES.UNKNOWN) {
    return domainSiteType
  }

  const title = await fetchSiteOriginalTitle(url)
  for (const rule of getAccountSiteTitleRules()) {
    if (rule.regex.test(title)) {
      return rule.name
    }
  }

  const sub2ApiSiteType = await detectSub2ApiFromAuthEndpoint(url)
  if (sub2ApiSiteType !== SITE_TYPES.UNKNOWN) {
    return sub2ApiSiteType
  }

  return await detectNewApiFamilySiteTypeFromCompatAuthError(url)
}
