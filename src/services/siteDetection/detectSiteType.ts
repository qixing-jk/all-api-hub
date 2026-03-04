import { SITE_TITLE_RULES, UNKNOWN_SITE } from "~/src/constants/siteType"
import { ApiError } from "~/src/services/apiService/common/errors"
import { fetchApi, fetchApiData } from "~/src/services/apiService/common/utils"
import { AuthTypeEnum } from "~/src/types"
import {
  canUseTempWindowFetch,
  tempWindowFetch,
} from "~/src/utils/browser/tempWindowFetch"
import { safeRandomUUID } from "~/src/utils/core/identifier"
import { createLogger } from "~/src/utils/core/logger"

const logger = createLogger("DetectSiteType")

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
 * Probes the /api/user/self endpoint using cookie auth and extracts any
 * user-id-like suffix from an error message to help infer site type.
 */
async function getSiteUserIdType(url: string) {
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
    if (error instanceof ApiError && error.message) {
      const parts = error.message.split(" ")
      return parts.length > 0 ? parts[parts.length - 1] : ""
    }
    throw error
  }
  return ""
}

export const getSiteType = async (url: string) => {
  const title = await fetchSiteOriginalTitle(url)
  let detected = UNKNOWN_SITE
  for (const rule of SITE_TITLE_RULES) {
    if (rule.regex.test(title)) {
      detected = rule.name
      return detected
    }
  }

  if (detected === UNKNOWN_SITE) {
    const userIdString = await getSiteUserIdType(url)
    for (const rule of SITE_TITLE_RULES) {
      if (rule.regex.test(userIdString)) {
        detected = rule.name
        return detected
      }
    }
  }
  return detected
}
