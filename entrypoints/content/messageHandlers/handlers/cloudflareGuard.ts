import { getErrorMessage } from "~/utils/error"

import {
  detectCloudflareChallengePage,
  logCloudflareGuard,
} from "../utils/cloudflareGuard"

/**
 * Handle Cloudflare guard check requests
 */
export function handleCheckCloudflareGuard(
  request: any,
  sendResponse: (res: any) => void,
) {
  try {
    const detection = detectCloudflareChallengePage()
    const passed = !detection.isChallenge

    if (request.requestId) {
      logCloudflareGuard("check", {
        requestId: request.requestId,
        origin: (() => {
          try {
            return window.location.origin
          } catch {
            return null
          }
        })(),
        title: detection.title,
        passed,
        detection,
      })
    }

    sendResponse({ success: true, passed, detection })
  } catch (error) {
    if (request.requestId) {
      logCloudflareGuard("checkError", {
        requestId: request.requestId,
        error: getErrorMessage(error),
      })
    }
    sendResponse({ success: false, error: getErrorMessage(error) })
  }

  return true
}
