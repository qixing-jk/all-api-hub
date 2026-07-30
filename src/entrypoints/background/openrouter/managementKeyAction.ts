import {
  OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
  OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
  OPENROUTER_MANAGEMENT_KEY_TRANSPORT_TIMEOUT_MS,
} from "~/constants/openRouterBootstrap"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  isOpenRouterClerkSessionIdentity,
  OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH,
  OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
  OPENROUTER_MANAGEMENT_KEYS_URL,
  type TempWindowOpenRouterManagementKeyActionParams,
  type TempWindowOpenRouterManagementKeyActionResult,
  type TempWindowOpenRouterManagementKeyCancelResult,
} from "~/services/apiAdapters/openrouter/managementKeyPageContract"
import { normalizeOpenRouterManagementKeySecret } from "~/services/apiAdapters/openrouter/managementKeySecret"
import { sendTabMessageWithRetry } from "~/utils/browser/browserApi"

import {
  tempWindowBackgroundRuntime,
  type AuthorizeTempContextAtAcquire,
} from "../tempWindowPool"

type OpenRouterManagementKeyActionState = {
  request: TempWindowOpenRouterManagementKeyActionParams
  sendResponse: (
    response: TempWindowOpenRouterManagementKeyActionResult,
  ) => void
  createDispatched: boolean
  cancelRequested: boolean
  settled: boolean
  releaseStarted: boolean
  contextAcquired: boolean
  releaseContext?: (options: {
    forceClose?: boolean
    reason?: string
  }) => Promise<void>
}

/** Fails closed when a non-runtime caller omits Coordinator authorization. */
const denyMissingProtectionBypassIntent: AuthorizeTempContextAtAcquire =
  async () => ({ kind: "denied", reason: "missing_intent" })

const openRouterManagementKeyActions = new Map<
  string,
  OpenRouterManagementKeyActionState
>()
const openRouterManagementKeyPreCancelled = new Set<string>()
type CompletedOpenRouterManagementKeyActionSummary =
  | { mutationState: "not_dispatched" }
  | {
      mutationState: "dispatched_unconfirmed" | "created"
      label?: string
    }

const completedOpenRouterManagementKeyActions = new Map<
  string,
  CompletedOpenRouterManagementKeyActionSummary
>()
const MAX_TRACKED_OPENROUTER_ACTION_IDS = 128

/** Keeps recent request IDs bounded so duplicate callbacks remain harmless. */
function rememberBoundedRequestId(target: Set<string>, requestId: string) {
  target.add(requestId)
  if (target.size > MAX_TRACKED_OPENROUTER_ACTION_IDS) {
    const oldest = target.values().next().value
    if (oldest) target.delete(oldest)
  }
}

/** Retains only cancellation-safe mutation evidence from a completed result. */
function rememberCompletedOpenRouterAction(
  requestId: string,
  result: TempWindowOpenRouterManagementKeyActionResult,
) {
  const summary: CompletedOpenRouterManagementKeyActionSummary =
    result.mutationState === OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched
      ? { mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched }
      : {
          mutationState: result.mutationState,
          ...(result.label ? { label: result.label } : {}),
        }
  completedOpenRouterManagementKeyActions.set(requestId, summary)
  if (
    completedOpenRouterManagementKeyActions.size >
    MAX_TRACKED_OPENROUTER_ACTION_IDS
  ) {
    const oldest = completedOpenRouterManagementKeyActions.keys().next().value
    if (oldest) completedOpenRouterManagementKeyActions.delete(oldest)
  }
}

/** Maps a page failure to a secret-safe mutation-state result. */
function buildOpenRouterCreateFailure(
  state: OpenRouterManagementKeyActionState,
  outcome:
    | "failed"
    | "timeout"
    | "invalid_origin"
    | "logged_out"
    | "page_changed"
    | "cancelled_before_create",
): TempWindowOpenRouterManagementKeyActionResult {
  const request = state.request
  if (state.createDispatched) {
    return {
      requestId: request.requestId,
      operation: "create",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      attemptOutcome:
        outcome === OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout
          ? OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout
          : OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      label: request.operation.label,
    }
  }
  return {
    requestId: request.requestId,
    operation: "create",
    mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
    attemptOutcome: outcome,
    label: request.operation.label,
  }
}

