import { CONTEXT_CHECKPOINT_LIMIT_ERROR_NAME } from "~/services/verification/modelQuality/contextCapacityConstants"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { safeRandomUUID } from "~/utils/core/identifier"

type Response<T> =
  | { success: true; result: T }
  | {
      success: false
      error?: string
      errorName?: string
      checkpointLimitReached?: boolean
    }

/** Shared cancellation/progress transport; recovery is read-only and never replays input. */
export async function runLongContextInBackground<T>(options: {
  signal: AbortSignal
  acceptStoppedResult?: (result: T) => boolean
  subscribe: (runId: string) => () => void
  dispatch: (runId: string, recoverOnly: boolean) => Promise<Response<T>>
}): Promise<T> {
  options.signal.throwIfAborted()
  const runId = safeRandomUUID()
  const remove = options.subscribe(runId)
  let listening = true
  const dispose = () => {
    if (listening) {
      listening = false
      remove()
    }
  }
  const cancel = () => {
    dispose()
    void sendWebAiApiCheckMessage(WebAiApiCheckMessageTypes.CancelRunProbe, {
      runId,
    }).catch(() => undefined)
  }
  options.signal.addEventListener("abort", cancel, { once: true })
  try {
    const response = await options
      .dispatch(runId, false)
      .catch(async (error) => {
        options.signal.throwIfAborted()
        const recovered = await options.dispatch(runId, true).catch(() => null)
        if (!recovered?.success) throw error
        return recovered
      })
    if (!response.success || !options.acceptStoppedResult?.(response.result))
      options.signal.throwIfAborted()
    if (!response.success)
      throw Object.assign(
        new Error(response.error ?? "Long-context test failed"),
        {
          name: response.checkpointLimitReached
            ? CONTEXT_CHECKPOINT_LIMIT_ERROR_NAME
            : response.errorName ?? "Error",
        },
      )
    return response.result
  } finally {
    options.signal.removeEventListener("abort", cancel)
    dispose()
  }
}
