import {
  SITE_TITLE_RULES,
  SITE_TYPES,
  type SiteType,
} from "~/constants/siteType"
import { COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE } from "~/services/apiService/common/compatHeaders"
import { ApiError } from "~/services/apiService/common/errors"
import { fetchApi, fetchApiData } from "~/services/apiService/common/utils"
import { AuthTypeEnum } from "~/types"
import {
  canUseTempWindowFetch,
  tempWindowFetch,
} from "~/utils/browser/tempWindowFetch"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("DetectSiteType")
const COMPAT_USER_ID_HEADER_MESSAGE_RULES = Object.entries(
  COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE,
).map(([headerName, siteType]) => ({
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
function detectSiteTypeFromApiErrorMessage(message: string): SiteType {
  const normalizedMessage = message.trim()
  if (!normalizedMessage) {
    return SITE_TYPES.UNKNOWN
  }

  for (const knownRule of COMPAT_USER_ID_HEADER_MESSAGE_RULES) {
    if (knownRule.regex.test(normalizedMessage)) {
      return knownRule.siteType
    }
  }

  for (const rule of SITE_TITLE_RULES) {
    if (rule.regex.test(normalizedMessage)) {
      return rule.name
    }
  }

  return SITE_TYPES.UNKNOWN
}

/**
 * Probes the /api/user/self endpoint using cookie auth and infers the site
 * type from upstream auth error messages when title detection fails.
 */
async function getSiteUserIdType(url: string): Promise<SiteType> {
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
      return detectSiteTypeFromApiErrorMessage(error.message)
    }
    throw error
  }
  return SITE_TYPES.UNKNOWN
}

export const getSiteType = async (url: string): Promise<SiteType> => {
  const title = await fetchSiteOriginalTitle(url)
  for (const rule of SITE_TITLE_RULES) {
    if (rule.regex.test(title)) {
      return rule.name
    }
  }

  return await getSiteUserIdType(url)
}