/** Releases the temp context exactly once after action settlement. */
async function releaseOpenRouterAction(
  state: OpenRouterManagementKeyActionState,
) {
  if (!state.contextAcquired) return
  if (!state.releaseContext) return
  if (state.releaseStarted) return
  state.releaseStarted = true
  await state.releaseContext({
    forceClose: true,
    reason: "openRouterManagementKeyActionSettled",
  })
}

/** Owns the single response and release transition for an action. */
async function settleOpenRouterManagementKeyAction(
  state: OpenRouterManagementKeyActionState,
  result: TempWindowOpenRouterManagementKeyActionResult,
) {
  if (state.settled) return
  state.settled = true
  openRouterManagementKeyActions.delete(state.request.requestId)
  rememberCompletedOpenRouterAction(state.request.requestId, result)
  try {
    state.sendResponse(result)
  } finally {
    await releaseOpenRouterAction(state)
  }
}

/** Called by the content page before clicking Create, using only requestId. */
export function markTempWindowOpenRouterManagementKeyDispatched(
  requestId: string,
) {
  if (completedOpenRouterManagementKeyActions.has(requestId)) return false
  const state = openRouterManagementKeyActions.get(requestId)
  if (!state || state.settled) return false
  if (state.cancelRequested) return false
  if (state.createDispatched) return false
  state.createDispatched = true
  return true
}

/** Marks cancellation without aborting a dispatched page mutation. */
export function cancelTempWindowOpenRouterManagementKeyAction(
  requestId: string,
): TempWindowOpenRouterManagementKeyCancelResult {
  if (typeof requestId !== "string" || !requestId) {
    return {
      requestId: typeof requestId === "string" ? requestId : "",
      certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Unknown,
    }
  }

  const completed = completedOpenRouterManagementKeyActions.get(requestId)
  if (completed) {
    return {
      requestId,
      certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Known,
      cancellationAccepted: false,
      ...completed,
    }
  }

  const state = openRouterManagementKeyActions.get(requestId)
  if (!state) {
    rememberBoundedRequestId(openRouterManagementKeyPreCancelled, requestId)
    return {
      requestId,
      certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Unknown,
      cancellationAccepted: true,
    }
  }
  state.cancelRequested = true
  const cancellationResult: TempWindowOpenRouterManagementKeyCancelResult =
    state.createDispatched
      ? {
          requestId,
          certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Known,
          cancellationAccepted: true,
          mutationState:
            OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
          ...(state.request.operation.label
            ? { label: state.request.operation.label }
            : {}),
        }
      : {
          requestId,
          certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Known,
          cancellationAccepted: true,
          mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
        }
  if (!state.createDispatched) {
    void settleOpenRouterManagementKeyAction(
      state,
      buildOpenRouterCreateFailure(
        state,
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledBeforeCreate,
      ),
    ).catch(() => {})
  }
  return cancellationResult
}

