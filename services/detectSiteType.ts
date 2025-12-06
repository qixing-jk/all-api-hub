import { SITE_TITLE_RULES, UNKNOWN_SITE } from "~/constants/siteType"
import { ApiError } from "~/services/apiService/common/errors"
import { fetchApi, fetchApiData } from "~/services/apiService/common/utils"
import { AuthTypeEnum } from "~/types"

/**
 * Fetch the raw HTML title from the site root.
 * Uses a text response and no-store cache to avoid stale titles.
 */
export const fetchSiteOriginalTitle = async (url: string) => {
  const html = await fetchApi<string>(
    {
      baseUrl: url,
      endpoint: "/",
      authType: AuthTypeEnum.None,
      options: {
        cache: "no-store",
      },
      responseType: "text",
    },
    true,
  )
  const match = html.match(/<title>(.*?)<\/title>/i) // simple, case-insensitive title extract
  const title = match ? match[1] : "未找到"
  console.log("原始 document title:", title)
  return title
}

async function getSiteUserIdType(url: string) {
  try {
    await fetchApiData<unknown>({
      baseUrl: url,
      endpoint: "/api/user/self",
      authType: AuthTypeEnum.Cookie,
      options: {
        cache: "no-store",
      },
    })
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
