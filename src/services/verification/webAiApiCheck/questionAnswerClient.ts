import type { QuestionAnswerRequest } from "~/services/verification/modelQuality/questionAnswer"
import { safeRandomUUID } from "~/utils/core/identifier"

import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "./messaging"

/** Delegate one question to background while retaining caller-owned cancellation. */
export async function runQuestionAnswerInBackground({
  abortSignal,
  ...request
}: QuestionAnswerRequest) {
  abortSignal?.throwIfAborted()
  const runId = safeRandomUUID()
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
    abortSignal?.removeEventListener("abort", cancel)
  }
}
