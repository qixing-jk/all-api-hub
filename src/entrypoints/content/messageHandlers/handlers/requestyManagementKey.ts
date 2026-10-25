import {
  readRequestyManagementKey,
  REQUESTY_MANAGEMENT_KEY_READ_KINDS,
} from "~/entrypoints/content/messageHandlers/requesty/managementKeyReader"
import {
  createRequestyManagementKeyFailure,
  isRequestyManagementKeyActionParams,
  normalizeRequestyManagementKeyName,
  REQUESTY_PROVISIONING_FAILURE_REASONS,
  REQUESTY_PROVISIONING_STATES,
  type RequestyProvisioningFailureReason,
  type TempWindowRequestyManagementKeyActionParams,
  type TempWindowRequestyManagementKeyActionResult,
} from "~/services/apiAdapters/requesty/keys/managementKeyPageContract"

/** Builds a not-dispatched failure that never carries provider text. */
function failureResult(
  request: TempWindowRequestyManagementKeyActionParams | undefined,
  reason: RequestyProvisioningFailureReason,
): TempWindowRequestyManagementKeyActionResult {
  const untrusted = request as unknown as Record<string, unknown> | undefined
  return createRequestyManagementKeyFailure(
    typeof untrusted?.requestId === "string" ? untrusted.requestId : "",
    typeof request?.operation?.name === "string"
      ? normalizeRequestyManagementKeyName(request.operation.name)
      : "",
    REQUESTY_PROVISIONING_STATES.NotDispatched,
    reason,
  )
}

/**
 * Handles the Requesty manage-key page action inside the console tab.
 *
 * The create itself runs in the main world (the Clerk JWT only exists there);
 * this handler owns validation, the response contract and the failure mapping.
 */
export function handleRequestyManagementKeyAction(
  request: unknown,
  sendResponse: (response: TempWindowRequestyManagementKeyActionResult) => void,
) {
  if (!isRequestyManagementKeyActionParams(request)) {
    sendResponse(
      failureResult(
        request as TempWindowRequestyManagementKeyActionParams,
        REQUESTY_PROVISIONING_FAILURE_REASONS.CreateRejected,
      ),
    )
    return false
  }

  void (async () => {
    const name = normalizeRequestyManagementKeyName(request.operation.name)
    const outcome = await readRequestyManagementKey(name)
    if (outcome.kind === REQUESTY_MANAGEMENT_KEY_READ_KINDS.WrongPage) {
      // Signed out or redirected: the create never ran.
      sendResponse(
        createRequestyManagementKeyFailure(
          request.requestId,
          name,
          REQUESTY_PROVISIONING_STATES.NotDispatched,
          REQUESTY_PROVISIONING_FAILURE_REASONS.SessionUnavailable,
        ),
      )
      return
    }
    if (outcome.kind === REQUESTY_MANAGEMENT_KEY_READ_KINDS.NoResponse) {
      sendResponse(
        createRequestyManagementKeyFailure(
          request.requestId,
          name,
          REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed,
          REQUESTY_PROVISIONING_FAILURE_REASONS.PlaintextMissing,
        ),
      )
      return
    }
    const response = outcome.response
    if (!response.ok) {
      sendResponse(
        createRequestyManagementKeyFailure(
          request.requestId,
          name,
          REQUESTY_PROVISIONING_STATES.NotDispatched,
          response.reason,
        ),
      )
      return
    }
    sendResponse({
      requestId: request.requestId,
      operation: "create",
      state: REQUESTY_PROVISIONING_STATES.Created,
      accessToken: response.accessToken,
      keyId: response.keyId,
      name,
    })
  })()

  return true
}
