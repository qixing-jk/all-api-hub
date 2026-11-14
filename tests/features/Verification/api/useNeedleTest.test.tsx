import { act, renderHook, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"

import { useNeedleTest } from "~/features/Verification/api/useNeedleTest"
import { createNeedlePlan } from "~/services/verification/modelQuality/needlePlan"
import * as needleRun from "~/services/verification/modelQuality/needleRun"
import { needleHistory } from "~/services/verification/verificationResultHistory/needleHistory"
import { LONG_CONTEXT_ERROR_NAMES } from "~/services/verification/webAiApiCheck/longContextConstants"
import { runDurableNeedleTest } from "~/services/verification/webAiApiCheck/needleCheckpoint"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { createNeedleResult } from "~~/tests/test-utils/needle"

const request = {
  baseUrl: "https://example.invalid",
  apiKey: "secret",
  modelId: "test",
  apiType: "openai-compatible" as const,
  mode: "non-streaming" as const,
  requestProfile: "default" as const,
  requestProfileEnhanced: false,
  secrets: ["secret"],
}
type Options = Parameters<typeof useNeedleTest>[0]
const counter = {
  encoding: "o200k_base",
  estimated: true,
  declaredInput: 16384,
}
const saved = createNeedleResult({ counter })

it("keeps the running matrix on its approved plan when capacity evidence changes", async () => {
  const pending = createDeferred<needleRun.NeedleResult>()
  const runner = vi.fn<NonNullable<Options["runner"]>>(() => pending.promise)
  const { result, rerender, options } = await setup({ runner })
  const approvedPlan = result.current.plan!
  act(() => void result.current.run())
  await waitFor(() => expect(runner).toHaveBeenCalledOnce())
  rerender({
    ...options,
    capacity: {
      lowerBoundTokens: 32768,
      counter: { encoding: "o200k_base", estimated: true },
    },
  })
  expect(result.current.plan!.limit).toBe(32768)
  expect(result.current.matrixPlan!.limit).toBe(approvedPlan.limit)
  expect(result.current.execution!.cells).toEqual([
    { targetTokens: approvedPlan.limit, depth: 10 },
    { targetTokens: approvedPlan.limit, depth: 50 },
    { targetTokens: approvedPlan.limit, depth: 90 },
  ])
  await act(async () => {
    pending.resolve(createNeedleResult({ counter, plan: approvedPlan }))
  })
  expect(result.current.result!.plan).toEqual(approvedPlan)
  expect(result.current.canRun).toBe(true)
})

it("restores saved measurements after a full run reports only empty progress", async () => {
  const previous = createNeedleResult({
    ...saved,
    cells: [
      {
        targetTokens: 8192,
        depth: 50,
        actualDepth: 50,
        localInputTokens: 8000,
        outcome: "hit",
      },
    ],
  })
  const { result } = await setup({
    historyAccess: {
      get: async () => ({
        result: previous,
        targetKey: "test",
        scopeKey: "test",
        verifiedAt: 1,
      }),
      save: vi.fn(),
    },
    runner: async (params) => {
      params.onProgress?.({ ...saved, reason: "running", cells: [] })
      throw new Error("Storage unavailable")
    },
  })
  await waitFor(() => expect(result.current.historical).toBe(true))
  await act(() => result.current.run())
  expect(result.current.result).toEqual(previous)
  expect(result.current.historical).toBe(true)
  expect(result.current.error).toBeTruthy()
})

it.each(["plan", "seed"])(
  "disables retesting when the displayed %s differs from the durable baseline while allowing a fresh run",
  async (difference) => {
    const previous = createNeedleResult({
      ...saved,
      plan:
        difference === "plan"
          ? createNeedlePlan({ counter, maxInputTokens: 8192 })
          : saved.plan,
      seed: difference === "seed" ? 456 : saved.seed,
    })
    const observed = createNeedleResult({
      ...saved,
      cells: [
        {
          targetTokens: 16384,
          depth: 50,
          actualDepth: 50,
          localInputTokens: 16000,
          outcome: "miss",
        },
      ],
    })
    const runner = vi
      .fn<NonNullable<Options["runner"]>>()
      .mockImplementationOnce(async (params) => {
        params.onProgress?.(observed)
        throw new Error("Storage unavailable")
      })
      .mockResolvedValue(observed)
    const { result } = await setup({
      runner,
      historyAccess: {
        get: async () => ({
          result: previous,
          targetKey: "test",
          scopeKey: "test",
          verifiedAt: 1,
        }),
        save: vi.fn(),
      },
    })
    await waitFor(() => expect(result.current.historical).toBe(true))
    await act(() => result.current.run())
    expect(result.current.result).toEqual(observed)
    expect(result.current.canRunSelection).toBe(false)
    expect(result.current.canRun).toBe(true)
    await act(() =>
      result.current.runSelection({ targetTokens: 16384, depth: 50 }),
    )
    expect(runner).toHaveBeenCalledOnce()
    await act(() => result.current.run())
    expect(runner).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
    expect(result.current.canRunSelection).toBe(true)
  },
)

it("rejects an invalid selection without locking subsequent runs", async () => {
  const runner = vi.fn().mockResolvedValue(saved)
  const { result } = await setup({ runner })
  await act(() => result.current.runSelection({ targetTokens: 1234 }))
  expect(result.current.error).toBeTruthy()
  expect(runner).not.toHaveBeenCalled()
  await act(() => result.current.run())
  expect(runner).toHaveBeenCalledOnce()
})

it("loads the new durable baseline after a late stop discards the completion response", async () => {
  const complete = createNeedleResult({
    ...saved,
    cells: [
      {
        targetTokens: 8192,
        depth: 50,
        actualDepth: 50,
        localInputTokens: 8000,
        outcome: "miss",
      },
    ],
  })
  const response = createDeferred<void>()
  const persisted = createDeferred<void>()
  let history = saved
  const runner = vi
    .fn<NonNullable<Options["runner"]>>()
    .mockImplementationOnce(async (params) => {
      history = complete
      params.onProgress?.(complete)
      persisted.resolve()
      await response.promise
      params.abortSignal.throwIfAborted()
      return complete
    })
    .mockResolvedValue(complete)
  const { result } = await setup({
    runner,
    historyAccess: {
      get: async () => ({
        result: history,
        targetKey: "test",
        scopeKey: "test",
        verifiedAt: 1,
      }),
      save: vi.fn(),
    },
  })
  await waitFor(() => expect(result.current.historical).toBe(true))
  let running!: Promise<void>
  act(() => {
    running = result.current.runSelection({ depth: 50 })
  })
  await act(async () => persisted.promise)
  act(() => result.current.stop())
  await act(async () => {
    response.resolve()
    await running
  })
  await act(() => result.current.runSelection({ depth: 50 }))
  expect(runner.mock.calls[1]![0].resumeFrom).toEqual(complete)
})

it("clears a previous history warning when failed-run readback succeeds", async () => {
  const get = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue({
      result: saved,
      targetKey: "test",
      scopeKey: "test",
      verifiedAt: 1,
    })
  const { result } = await setup({
    historyAccess: { get, save: vi.fn() },
    runner: async () => {
      throw new Error("Run failed")
    },
  })
  await waitFor(() => expect(result.current.historyError).toBe(true))
  await act(() => result.current.run())
  expect(result.current.historyError).toBe(false)
  expect(result.current.error).toBeTruthy()
})

it.each([
  { hasSummary: true, narrowDraft: false },
  { hasSummary: false, narrowDraft: false },
  { hasSummary: false, narrowDraft: true },
])(
  "recovers retained measurements before a disjoint retry after failed history writes (earlier summary: $hasSummary, narrower draft: $narrowDraft)",
  async ({ hasSummary, narrowDraft }) => {
    const observed = createNeedleResult({
      ...saved,
      cells: [
        {
          targetTokens: 8192,
          depth: 50,
          actualDepth: 50,
          localInputTokens: 8000,
          outcome: "miss",
        },
      ],
    })
    const next = {
      targetTokens: 8192,
      depth: 10,
      actualDepth: 10,
      localInputTokens: 8000,
      outcome: "hit" as const,
    }
    if (hasSummary) await needleHistory.save(request, saved)
    const save = vi
      .spyOn(needleHistory, "save")
      .mockRejectedValueOnce(new Error("Storage unavailable"))
      .mockRejectedValueOnce(new Error("Storage unavailable"))
    const run = vi
      .spyOn(needleRun, "runNeedleTest")
      .mockImplementationOnce(async (params) => {
        params.onProgress?.(observed)
        await params.onCheckpoint?.(observed)
        return observed
      })
      .mockImplementationOnce(async (params) => ({
        ...params.resumeFrom!,
        cells: [...params.resumeFrom!.cells, next],
      }))
    try {
      const { result } = await setup({
        runner: (params, target) => runDurableNeedleTest(params, false, target),
        historyAccess: needleHistory,
      })
      await waitFor(() => expect(result.current.historical).toBe(hasSummary))
      act(() => result.current.setSeedDraft("123"))
      await act(() => result.current.runSelection({ depth: 50 }))
      expect(result.current.result).toEqual(observed)
      expect(result.current.historical).toBe(false)
      expect(result.current.error).toBeTruthy()
      // A stale saved baseline needs readback; an absent baseline can use the
      // checkpoint recovered during this explicit selection request.
      act(() => result.current.setSeedDraft("456"))
      if (narrowDraft) act(() => result.current.setLimitDraft("1024"))
      await act(() => result.current.runSelection({ depth: 10 }))
      if (hasSummary || narrowDraft) {
        expect(run).toHaveBeenCalledOnce()
        expect(result.current.error).toBeTruthy()
        expect((await needleHistory.get(request))?.result.cells).toEqual(
          observed.cells,
        )
        expect(result.current.matrixPlan?.limit).toBe(observed.plan.limit)
        expect(result.current.canRunSelection).toBe(true)
        await act(() => result.current.runSelection({ depth: 10 }))
      }
      expect(run).toHaveBeenCalledTimes(2)
      expect(run.mock.calls[1]![0]).toMatchObject({
        selection: { depth: 10 },
        seed: observed.seed,
        resumeFrom: { cells: observed.cells },
      })
      expect(result.current.result?.cells).toEqual([...observed.cells, next])
      expect(result.current.error).toBeNull()
    } finally {
      save.mockRestore()
      run.mockRestore()
    }
  },
)

it("labels readback as historical when a failed run never produced progress", async () => {
  const { result } = await setup({
    historyAccess: {
      get: async () => ({
        result: saved,
        targetKey: "test",
        scopeKey: "test",
        verifiedAt: 1,
      }),
      save: vi.fn(),
    },
    runner: async () => {
      throw new Error("Run failed")
    },
  })
  await waitFor(() => expect(result.current.historical).toBe(true))
  await act(() => result.current.run())
  expect(result.current.result).toEqual(saved)
  expect(result.current.historical).toBe(true)
  expect(result.current.error).toBeTruthy()
})

async function setup(overrides: Partial<Options> = {}) {
  const options: Options = {
    enabled: true,
    blocked: false,
    contextKey: "test",
    modelId: "test",
    resolveRequest: async () => request,
    resolveHistoryRequest: async () => request,
    loadCounter: async () => counter,
    historyAccess: { get: async () => null, save: vi.fn() },
    runner: vi.fn().mockResolvedValue(saved),
    ...overrides,
  }
  const hook = renderHook((props: Options) => useNeedleTest(props), {
    initialProps: options,
  })
  await waitFor(() => expect(hook.result.current.counter).toEqual(counter))
  return { ...hook, options }
}

it("retries failed metadata and history loads without dispatching a provider request", async () => {
  const loadCounter = vi
    .fn()
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValue(counter)
  const get = vi
    .fn()
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValue(null)
  const runner = vi.fn()
  const { result } = renderHook(() =>
    useNeedleTest({
      enabled: true,
      blocked: false,
      contextKey: "retry",
      modelId: "test",
      resolveRequest: async () => request,
      loadCounter,
      runner,
      historyAccess: { get, save: vi.fn() },
    }),
  )
  await waitFor(() => expect(result.current.historyError).toBe(true))
  expect(result.current.error).toBeTruthy()
  expect(result.current.canRun).toBe(false)
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.canRun).toBe(true))
  expect(result.current.historyError).toBe(false)
  expect(result.current.error).toBeNull()
  expect(runner).not.toHaveBeenCalled()
})

