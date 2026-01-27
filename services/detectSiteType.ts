import { SITE_TITLE_RULES, UNKNOWN_SITE } from "~/constants/siteType"
import { ApiError } from "~/services/apiService/common/errors"
import { fetchApi, fetchApiData } from "~/services/apiService/common/utils"
import { AuthTypeEnum } from "~/types"
import { safeRandomUUID } from "~/utils/identifier"
import { createLogger } from "~/utils/logger"
import {
  canUseTempWindowFetch,
  tempWindowFetch,
  tempWindowGetRenderedTitle,
} from "~/utils/tempWindowFetch"

const logger = createLogger("DetectSiteType")

/**
 * Fetch the raw HTML title from the site root.
 * Uses a text response and no-store cache to avoid stale titles.
 */
export const fetchSiteOriginalTitle = async (url: string) => {
  const parseTitle = (html: string) => {
    const match = html.match(/<title>(.*?)<\/title>/i) // simple, case-insensitive title extract
    return match ? match[1] : ""
  }

  const fetchUrl = new URL("/", url).toString()
  const tempRequestId = safeRandomUUID(`fetch-title-${fetchUrl}`)

  // 首选通过临时上下文实际渲染页面并读取 document.title
  try {
    if (await canUseTempWindowFetch()) {
      const rendered = await tempWindowGetRenderedTitle({
        originUrl: fetchUrl,
        requestId: `${tempRequestId}-render`,
      })

      if (rendered?.success && rendered.title) {
        logger.debug("原始 document title (rendered)", {
          title: rendered.title,
        })
        return rendered.title
      }
    }
  } catch (error) {
    logger.warn("temp context rendered title failed, fallback to fetch", error)
  }

  // 优先尝试临时上下文获取标题，确保通过 WAF/盾后读取真实页面内容
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
