import type { QuestionAnswerRequest } from "~/services/verification/modelQuality/questionAnswer"
import { safeRandomUUID } from "~/utils/core/identifier"

import { subscribeGenerationProgress } from "./generationProgress"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "./messaging"

/** Delegate one question to background while retaining caller-owned cancellation. */
export async function runQuestionAnswerInBackground({
  abortSignal,
  onProgress,
  ...request
}: QuestionAnswerRequest) {
  abortSignal?.throwIfAborted()
  const runId = safeRandomUUID()
  const unsubscribe = onProgress
    ? subscribeGenerationProgress(runId, (progress) => {
        if (!abortSignal?.aborted) onProgress(progress)
      })
    : undefined
  const cancel = () => {
    void sendWebAiApiCheckMessage(WebAiApiCheckMessageTypes.CancelRunProbe, {
      runId,
    }).catch(() => undefined)
  }
  abortSignal?.addEventListener("abort", cancel, { once: true })
  try {
    const response = await sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RunQuestionAnswer,
      { ...request, runId },
    )
    abortSignal?.throwIfAborted()
    if (!response.success) throw new Error(response.error)
    return response.result
  } finally {
    unsubscribe?.()
    abortSignal?.removeEventListener("abort", cancel)
  }
}
