import { SITE_TITLE_RULES, UNKNOWN_SITE } from "~/constants/siteType"
import { ApiResponse } from "~/types"
import { joinUrl } from "~/utils/url.ts"

export const fetchSiteOriginalTitle = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" })
  const html = await response.text()
  const match = html.match(/<title>(.*?)<\/title>/i)
  const title = match ? match[1] : "未找到"
  console.log("原始 document title:", title)
  return title
}

async function getSiteUserIdType(url: string) {
  const response = await fetch(joinUrl(url, "/api/user/self"), {
    cache: "no-store"
  })
  if (!response.ok) {
    const data: ApiResponse = await response.json()
    if (data.message) {
      const parts = data.message.split(" ")
      return parts.length > 0 ? parts[parts.length - 1] : ""
    }
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