it("rejects invalid sample IDs without dispatch and recovers when corrected", async () => {
  const runner = vi.fn().mockResolvedValue(saved)
  const { result } = await setup({ runner })
  for (const value of ["-1", "1.5", "4294967296", "not-a-number"]) {
    act(() => result.current.setSeedDraft(value))
    expect(result.current.invalid).toBe(true)
    await act(() => result.current.run())
    expect(runner).not.toHaveBeenCalled()
  }
  act(() => result.current.setSeedDraft("42"))
  await act(() => result.current.run())
  expect(runner).toHaveBeenCalledWith(
    expect.objectContaining({ seed: 42 }),
    undefined,
  )
})

it("refuses to reuse measurements after the resolved connection changes", async () => {
  const runner = vi.fn().mockResolvedValue(saved)
  const { result } = await setup({
    runner,
    resolveRequest: async () => ({ ...request, apiKey: "different" }),
    historyAccess: {
      get: async () => ({
        result: saved,
        targetKey: "test",
        scopeKey: "test",
        verifiedAt: 1,
      }),
      save: vi.fn(),
    },
  })
  await waitFor(() => expect(result.current.historical).toBe(true))
  await act(() => result.current.runSelection({ depth: 50 }))
  expect(runner).not.toHaveBeenCalled()
  expect(result.current.error).toBeTruthy()
  expect(result.current.result).toEqual(saved)
  // Readback has now loaded the selected connection's own saved baseline.
  await act(() => result.current.runSelection({ depth: 50 }))
  expect(runner).toHaveBeenCalledOnce()
})

