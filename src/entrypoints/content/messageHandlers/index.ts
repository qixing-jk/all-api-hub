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
  handleShowShieldBypassUi,
  handleTriggerCheckinPageAction,
  handleWaitAndGetUserInfo,
  handleWaitForTurnstileToken,
} from "~/entrypoints/content/messageHandlers/handlers"
import {
  handleClearNewApiOAuthEvidence,
  handleCompleteNewApiOAuth,
  handlePrepareNewApiOAuth,
} from "~/services/apiService/newApiFamily/oauth/newApiContent"
import {
  handleClearSub2ApiOAuthEvidence,
  handleCompleteSub2ApiOAuth,
  handlePrepareSub2ApiOAuth,
} from "~/services/apiService/sub2api/oauth/content"
import { onRuntimeMessage } from "~/utils/browser/browserApi"

/**
 * Registers content-script message handlers for fetching storage data,
 * checking guard status, relaying temp fetches, etc.
 * Each branch replies via sendResponse so browser.runtime ports stay alive.
 */
export function setupContentMessageHandlers() {
  return onRuntimeMessage((request, _sender, sendResponse) => {
    if (request.action === RuntimeActionIds.ContentPrepareSub2ApiOAuth)
      return handlePrepareSub2ApiOAuth(request, sendResponse)
    if (request.action === RuntimeActionIds.ContentCompleteSub2ApiOAuth)
      return handleCompleteSub2ApiOAuth(request, sendResponse)
    if (request.action === RuntimeActionIds.ContentClearSub2ApiOAuthEvidence)
      return handleClearSub2ApiOAuthEvidence(request, sendResponse)
    if (request.action === RuntimeActionIds.ContentPrepareNewApiOAuth)
      return handlePrepareNewApiOAuth(request, sendResponse)
    if (request.action === RuntimeActionIds.ContentCompleteNewApiOAuth)
      return handleCompleteNewApiOAuth(request, sendResponse)
    if (request.action === RuntimeActionIds.ContentClearNewApiOAuthEvidence)
      return handleClearNewApiOAuthEvidence(request, sendResponse)
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
