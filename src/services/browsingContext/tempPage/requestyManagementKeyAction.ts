import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  createRequestyManagementKeyFailure,
  normalizeRequestyManagementKeyName,
  REQUESTY_API_KEYS_ORIGIN,
  REQUESTY_API_KEYS_URL,
  REQUESTY_PROVISIONING_FAILURE_REASONS,
  REQUESTY_PROVISIONING_STATES,
  type RequestyProvisioningFailureReason,
  type TempWindowRequestyManagementKeyActionParams,
  type TempWindowRequestyManagementKeyActionResult,
} from "~/services/apiAdapters/requesty/keys/managementKeyPageContract"
import { PROTECTION_BYPASS_DENIED_REASONS } from "~/services/protectionBypass/contracts"
import { sendTabMessageWithRetry } from "~/utils/browser/runtimeMessages"

import type { AuthorizeTempContextAtAcquire } from "./contracts"
import { tempWindowBackgroundRuntime } from "./runtime"

/** Upper bound for one console key-creation round trip. */
const REQUESTY_MANAGEMENT_KEY_TRANSPORT_TIMEOUT_MS = 25_000

/** Fails closed when a non-runtime caller omits Coordinator authorization. */
const denyMissingProtectionBypassExecution: AuthorizeTempContextAtAcquire =
  async () => ({
    kind: "denied",
    reason: PROTECTION_BYPASS_DENIED_REASONS.MissingExecution,
  })

type RequestyManagementKeyActionState = {
  request: TempWindowRequestyManagementKeyActionParams
  sendResponse: (response: TempWindowRequestyManagementKeyActionResult) => void
  settled: boolean
  releaseStarted: boolean
  contextAcquired: boolean
  releaseContext?: (options: {
    forceClose?: boolean
    reason?: string
  }) => Promise<void>
}

const requestyManagementKeyActions = new Map<
  string,
  RequestyManagementKeyActionState
>()

/** Builds a secret-free failure result for the requested key name. */
function buildFailure(
  request: TempWindowRequestyManagementKeyActionParams | undefined,
  state:
    | typeof REQUESTY_PROVISIONING_STATES.NotDispatched
    | typeof REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed,
  reason: RequestyProvisioningFailureReason,
): TempWindowRequestyManagementKeyActionResult {
  const name = normalizeRequestyManagementKeyName(
    request?.operation?.name ?? "",
  )
  const requestId =
    typeof request?.requestId === "string" ? request.requestId : ""
  return createRequestyManagementKeyFailure(requestId, name, state, reason)
}

/** Releases the temp context exactly once after settlement. */
async function releaseRequestyAction(state: RequestyManagementKeyActionState) {
  if (!state.contextAcquired || !state.releaseContext) return
  if (state.releaseStarted) return
  state.releaseStarted = true
  await state.releaseContext({
    forceClose: true,
    reason: "requestyManagementKeyActionSettled",
  })
}

/** Owns the single response and release transition for one action. */
async function settleRequestyAction(
  state: RequestyManagementKeyActionState,
  result: TempWindowRequestyManagementKeyActionResult,
) {
  if (state.settled) return
  state.settled = true
  requestyManagementKeyActions.delete(state.request.requestId)
  try {
    state.sendResponse(result)
  } finally {
    await releaseRequestyAction(state)
  }
}

/** Validates the untrusted runtime payload before any work is scheduled. */
function isValidRequest(
  request: TempWindowRequestyManagementKeyActionParams | undefined,
): request is TempWindowRequestyManagementKeyActionParams {
  return (
    !!request &&
    typeof request.requestId === "string" &&
    request.requestId !== "" &&
    !!request.operation &&
    request.operation.kind === "create" &&
    typeof request.operation.name === "string" &&
    request.operation.name.trim() !== ""
  )
}

