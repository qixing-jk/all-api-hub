import { beforeEach, expect, it, vi } from "vitest"

import { runQuestionAnswerTest } from "~/services/verification/lazyRunners"

const { runner } = vi.hoisted(() => ({ runner: vi.fn() }))
vi.mock("~/services/verification/modelQuality/questionAnswer", () => ({
  runQuestionAnswerTest: runner,
}))
beforeEach(() => {
  runner.mockReset()
})

it("forwards question, streaming callback and cancellation to the on-demand runner", async () => {
  const request = {
    baseUrl: "https://example.com",
    apiKey: "key",
    apiType: "openai-compatible" as const,
    modelId: "model",
    question: "Question",
    referenceAnswer: "Answer",
    onProgress: vi.fn(),
    abortSignal: new AbortController().signal,
  }
  const result = {
    text: "Answer",
    answer: "Answer",
    outcome: "answered",
    latencyMs: 1,
  }
  runner.mockResolvedValue(result)
  expect(await runQuestionAnswerTest(request)).toBe(result)
  expect(runner).toHaveBeenCalledWith(request)
})

it("preserves runner failures for the caller's recovery path", async () => {
  const error = new Error("Generation unavailable")
  runner.mockRejectedValue(error)
  await expect(
    runQuestionAnswerTest({
      baseUrl: "https://example.com",
      apiKey: "key",
      apiType: "openai-compatible",
      modelId: "model",
      question: "Question",
      referenceAnswer: "Answer",
    }),
  ).rejects.toThrow("Generation unavailable")
})
