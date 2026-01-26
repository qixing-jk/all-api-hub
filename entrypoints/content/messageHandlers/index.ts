import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  handleCheckCloudflareGuard,
  handleGetLocalStorage,
  handleGetRenderedTitle,
  handleGetUserFromLocalStorage,
  handlePerformTempWindowFetch,
  handleShowShieldBypassUi,
  handleWaitAndGetUserInfo,
} from "~/entrypoints/content/messageHandlers/handlers"

/**
 * Registers content-script message handlers for fetching storage data,
 * checking guard status, relaying temp fetches, etc.
 * Each branch replies via sendResponse so browser.runtime ports stay alive.
 */
export function setupContentMessageHandlers() {
  browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === RuntimeActionIds.ContentGetLocalStorage) {
      return handleGetLocalStorage(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentGetUserFromLocalStorage) {
      return handleGetUserFromLocalStorage(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentCheckCloudflareGuard) {
      return handleCheckCloudflareGuard(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentWaitAndGetUserInfo) {
      return handleWaitAndGetUserInfo(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentPerformTempWindowFetch) {
      return handlePerformTempWindowFetch(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentGetRenderedTitle) {
      return handleGetRenderedTitle(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentShowShieldBypassUi) {
      return handleShowShieldBypassUi(request, sendResponse)
    }
  })
}
