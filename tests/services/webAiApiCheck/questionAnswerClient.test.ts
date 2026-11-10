import { beforeEach, expect, it, vi } from "vitest"

import type { QuestionAnswerResult } from "~/services/verification/modelQuality/questionAnswer"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { runQuestionAnswerInBackground } from "~/services/verification/webAiApiCheck/questionAnswerClient"
import type { ApiCheckQuestionAnswerResponse } from "~/services/verification/webAiApiCheck/types"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock(
  "~/services/verification/webAiApiCheck/messaging",
  async (original) => ({
    ...(await original<
      typeof import("~/services/verification/webAiApiCheck/messaging")
    >()),
    sendWebAiApiCheckMessage: vi.fn(),
  }),
)
const request = {
  baseUrl: "https://example.invalid",
  apiKey: "secret",
  apiType: "openai-compatible" as const,
  modelId: "test",
  question: "Question",
  referenceAnswer: "21",
}
const result: QuestionAnswerResult = {
  question: "Question",
  referenceAnswer: "21",
  text: "21",
  answer: "21",
  outcome: "matched",
  latencyMs: 1,
}
beforeEach(() => vi.resetAllMocks())

it("returns the background result with one correlated request and removes cancellation after completion", async () => {
  const controller = new AbortController()
  vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
    success: true,
    result,
  })
  await expect(
    runQuestionAnswerInBackground({
      ...request,
      abortSignal: controller.signal,
    }),
  ).resolves.toEqual(result)
  expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
    WebAiApiCheckMessageTypes.RunQuestionAnswer,
    { ...request, runId: expect.any(String) },
  )
  controller.abort()
  expect(sendWebAiApiCheckMessage).toHaveBeenCalledOnce()
})
it("rejects an already stopped request without dispatch", async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    runQuestionAnswerInBackground({
      ...request,
      abortSignal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" })
  expect(sendWebAiApiCheckMessage).not.toHaveBeenCalled()
})
it("cancels the same run and rejects its late answer even when cancellation delivery fails", async () => {
  const deferred = createDeferred<ApiCheckQuestionAnswerResponse>()
  vi.mocked(sendWebAiApiCheckMessage)
    .mockReturnValueOnce(deferred.promise)
    .mockRejectedValueOnce(new Error("Port closed"))
  const controller = new AbortController()
  const run = runQuestionAnswerInBackground({
    ...request,
    abortSignal: controller.signal,
  })
  const rejection = expect(run).rejects.toMatchObject({ name: "AbortError" })
  const sent = vi.mocked(sendWebAiApiCheckMessage).mock.calls[0]![1] as {
    runId: string
  }
  controller.abort()
  expect(sendWebAiApiCheckMessage).toHaveBeenLastCalledWith(
    WebAiApiCheckMessageTypes.CancelRunProbe,
    { runId: sent.runId },
  )
  deferred.resolve({ success: true, result })
  await rejection
})
it.each([false, true])(
  "propagates background or transport failures and cleans up: %s",
  async (transport) => {
    const controller = new AbortController()
    if (transport)
      vi.mocked(sendWebAiApiCheckMessage).mockRejectedValueOnce(
        new Error("Unavailable"),
      )
    else
      vi.mocked(sendWebAiApiCheckMessage).mockResolvedValueOnce({
        success: false,
        error: "Unavailable",
      })
    await expect(
      runQuestionAnswerInBackground({
        ...request,
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow("Unavailable")
    controller.abort()
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledOnce()
  },
)
it("supports callers without a cancellation signal", async () => {
  vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
    success: true,
    result,
  })
  await expect(runQuestionAnswerInBackground(request)).resolves.toEqual(result)
})
