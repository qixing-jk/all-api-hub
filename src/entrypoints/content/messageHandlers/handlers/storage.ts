import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { Sub2ApiContentSessionLoginRequiredError } from "~/services/accountSiteOnboarding/contentSession/sub2api"
import { getContentSessionExtractors } from "~/services/accountSiteOnboarding/registry"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

/**
 * Handles requests to get data from localStorage.
 */
export function handleGetLocalStorage(
  request: any,
  sendResponse: (res: any) => void,
) {
  try {
    const { key } = request

    if (key) {
      const value = localStorage.getItem(key)
      sendResponse({ success: true, data: { [key]: value } })
    } else {
      const data: Record<string, any> = {}

      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i)
        if (storageKey) {
          data[storageKey] = localStorage.getItem(storageKey)
        }
      }

      sendResponse({ success: true, data })
    }
  } catch (error) {
    sendResponse({ success: false, error: getErrorMessage(error) })
  }

  return true
}

/**
 * Handles requests to get user info from localStorage.
 */
export function handleGetUserFromLocalStorage(
  request: any,
  sendResponse: (res: any) => void,
) {
  ;(async () => {
    try {
      const context = {
        url: typeof request?.url === "string" ? request.url : undefined,
        siteTypeHint: isAccountSiteType(request?.siteType)
          ? request.siteType
          : SITE_TYPES.UNKNOWN,
      }

      for (const extractor of getContentSessionExtractors()) {
        if (!extractor.canExtract(context)) continue
        const result = await extractor.extract(context)
        if (!result) continue

        sendResponse({
          success: true,
          data: result,
        })
        return
      }

      sendResponse({
        success: false,
        error: t("messages:content.userInfoNotFound"),
      })
    } catch (error) {
      if (error instanceof Sub2ApiContentSessionLoginRequiredError) {
        sendResponse({
          success: false,
          error: t("messages:sub2api.loginRequired"),
        })
        return
      }
      sendResponse({ success: false, error: getErrorMessage(error) })
    }
  })()

  return true
}
