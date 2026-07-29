import {
  OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
} from "~/constants/openRouterBootstrap"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { readOpenRouterClerkSessionIdentity } from "~/entrypoints/content/messageHandlers/openrouter/clerkSessionReader"
import { performOpenRouterManagementKeyPageAction } from "~/entrypoints/content/messageHandlers/openrouter/managementKeyPage"
import type {
  TempWindowOpenRouterManagementKeyActionParams,
  TempWindowOpenRouterManagementKeyActionResult,
} from "~/services/apiAdapters/openrouter/managementKeyPageContract"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"

/** Normalizes an internal page exception without exposing its message. */
function failedCreateResult(
  request: TempWindowOpenRouterManagementKeyActionParams,
  dispatched: boolean,
): TempWindowOpenRouterManagementKeyActionResult {
  return {
    requestId: request.requestId,
    operation: "create",
    mutationState: dispatched
      ? OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed
      : OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
    attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
    label: request.operation.label,
  }
}

/** Validates the narrow runtime shape accepted by the page action bridge. */
function isValidRequest(
  request: unknown,
): request is TempWindowOpenRouterManagementKeyActionParams {
  if (!request || typeof request !== "object") return false
  const value = request as Record<string, unknown>
  if (typeof value.requestId !== "string" || !value.requestId) return false
  const operation = value.operation
  if (!operation || typeof operation !== "object") return false
  return (
    (operation as Record<string, unknown>).kind === "create" &&
    typeof (operation as Record<string, unknown>).label === "string"
  )
}

/** Handles only the dedicated OpenRouter Management Keys page protocol. */
export function handleOpenRouterManagementKeyAction(
  request: TempWindowOpenRouterManagementKeyActionParams,
  sendResponse: (
    response: TempWindowOpenRouterManagementKeyActionResult,
  ) => void,
) {
  if (!isValidRequest(request)) {
    const value = request as unknown as Record<string, unknown> | undefined
    sendResponse({
      requestId: typeof value?.requestId === "string" ? value.requestId : "",
      operation: "create",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      label: "",
    })
    return true
  }
  let createDispatched = false
  const readSessionIdentity = () =>
    Promise.resolve()
      .then(readOpenRouterClerkSessionIdentity)
      .catch(() => undefined)
  const sessionIdentityPromise = readSessionIdentity()
  const perform = async () => {
    try {
      const result = await performOpenRouterManagementKeyPageAction(
        request,
        undefined,
        async () => {
          const marker = await sendRuntimeMessage({
            action:
              RuntimeActionIds.TempWindowOpenRouterManagementKeyDispatched,
            requestId: request.requestId,
          })
          const marked =
            !!marker &&
            typeof marker === "object" &&
            (marker as { marked?: unknown }).marked === true
          if (marked) createDispatched = true
          return marked
        },
      )
      if (
        result.mutationState === OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created
      ) {
        const earlySessionIdentity = await sessionIdentityPromise
        const sessionIdentity =
          earlySessionIdentity ?? (await readSessionIdentity())
        sendResponse({
          ...result,
          ...(sessionIdentity ? { sessionIdentity } : {}),
        })
        return
      }
      if (
        result.mutationState ===
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched &&
        result.attemptOutcome ===
          OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.LoggedOut
      ) {
        const sessionIdentity = await sessionIdentityPromise
        sendResponse(
          sessionIdentity
            ? {
                ...result,
                attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout,
              }
            : result,
        )
        return
      }
      sendResponse(result)
    } catch {
      sendResponse(failedCreateResult(request, createDispatched))
    }
  }

  void perform()
  return true
}
