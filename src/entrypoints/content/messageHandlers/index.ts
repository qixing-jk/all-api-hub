import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  handleApproveLinuxDoOAuth,
  handleCheckCapGuard,
  handleCheckCloudflareGuard,
  handleClearAgentRouterOAuthEvidence,
  handleCompleteAgentRouterOAuth,
  handleGetLocalStorage,
  handleGetRenderedTitle,
  handleGetUserFromLocalStorage,
  handleOpenRouterManagementKeyAction,
  handlePerformTempWindowFetch,
  handlePrepareAgentRouterOAuth,
  handleRunBrowserCheckIn,
  handleShowShieldBypassUi,
  handleTriggerCheckinPageAction,
  handleWaitAndGetUserInfo,
  handleWaitForTurnstileToken,
} from "~/entrypoints/content/messageHandlers/handlers"
import { onRuntimeMessage } from "~/utils/browser/browserApi"

/**
 * Registers content-script message handlers for fetching storage data,
 * checking guard status, relaying temp fetches, etc.
 * Each branch replies via sendResponse so browser.runtime ports stay alive.
 */
export function setupContentMessageHandlers() {
  return onRuntimeMessage((request, _sender, sendResponse) => {
    if (request.action === RuntimeActionIds.ContentPrepareAgentRouterOAuth) {
      return handlePrepareAgentRouterOAuth(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentCompleteAgentRouterOAuth) {
      return handleCompleteAgentRouterOAuth(sendResponse)
    }

    if (
      request.action === RuntimeActionIds.ContentClearAgentRouterOAuthEvidence
    ) {
      return handleClearAgentRouterOAuthEvidence(sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentApproveLinuxDoOAuth) {
      return handleApproveLinuxDoOAuth(request, sendResponse)
    }

    if (
      request.action === RuntimeActionIds.ContentCheckinFeedbackScan ||
      request.action === RuntimeActionIds.ContentCancelCheckinFeedbackScan
    ) {
      void import("~/services/checkin/feedback/pageScan")
        .then(({ handlePageFeedbackScan }) =>
          handlePageFeedbackScan(request, sendResponse),
        )
        .catch(() => sendResponse({ success: false }))
      return true
    }
    if (request.action === RuntimeActionIds.ContentGetLocalStorage) {
      return handleGetLocalStorage(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentGetUserFromLocalStorage) {
      return handleGetUserFromLocalStorage(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentCheckCapGuard) {
      return handleCheckCapGuard(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentCheckCloudflareGuard) {
      return handleCheckCloudflareGuard(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentWaitForTurnstileToken) {
      return handleWaitForTurnstileToken(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentTriggerCheckinPageAction) {
      return handleTriggerCheckinPageAction(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentWaitAndGetUserInfo) {
      return handleWaitAndGetUserInfo(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentPerformTempWindowFetch) {
      return handlePerformTempWindowFetch(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentRunBrowserCheckIn) {
      return handleRunBrowserCheckIn(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentGetRenderedTitle) {
      return handleGetRenderedTitle(request, sendResponse)
    }

    if (request.action === RuntimeActionIds.ContentShowShieldBypassUi) {
      return handleShowShieldBypassUi(request, sendResponse)
    }

    if (
      request.action === RuntimeActionIds.ContentOpenRouterManagementKeyAction
    ) {
      return handleOpenRouterManagementKeyAction(request, sendResponse)
    }
  })
}
