import { beforeEach, expect, it, vi } from "vitest"

import {
  API_TYPES,
  API_VERIFICATION_MODES,
} from "~/services/verification/aiApiVerification"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"
import { PELICAN_EXECUTION_MODES } from "~/services/verification/modelQuality/constants"
import { subscribeGenerationProgress } from "~/services/verification/webAiApiCheck/generationProgress"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { runPelicanInBackground } from "~/services/verification/webAiApiCheck/pelicanClient"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock("~/services/verification/webAiApiCheck/generationProgress", () => ({
  subscribeGenerationProgress: vi.fn(),
}))
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
  apiType: API_TYPES.OPENAI_COMPATIBLE,
  modelId: "test",
  mode: API_VERIFICATION_MODES.Streaming,
  requestProfile: API_VERIFICATION_REQUEST_PROFILES.Default,
  requestProfileEnhanced: false,
  secrets: ["secret"],
}
const unsubscribe = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(subscribeGenerationProgress).mockReturnValue(unsubscribe)
})

it("sends only drawing configuration and releases progress and cancellation after completion", async () => {
  const controller = new AbortController()
  const result = { svg: "<svg/>" }
  vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
    success: true,
    result,
  } as never)
  const onProgress = vi.fn()
  await expect(
    runPelicanInBackground({
      ...request,
      prompt: "Draw",
      executionMode: PELICAN_EXECUTION_MODES.Agent,
      onProgress,
      abortSignal: controller.signal,
    }),
  ).resolves.toEqual(result)
  const runId = vi.mocked(subscribeGenerationProgress).mock.calls[0]![0]
  expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
    WebAiApiCheckMessageTypes.RunPelican,
    {
      runId,
      baseUrl: request.baseUrl,
      apiKey: request.apiKey,
      apiType: request.apiType,
      modelId: request.modelId,
      mode: request.mode,
      requestProfile: request.requestProfile,
      requestProfileEnhanced: false,
      executionMode: PELICAN_EXECUTION_MODES.Agent,
      prompt: "Draw",
    },
  )
  expect(unsubscribe).toHaveBeenCalledOnce()
  controller.abort()
  expect(sendWebAiApiCheckMessage).toHaveBeenCalledOnce()
})

it("cancels the same run, suppresses late progress and rejects a late result", async () => {
  const deferred =
    createDeferred<Awaited<ReturnType<typeof sendWebAiApiCheckMessage>>>()
  vi.mocked(sendWebAiApiCheckMessage)
    .mockReturnValueOnce(deferred.promise)
    .mockRejectedValueOnce(new Error("Port closed"))
  const controller = new AbortController()
  const onProgress = vi.fn()
  const run = runPelicanInBackground({
    ...request,
    onProgress,
    abortSignal: controller.signal,
  })
  const rejected = expect(run).rejects.toMatchObject({ name: "AbortError" })
  const [runId, publish] = vi.mocked(subscribeGenerationProgress).mock.calls[0]!
  const progress = { text: "partial", reasoning: "", tools: [], step: 1 }
  publish(progress)
  expect(onProgress).toHaveBeenCalledWith(progress)
  controller.abort()
  publish({ ...progress, text: "late" })
  expect(onProgress).toHaveBeenCalledOnce()
  expect(sendWebAiApiCheckMessage).toHaveBeenLastCalledWith(
    WebAiApiCheckMessageTypes.CancelRunProbe,
    { runId },
  )
  deferred.resolve({ success: true, result: { svg: "<svg/>" } } as never)
  await rejected
  expect(unsubscribe).toHaveBeenCalledOnce()
})

it("rejects an already cancelled request without subscribing or dispatching", async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    runPelicanInBackground({ ...request, abortSignal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" })
  expect(subscribeGenerationProgress).not.toHaveBeenCalled()
  expect(sendWebAiApiCheckMessage).not.toHaveBeenCalled()
})

it.each([undefined, "Drawing unavailable"])(
  "preserves background failure fallback: %s",
  async (error) => {
    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: false,
      error,
    } as never)
    const controller = new AbortController()
    await expect(
      runPelicanInBackground({ ...request, abortSignal: controller.signal }),
    ).rejects.toThrow(error ?? "Pelican test failed")
    expect(unsubscribe).toHaveBeenCalledOnce()
    controller.abort()
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledOnce()
  },
)