/** Executes one console key-creation action under the temp-page scheduler. */
async function executeTempWindowRequestyManagementKeyAction(
  state: RequestyManagementKeyActionState,
  suppressMinimize: boolean,
  authorizeAtAcquire: AuthorizeTempContextAtAcquire,
) {
  const { request } = state
  let deadline: ReturnType<typeof setTimeout> | undefined
  let pageResultReceived = false
  try {
    const context = await tempWindowBackgroundRuntime.acquire(
      REQUESTY_API_KEYS_URL,
      request.requestId,
      suppressMinimize,
      {},
      authorizeAtAcquire,
    )
    state.contextAcquired = true
    state.releaseContext = context.release
    if (state.settled) return

    await context.navigate(REQUESTY_API_KEYS_URL, {
      requestId: request.requestId,
      origin: REQUESTY_API_KEYS_ORIGIN,
    })
    if (state.settled) return

    const tab = await context.inspect()
    if (state.settled) return
    if (!tab?.url || new URL(tab.url).origin !== REQUESTY_API_KEYS_ORIGIN) {
      await settleRequestyAction(
        state,
        buildFailure(
          request,
          REQUESTY_PROVISIONING_STATES.NotDispatched,
          REQUESTY_PROVISIONING_FAILURE_REASONS.SessionUnavailable,
        ),
      )
      return
    }

    const pageResult = await Promise.race([
      sendTabMessageWithRetry<TempWindowRequestyManagementKeyActionResult>(
        context.tabId,
        {
          action: RuntimeActionIds.ContentRequestyManagementKeyAction,
          requestId: request.requestId,
          operation: request.operation,
        },
        { maxAttempts: 1 },
      ),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          reject(new Error("requesty_management_key_timeout"))
        }, REQUESTY_MANAGEMENT_KEY_TRANSPORT_TIMEOUT_MS)
      }),
    ]).finally(() => {
      pageResultReceived = true
      if (deadline) clearTimeout(deadline)
    })

    if (
      !pageResult ||
      typeof pageResult !== "object" ||
      pageResult.requestId !== request.requestId ||
      pageResult.operation !== "create"
    ) {
      await settleRequestyAction(
        state,
        buildFailure(
          request,
          REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed,
          REQUESTY_PROVISIONING_FAILURE_REASONS.PlaintextMissing,
        ),
      )
      return
    }

    await settleRequestyAction(state, pageResult)
  } catch {
    // The create only runs inside the page handler, so a transport failure
    // before the page answered means nothing was dispatched.
    await settleRequestyAction(
      state,
      buildFailure(
        request,
        pageResultReceived
          ? REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed
          : REQUESTY_PROVISIONING_STATES.NotDispatched,
        pageResultReceived
          ? REQUESTY_PROVISIONING_FAILURE_REASONS.PlaintextMissing
          : REQUESTY_PROVISIONING_FAILURE_REASONS.SessionUnavailable,
      ),
    )
  }
}

/** Queues a dedicated Requesty API-keys page action and guards its lifecycle. */
export async function handleTempWindowRequestyManagementKeyAction(
  request: TempWindowRequestyManagementKeyActionParams,
  suppressMinimize: boolean,
  sendResponse: (response: TempWindowRequestyManagementKeyActionResult) => void,
  authorizeAtAcquire: AuthorizeTempContextAtAcquire = denyMissingProtectionBypassExecution,
) {
  if (!isValidRequest(request)) {
    sendResponse(
      buildFailure(
        request,
        REQUESTY_PROVISIONING_STATES.NotDispatched,
        REQUESTY_PROVISIONING_FAILURE_REASONS.CreateRejected,
      ),
    )
    return
  }
  if (requestyManagementKeyActions.has(request.requestId)) {
    sendResponse(
      buildFailure(
        request,
        REQUESTY_PROVISIONING_STATES.NotDispatched,
        REQUESTY_PROVISIONING_FAILURE_REASONS.CreateRejected,
      ),
    )
    return
  }
  const state: RequestyManagementKeyActionState = {
    request,
    sendResponse,
    settled: false,
    releaseStarted: false,
    contextAcquired: false,
  }
  requestyManagementKeyActions.set(request.requestId, state)
  try {
    await tempWindowBackgroundRuntime.run(REQUESTY_API_KEYS_URL, {}, () =>
      executeTempWindowRequestyManagementKeyAction(
        state,
        suppressMinimize,
        authorizeAtAcquire,
      ),
    )
  } catch {
    await settleRequestyAction(
      state,
      buildFailure(
        request,
        REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed,
        REQUESTY_PROVISIONING_FAILURE_REASONS.PlaintextMissing,
      ),
    )
  }
}
