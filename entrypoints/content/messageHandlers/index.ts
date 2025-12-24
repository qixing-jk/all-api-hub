import {
  handleCheckCloudflareGuard,
  handleGetLocalStorage,
  handleGetRenderedTitle,
  handleGetUserFromLocalStorage,
  handlePerformTempWindowFetch,
  handleWaitAndGetUserInfo,
} from "~/entrypoints/content/messageHandlers/handlers"

/**
 * Registers content-script message handlers for fetching storage data,
 * checking guard status, relaying temp fetches, etc.
 * Each branch replies via sendResponse so browser.runtime ports stay alive.
 */
export function setupContentMessageHandlers() {
  browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "getLocalStorage") {
      return handleGetLocalStorage(request, sendResponse)
    }

    if (request.action === "getUserFromLocalStorage") {
      return handleGetUserFromLocalStorage(request, sendResponse)
    }

    if (request.action === "checkCloudflareGuard") {
      return handleCheckCloudflareGuard(request, sendResponse)
    }

    if (request.action === "waitAndGetUserInfo") {
      return handleWaitAndGetUserInfo(request, sendResponse)
    }

    if (request.action === "performTempWindowFetch") {
      return handlePerformTempWindowFetch(request, sendResponse)
    }

    if (request.action === "getRenderedTitle") {
      return handleGetRenderedTitle(request, sendResponse)
    }
  })
}