it.each([
  LONG_CONTEXT_ERROR_NAMES.Busy,
  LONG_CONTEXT_ERROR_NAMES.NeedleCheckpoint,
  "Error",
])(
  "finishes a failed run with its observed measurements and exposes %s recovery",
  async (name) => {
    const failure = Object.assign(new Error("secret unavailable"), { name })
    const discard = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined)
    const { result } = await setup({
      discardCheckpoints: discard,
      runner: async (params) => {
        params.onProgress?.({
          ...saved,
          reason: "running",
          inFlight: { targetTokens: 8192, depth: 10 },
        })
        throw failure
      },
    })
    await act(() => result.current.run())
    expect(result.current.running).toBe(false)
    expect(result.current.result).toMatchObject({
      reason: "error",
      inFlight: undefined,
      pending: undefined,
    })
    expect(result.current.error).toBeTruthy()
    expect(result.current.error).not.toContain("secret")
    expect(Boolean(result.current.discard)).toBe(
      name === LONG_CONTEXT_ERROR_NAMES.NeedleCheckpoint,
    )
    if (result.current.discard) {
      await act(() => result.current.discard!())
      expect(result.current.checkpointError).toBe(true)
      expect(result.current.error).toBeTruthy()
      await act(() => result.current.discard!())
      expect(result.current.checkpointError).toBe(false)
      expect(result.current.error).toBeNull()
    }
  },
)

