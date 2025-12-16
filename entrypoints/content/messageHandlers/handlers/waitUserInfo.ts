import { waitForUserInfo } from "../utils/userInfo"

/**
 * Handles message to wait for user info and respond with it.
 */
export function handleWaitAndGetUserInfo(
  _request: any,
  sendResponse: (res: any) => void,
) {
  waitForUserInfo()
    .then((userInfo) => {
      sendResponse({ success: true, data: userInfo })
    })
    .catch((error) => {
      sendResponse({ success: false, error: error.message })
    })

  return true
}
