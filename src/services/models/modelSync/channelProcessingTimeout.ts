import type { ExecutionItemResult } from "~/types/managedSiteModelSync"
import { t } from "~/utils/i18n/core"

/**
 * Normalize user-configured per-channel timeout; non-positive values are unlimited.
 */
export function normalizeChannelProcessingTimeout(
  timeoutSeconds: number | null | undefined,
) {
  if (
    typeof timeoutSeconds !== "number" ||
    !Number.isFinite(timeoutSeconds) ||
    timeoutSeconds <= 0
  ) {
    return 0
  }

  return Math.max(1, Math.trunc(timeoutSeconds))
}

/**
 * Build the stable timeout message stored in model-sync execution history.
 */
function getChannelProcessingTimeoutMessage(timeoutSeconds: number) {
  return t("managedSiteModelSync:execution.errors.channelTimeout", {
    count: timeoutSeconds,
  })
}

type ChannelProcessingSnapshot = Pick<
  ExecutionItemResult,
  "channelId" | "channelName"
> & { oldModels: string[] }

/**
 * Create a channel-level failure result when processing exceeds the configured timeout.
 */
function createChannelProcessingTimeoutResult(
  snapshot: ChannelProcessingSnapshot,
  maxRetries: number,
  timeoutSeconds: number,
): ExecutionItemResult {
  return {
    channelId: snapshot.channelId,
    channelName: snapshot.channelName,
    ok: false,
    message: getChannelProcessingTimeoutMessage(timeoutSeconds),
    attempts: maxRetries + 1,
    finishedAt: Date.now(),
    oldModels: snapshot.oldModels,
  }
}

/**
 * Run per-channel work with a bounded timeout and cooperative cancellation signal.
 */
export async function runWithChannelProcessingTimeout(
  work: (abortSignal?: AbortSignal) => Promise<ExecutionItemResult>,
  snapshot: ChannelProcessingSnapshot,
  maxRetries: number,
  timeoutSeconds: number | null | undefined,
): Promise<ExecutionItemResult> {
  const normalizedTimeout = normalizeChannelProcessingTimeout(timeoutSeconds)
  if (normalizedTimeout === 0) {
    return work()
  }

  const timeoutMs = normalizedTimeout * 1000
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<ExecutionItemResult>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve(
            createChannelProcessingTimeoutResult(
              snapshot,
              maxRetries,
              normalizedTimeout,
            ),
          )
          controller.abort(
            new Error(getChannelProcessingTimeoutMessage(normalizedTimeout)),
          )
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}