it("ignores late history and run completion after the workspace is cleared", async () => {
  const history =
    createDeferred<
      Awaited<ReturnType<NonNullable<Options["historyAccess"]>["get"]>>
    >()
  const finish = createDeferred<typeof saved>()
  const entered = createDeferred<void>()
  const { result } = await setup({
    historyAccess: { get: () => history.promise, save: vi.fn() },
    runner: async () => {
      entered.resolve()
      return finish.promise
    },
  })
  let running!: Promise<void>
  act(() => {
    running = result.current.run()
  })
  await act(async () => entered.promise)
  act(() => result.current.clearHistory())
  await act(async () => {
    history.resolve({
      result: saved,
      targetKey: "test",
      scopeKey: "test",
      verifiedAt: 1,
    })
    finish.resolve(saved)
    await running
  })
  expect(result.current.result).toBeNull()
  expect(result.current.historical).toBe(false)
  expect(result.current.running).toBe(false)
})

it("does not dispatch a pending request after its workspace is replaced", async () => {
  const pending = createDeferred<typeof request>()
  const runner = vi.fn()
  const { result, rerender, options } = await setup({
    resolveRequest: () => pending.promise,
    runner,
  })
  let running!: Promise<void>
  act(() => {
    running = result.current.run()
  })
  const oldStop = result.current.stopSelection!
  rerender({ ...options, contextKey: "replacement" })
  await act(async () => {
    await oldStop({ depth: 50 })
    pending.resolve(request)
    await running
  })
  expect(runner).not.toHaveBeenCalled()
  expect(result.current.result).toBeNull()
  expect(result.current.error).toBeNull()
})