/** Returns the parsed origin, preserving malformed input for safe rejection. */
function normalizeOrigin(url: string) {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

/** Executes one canonical OpenRouter page action under the temp-page scheduler. */
async function executeTempWindowOpenRouterManagementKeyAction(
  state: OpenRouterManagementKeyActionState,
  suppressMinimize: boolean,
  authorizeAtAcquire: AuthorizeTempContextAtAcquire,
) {
  const { request } = state
  let pageDeadlineExpired = false
  const hasCallerOriginOverride = [
    "originUrl",
    "pageUrl",
    "timeoutMs",
    "signal",
    "abortSignal",
    "rawPageResponse",
    "pageResult",
  ].some((key) => key in (request as Record<string, unknown>))
  if (
    hasCallerOriginOverride ||
    !request.requestId ||
    !request.operation.label.trim() ||
    request.operation.label.length > OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH
  ) {
    await settleOpenRouterManagementKeyAction(
      state,
      buildOpenRouterCreateFailure(
        state,
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      ),
    )
    return
  }

  if (state.cancelRequested) {
    await settleOpenRouterManagementKeyAction(
      state,
      buildOpenRouterCreateFailure(
        state,
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledBeforeCreate,
      ),
    )
    return
  }

  try {
    const context = await tempWindowBackgroundRuntime.acquire(
      OPENROUTER_MANAGEMENT_KEYS_URL,
      request.requestId,
      suppressMinimize,
      {},
      authorizeAtAcquire,
    )
    state.contextAcquired = true
    state.releaseContext = context.release
    if (state.settled) {
      await releaseOpenRouterAction(state)
      return
    }
    await context.navigate(OPENROUTER_MANAGEMENT_KEYS_URL, {
      requestId: request.requestId,
      origin: OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
    })
    if (state.settled) return
    const tab = await context.inspect()
    if (state.settled) return
    if (
      !tab?.url ||
      normalizeOrigin(tab.url) !== OPENROUTER_MANAGEMENT_KEYS_ORIGIN
    ) {
      await settleOpenRouterManagementKeyAction(
        state,
        buildOpenRouterCreateFailure(
          state,
          OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.InvalidOrigin,
        ),
      )
      return
    }
    let deadline: ReturnType<typeof setTimeout> | undefined
    const pageResult = (await Promise.race([
      sendTabMessageWithRetry<TempWindowOpenRouterManagementKeyActionResult>(
        context.tabId,
        {
          action: RuntimeActionIds.ContentOpenRouterManagementKeyAction,
          requestId: request.requestId,
          operation: request.operation,
        },
        { maxAttempts: 1 },
      ),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          pageDeadlineExpired = true
          reject(new Error("openrouter_page_timeout"))
        }, OPENROUTER_MANAGEMENT_KEY_TRANSPORT_TIMEOUT_MS)
      }),
    ]).finally(() => {
      if (deadline) clearTimeout(deadline)
    })) as TempWindowOpenRouterManagementKeyActionResult | undefined

    const createdAccessToken =
      pageResult?.mutationState === OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created
        ? normalizeOpenRouterManagementKeySecret(pageResult.accessToken)
        : undefined

    const isValidPageResult = (() => {
      if (!pageResult || typeof pageResult !== "object") return false
      if (pageResult.requestId !== request.requestId) return false
      if (
        pageResult.operation !== "create" ||
        pageResult.label !== request.operation.label
      )
        return false
      if (
        pageResult.mutationState ===
        OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created
      ) {
        return (
          state.createDispatched &&
          !!createdAccessToken &&
          (pageResult.attemptOutcome ===
            OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success ||
            pageResult.attemptOutcome ===
              OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledAfterCreate)
        )
      }
      if (
        pageResult.mutationState ===
        OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched
      ) {
        return (
          [
            OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.LoggedOut,
            OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.PageChanged,
            OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.InvalidOrigin,
            OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout,
            OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
            OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledBeforeCreate,
          ].includes(pageResult.attemptOutcome) && !state.createDispatched
        )
      }
      return (
        state.createDispatched &&
        pageResult.mutationState ===
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed &&
        (pageResult.attemptOutcome ===
          OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout ||
          pageResult.attemptOutcome ===
            OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed)
      )
    })()

    if (!isValidPageResult || !pageResult) {
      await settleOpenRouterManagementKeyAction(
        state,
        buildOpenRouterCreateFailure(
          state,
          OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
        ),
      )
      return
    }
    if (
      pageResult.requestId === request.requestId &&
      pageResult.operation === "create" &&
      pageResult.mutationState ===
        OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created &&
      createdAccessToken &&
      pageResult.label === request.operation.label
    ) {
      const createdResult = pageResult as Extract<
        TempWindowOpenRouterManagementKeyActionResult,
        { operation: "create"; mutationState: "created" }
      >
      const sessionIdentity = isOpenRouterClerkSessionIdentity(
        createdResult.sessionIdentity,
      )
        ? {
            userId: createdResult.sessionIdentity.userId,
            username: createdResult.sessionIdentity.username,
          }
        : undefined
      await settleOpenRouterManagementKeyAction(state, {
        requestId: createdResult.requestId,
        operation: "create",
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
        accessToken: createdAccessToken,
        label: createdResult.label,
        ...(sessionIdentity ? { sessionIdentity } : {}),
        attemptOutcome: state.cancelRequested
          ? OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledAfterCreate
          : OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
      })
      return
    }
    if (
      pageResult.mutationState ===
      OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched
    ) {
      const notDispatchedResult = pageResult as Extract<
        TempWindowOpenRouterManagementKeyActionResult,
        { operation: "create"; mutationState: "not_dispatched" }
      >
      await settleOpenRouterManagementKeyAction(state, {
        requestId: notDispatchedResult.requestId,
        operation: "create",
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
        attemptOutcome: notDispatchedResult.attemptOutcome,
        label: notDispatchedResult.label,
      })
      return
    }
    const unconfirmedResult = pageResult as Extract<
      TempWindowOpenRouterManagementKeyActionResult,
      { operation: "create"; mutationState: "dispatched_unconfirmed" }
    >
    await settleOpenRouterManagementKeyAction(state, {
      requestId: unconfirmedResult.requestId,
      operation: "create",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      attemptOutcome: unconfirmedResult.attemptOutcome,
      label: unconfirmedResult.label,
    })
  } catch {
    await settleOpenRouterManagementKeyAction(
      state,
      buildOpenRouterCreateFailure(
        state,
        pageDeadlineExpired
          ? OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout
          : OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      ),
    )
  }
}

