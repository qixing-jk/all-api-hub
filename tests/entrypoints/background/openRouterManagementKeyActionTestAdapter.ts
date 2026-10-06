import type {
  TempWindowOpenRouterManagementKeyActionParams,
  TempWindowOpenRouterManagementKeyActionResult,
} from "~/services/apiAdapters/openrouter/managementKeyPageContract"
import {
  cancelTempWindowOpenRouterManagementKeyAction,
  handleTempWindowOpenRouterManagementKeyAction as handleProductionAction,
  markTempWindowOpenRouterManagementKeyDispatched,
} from "~/services/browsingContext/tempPage/openrouterManagementKeyAction"

const authorizeTestAcquire = async () => ({
  kind: "allowed" as const,
  adapter: "tab" as const,
  feature: "account_onboarding" as const,
  operation: "native_page_action" as const,
  cause: "explicit_context" as const,
  surface: "background" as const,
})

export async function handleTempWindowOpenRouterManagementKeyAction(
  request: TempWindowOpenRouterManagementKeyActionParams,
  sendResponse: (
    response: TempWindowOpenRouterManagementKeyActionResult,
  ) => void,
) {
  return handleProductionAction(
    request,
    Boolean(request.suppressMinimize),
    sendResponse,
    authorizeTestAcquire,
  )
}

export {
  cancelTempWindowOpenRouterManagementKeyAction,
  markTempWindowOpenRouterManagementKeyDispatched,
}
