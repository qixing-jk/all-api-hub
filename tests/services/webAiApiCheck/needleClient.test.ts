import { beforeEach, expect, it, vi } from "vitest"

import {
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import type { NeedleRunControls } from "~/services/verification/modelQuality/needleRun"
import {
  onWebAiApiCheckMessage,
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import {
  discardNeedleCheckpointsInBackground,
  loadNeedleCounterInBackground,
  needleHistoryInBackground,
  runNeedleInBackground,
} from "~/services/verification/webAiApiCheck/needleClient"
import type { ApiCheckRunNeedleResponse } from "~/services/verification/webAiApiCheck/types"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { createNeedleResult } from "~~/tests/test-utils/needle"

vi.mock(
  "~/services/verification/webAiApiCheck/messaging",
  async (original) => ({
    ...(await original<
      typeof import("~/services/verification/webAiApiCheck/messaging")
    >()),
    sendWebAiApiCheckMessage: vi.fn(),
    onWebAiApiCheckMessage: vi.fn(() => vi.fn()),
  }),
)
const request = {
  baseUrl: "https://example.invalid",
  apiKey: "secret",
  apiType: "openai-compatible" as const,
  modelId: "test",
  seed: 42,
  requestHeaders: { "x-route": "private-route" },
}
beforeEach(() => vi.clearAllMocks())

it("reports unavailable history without presenting an empty successful result", async () => {
  vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({ success: false })
  await expect(needleHistoryInBackground.get(request)).rejects.toThrow(
    "Needle history unavailable",
  )
  await expect(loadNeedleCounterInBackground("test")).rejects.toThrow(
    "Unable to load context information",
  )
})

it("only confirms checkpoint discard after the background accepts it", async () => {
  vi.mocked(sendWebAiApiCheckMessage).mockResolvedValueOnce({ success: false })
  await expect(discardNeedleCheckpointsInBackground()).rejects.toThrow(
    "Could not discard",
  )
  vi.mocked(sendWebAiApiCheckMessage).mockResolvedValueOnce({ success: true })
  await expect(discardNeedleCheckpointsInBackground()).resolves.toBeUndefined()
  expect(sendWebAiApiCheckMessage).toHaveBeenLastCalledWith(
    WebAiApiCheckMessageTypes.DiscardNeedleCheckpoints,
    {},
  )
})

it("rejects writes from the page because the durable runner owns result persistence", async () => {
  await expect(
    needleHistoryInBackground.save(request, createNeedleResult()),
  ).rejects.toThrow("saved by the background runner")
  expect(sendWebAiApiCheckMessage).not.toHaveBeenCalled()
})

it("recovers a lost background response through readback without replaying the run", async () => {
  const recovered = createNeedleResult({
    reason: NEEDLE_RUN_REASONS.Interrupted,
  })
  vi.mocked(sendWebAiApiCheckMessage)
    .mockRejectedValueOnce(new Error("Port closed"))
    .mockResolvedValueOnce({ success: true, result: recovered })
  await expect(
    runNeedleInBackground({
      ...request,
      abortSignal: new AbortController().signal,
    }),
  ).resolves.toEqual(recovered)
  expect(sendWebAiApiCheckMessage).toHaveBeenCalledTimes(2)
  const first = vi.mocked(sendWebAiApiCheckMessage).mock.calls[0]![1] as {
    runId: string
  }
  expect(sendWebAiApiCheckMessage).toHaveBeenNthCalledWith(
    2,
    WebAiApiCheckMessageTypes.RunNeedle,
    expect.objectContaining({ runId: first.runId, recoverOnly: true }),
  )
})

it.each([false, true])(
  "preserves background rejection and checkpoint classification: %s",
  async (checkpointLimitReached) => {
    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValueOnce({
      success: false,
      checkpointLimitReached,
    })
    await expect(
      runNeedleInBackground({
        ...request,
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      message: "Long-context test failed",
      name: checkpointLimitReached ? "ContextCheckpointLimitError" : "Error",
    })
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledOnce()
  },
)

it("routes scoped stops to the current background run without aborting its progress subscription", async () => {
  const finished = createDeferred<ApiCheckRunNeedleResponse>()
  const stopped = createNeedleResult({ reason: NEEDLE_RUN_REASONS.Stopped })
  const remove = vi.fn()
  let progress:
    | Parameters<
        typeof onWebAiApiCheckMessage<
          typeof WebAiApiCheckMessageTypes.NeedleProgress
        >
      >[1]
    | undefined
  let controls: NeedleRunControls | undefined
  let runId: string | undefined
  vi.mocked(onWebAiApiCheckMessage).mockImplementation((_type, listener) => {
    progress = listener as typeof progress
    return remove
  })
  vi.mocked(sendWebAiApiCheckMessage).mockImplementation((async (
    type,
    data,
  ) => {
    if (type === WebAiApiCheckMessageTypes.RunNeedle) {
      runId = (data as { runId: string }).runId
      return finished.promise
    }
    return { success: true as const, cancelled: true }
  }) as typeof sendWebAiApiCheckMessage)
  const controller = new AbortController()
  const onProgress = vi.fn()
  const execution = runNeedleInBackground({
    ...request,
    abortSignal: controller.signal,
    onProgress,
    onControls: (value) => {
      controls = value
    },
  })
  try {
    progress!({
      id: 1,
      timestamp: 0,
      sender: {},
      type: WebAiApiCheckMessageTypes.NeedleProgress,
      data: {
        runId: runId!,
        result: createNeedleResult({ reason: NEEDLE_RUN_REASONS.Running }),
      },
    })
    expect(controls).toBeDefined()
    await expect(controls!.stopSelection({ depth: 50 })).resolves.toBe(true)
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
      WebAiApiCheckMessageTypes.StopNeedleSelection,
      { runId, selection: { depth: 50 } },
    )
    expect(controller.signal.aborted).toBe(false)
    expect(remove).not.toHaveBeenCalled()
    progress!({
      id: 1,
      timestamp: 0,
      sender: {},
      type: WebAiApiCheckMessageTypes.NeedleProgress,
      data: {
        runId: runId!,
        result: createNeedleResult({
          reason: NEEDLE_RUN_REASONS.Running,
          cancelled: [{ targetTokens: 8192, depth: 50 }],
        }),
      },
    })
    expect(onProgress).toHaveBeenCalledTimes(2)
  } finally {
    finished.resolve({ success: true, result: stopped })
    await execution
  }
  expect(remove).toHaveBeenCalledOnce()
  expect(await controls!.stopSelection({ depth: 90 })).toBe(false)
})

it("preserves the final interrupted cell when stopped during the first request", async () => {
  const controller = new AbortController()
  const stopped = createNeedleResult({
    reason: NEEDLE_RUN_REASONS.Stopped,
    cells: [
      {
        outcome: NEEDLE_OUTCOMES.Interrupted,
        targetTokens: 8192,
        depth: 10,
        actualDepth: 10,
        localInputTokens: 0,
      },
    ],
  })
  vi.mocked(sendWebAiApiCheckMessage).mockImplementation((async (type) => {
    if (type === WebAiApiCheckMessageTypes.RunNeedle) {
      controller.abort()
      return { success: true as const, result: stopped }
    }
    return { success: true as const, cancelled: true }
  }) as typeof sendWebAiApiCheckMessage)
  await expect(
    runNeedleInBackground({ ...request, abortSignal: controller.signal }),
  ).resolves.toEqual(stopped)
  expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
    WebAiApiCheckMessageTypes.CancelRunProbe,
    expect.objectContaining({ runId: expect.any(String) }),
  )
})

it("keeps custom headers in both history identity and provider dispatch", async () => {
  vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
    success: true,
    result: createNeedleResult(),
    summary: null,
  })
  await needleHistoryInBackground.get(request)
  await runNeedleInBackground({
    ...request,
    abortSignal: new AbortController().signal,
  })
  for (const type of [
    WebAiApiCheckMessageTypes.RunNeedle,
    WebAiApiCheckMessageTypes.NeedleHistory,
  ])
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
      type,
      expect.objectContaining({ requestHeaders: request.requestHeaders }),
    )
})

it("passes the model owner through background history lookup", async () => {
  const target = {
    kind: "profile-model" as const,
    profileId: "owner",
    modelId: "test",
  }
  vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
    success: true,
    summary: null,
  })
  await needleHistoryInBackground.get(request, target)
  expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
    WebAiApiCheckMessageTypes.NeedleHistory,
    expect.objectContaining({ historyTarget: target }),
  )
})