/** Queues a dedicated OpenRouter page action and guards its lifecycle. */
export async function handleTempWindowOpenRouterManagementKeyAction(
  request: TempWindowOpenRouterManagementKeyActionParams,
  suppressMinimize: boolean,
  sendResponse: (
    response: TempWindowOpenRouterManagementKeyActionResult,
  ) => void,
  authorizeAtAcquire: AuthorizeTempContextAtAcquire = denyMissingProtectionBypassIntent,
) {
  if (
    !request ||
    typeof request.requestId !== "string" ||
    !request.requestId ||
    !request.operation ||
    request.operation.kind !== "create" ||
    typeof request.operation.label !== "string"
  ) {
    const untrusted = request as unknown as Record<string, unknown> | undefined
    const requestId =
      typeof untrusted?.requestId === "string" ? untrusted.requestId : ""
    sendResponse({
      requestId,
      operation: "create",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      label: "",
    })
    return
  }
  const state: OpenRouterManagementKeyActionState = {
    request,
    sendResponse,
    createDispatched: false,
    cancelRequested: false,
    settled: false,
    releaseStarted: false,
    contextAcquired: false,
  }
  if (openRouterManagementKeyPreCancelled.delete(request.requestId)) {
    state.cancelRequested = true
  }
  if (
    completedOpenRouterManagementKeyActions.has(request.requestId) ||
    openRouterManagementKeyActions.has(request.requestId)
  ) {
    sendResponse({
      requestId: request.requestId,
      operation: "create",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      label: request.operation.label,
    })
    return
  }
  openRouterManagementKeyActions.set(request.requestId, state)
  try {
    await tempWindowBackgroundRuntime.run(
      OPENROUTER_MANAGEMENT_KEYS_URL,
      {},
      () =>
        executeTempWindowOpenRouterManagementKeyAction(
          state,
          suppressMinimize,
          authorizeAtAcquire,
        ),
    )
  } catch {
    await settleOpenRouterManagementKeyAction(
      state,
      buildOpenRouterCreateFailure(state, "failed"),
    )
  }
}