it.each([false, true])(
  "retests after cancelling all cells before credentials resolve, with saved history: %s",
  async (hasHistory) => {
    const pending = createDeferred<typeof request>()
    const runner = vi.fn().mockResolvedValue(saved)
    const { result } = await setup({
      resolveRequest: () => pending.promise,
      runner,
      historyAccess: {
        get: async () =>
          hasHistory
            ? {
                result: saved,
                targetKey: "test",
                scopeKey: "test",
                verifiedAt: 1,
              }
            : null,
        save: vi.fn(),
      },
    })
    if (hasHistory)
      await waitFor(() => expect(result.current.historical).toBe(true))
    let first!: Promise<void>
    act(() => {
      first = result.current.runSelection({ depth: 50 })
    })
    await act(() => result.current.stopSelection!({ depth: 50 }))
    expect(result.current.result?.reason).toBe("stopped")
    await act(async () => {
      pending.resolve(request)
      await first
    })
    expect(runner).not.toHaveBeenCalled()
    await act(() => result.current.runSelection({ depth: 50 }))
    expect(runner).toHaveBeenCalledOnce()
    expect(runner.mock.calls[0]![0].resumeFrom).toEqual(
      hasHistory ? saved : undefined,
    )
    expect(result.current.error).toBeNull()
  },
)

it("uses finalized saved measurements when retrying cells after a runner failure", async () => {
  const finalized = createNeedleResult({
    ...saved,
    reason: "error",
    cells: [
      {
        targetTokens: 8192,
        depth: 10,
        actualDepth: 10,
        localInputTokens: 8000,
        outcome: "hit",
      },
    ],
  })
  let persisted = saved
  const runner = vi
    .fn()
    .mockImplementationOnce(async () => {
      persisted = finalized
      throw new Error("Preparation failed")
    })
    .mockResolvedValue(finalized)
  const { result } = await setup({
    runner,
    historyAccess: {
      get: async () => ({
        result: persisted,
        targetKey: "test",
        scopeKey: "test",
        verifiedAt: 1,
      }),
      save: vi.fn(),
    },
  })
  await waitFor(() => expect(result.current.historical).toBe(true))
  await act(() => result.current.runSelection({ depth: 10 }))
  expect(result.current.error).toBeTruthy()
  await act(() => result.current.runSelection({ depth: 50 }))
  expect(runner.mock.calls[1]![0].resumeFrom).toEqual(finalized)
})

it("reports failed history readback after a run fails without hiding the run error", async () => {
  const get = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockRejectedValue(new Error("History unavailable"))
  const { result } = await setup({
    historyAccess: { get, save: vi.fn() },
    runner: async () => {
      throw new Error("Run failed")
    },
  })
  await act(() => result.current.run())
  expect(result.current.historyError).toBe(true)
  expect(result.current.error).toBeTruthy()
  expect(result.current.running).toBe(false)
})

it("forwards a queued stop when background controls arrive and exposes a failed stop for retry", async () => {
  const resolveRequest = createDeferred<typeof request>()
  const finish = createDeferred<typeof saved>()
  const entered = createDeferred<void>()
  const stopSelection = vi.fn().mockRejectedValue(new Error("Stop failed"))
  const { result } = await setup({
    resolveRequest: () => resolveRequest.promise,
    runner: async (params) => {
      params.onControls?.({ stopSelection })
      entered.resolve()
      return finish.promise
    },
  })
  let running!: Promise<void>
  act(() => {
    running = result.current.runSelection({ depth: 50 })
  })
  await act(() =>
    result.current.stopSelection!({ targetTokens: 8192, depth: 50 }),
  )
  await act(async () => {
    resolveRequest.resolve(request)
    await entered.promise
  })
  expect(stopSelection).toHaveBeenCalledWith({ targetTokens: 8192, depth: 50 })
  expect(result.current.stopError).toEqual({ targetTokens: 8192, depth: 50 })
  await act(async () => {
    finish.resolve(saved)
    await running
  })
})
