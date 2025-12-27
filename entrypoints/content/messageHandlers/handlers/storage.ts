import { t } from "i18next"

import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"
import { getErrorMessage } from "~/utils/error"

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
      const userStr = localStorage.getItem("user")
      const user = userStr
        ? JSON.parse(userStr)
        : await getApiService(undefined).fetchUserInfo({
            baseUrl: request.url,
            auth: { authType: AuthTypeEnum.Cookie },
          })

      if (!user || !user.id) {
        sendResponse({
          success: false,
          error: t("messages:content.userInfoNotFound"),
        })
        return
      }

      sendResponse({ success: true, data: { userId: user.id, user } })
    } catch (error) {
      sendResponse({ success: false, error: getErrorMessage(error) })
    }
  })()

  return true
}
