import { act, renderHook, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"

import { useContextCapacity } from "~/features/Verification/api/useContextCapacity"
import type { ContextCapacitySummary } from "~/services/verification/verificationResultHistory/types"

const request = {
  baseUrl: "https://example.invalid",
  apiKey: "secret",
  modelId: "model",
  apiType: "openai-compatible" as const,
  mode: "streaming" as const,
  requestProfile: "default" as const,
  requestProfileEnhanced: false,
  secrets: [],
}
const saved: ContextCapacitySummary = {
  targetKey: "fixture",
  scopeKey: "fixture",
  verifiedAt: 1,
  apiType: "openai-compatible",
  modelId: "model",
  lowerBoundTokens: 4096,
  reason: "test-limit",
  requests: 1,
  outputLimited: false,
}

it("restores history when metadata enables capacity without changing the connection", async () => {
  const get = vi.fn().mockResolvedValue(saved)
  const { result, rerender } = renderHook(
    ({ enabled }) =>
      useContextCapacity({
        enabled,
        blocked: false,
        contextKey: "same",
        resolveRequest: async () => request,
        historyAccess: { get, save: vi.fn() },
      }),
    { initialProps: { enabled: false } },
  )
  expect(get).not.toHaveBeenCalled()
  rerender({ enabled: true })
  await waitFor(() => expect(result.current.history).toEqual(saved))
})

it("clearing history invalidates a delayed restore", async () => {
  let release!: (value: ContextCapacitySummary) => void
  const get = vi.fn(
    () =>
      new Promise<ContextCapacitySummary>((resolve) => {
        release = resolve
      }),
  )
  const { result } = renderHook(() =>
    useContextCapacity({
      enabled: true,
      blocked: false,
      contextKey: "same",
      resolveRequest: async () => request,
      historyAccess: { get, save: vi.fn() },
    }),
  )
  await waitFor(() => expect(get).toHaveBeenCalledOnce())
  act(() => result.current.clearHistory())
  await act(async () => release(saved))
  expect(result.current.history).toBeNull()
  expect(result.current.result).toBeNull()
})

it("starts a new measurement when effective credentials change before continuation", async () => {
  let apiKey = "first"
  const runner = vi.fn().mockResolvedValue({
    lowerBoundTokens: 1024,
    reason: "budget",
    attempts: [],
    counter: { encoding: "o200k_base", estimated: true },
    inputLimit: 8192,
  })
  const { result } = renderHook(() =>
    useContextCapacity({
      enabled: true,
      blocked: false,
      contextKey: "stable-id",
      resolveRequest: async () => ({ ...request, apiKey }),
      runner,
    }),
  )
  act(() => result.current.run())
  await waitFor(() => expect(result.current.result?.reason).toBe("budget"))
  apiKey = "rotated"
  act(() => result.current.run())
  await waitFor(() => expect(runner).toHaveBeenCalledTimes(2))
  expect(runner.mock.calls[1]?.[0]?.resumeFrom).toBeUndefined()
})

it.each([false, true])(
  "keeps an old save from changing a replacement connection: failure=%s",
  async (failure) => {
    let settle!: () => void
    const pending = new Promise<never>((resolve, reject) => {
      settle = () =>
        failure
          ? reject(new Error("disk unavailable"))
          : resolve(saved as never)
    })
    const save = vi.fn(() => pending)
    const runner = vi.fn().mockResolvedValue({
      lowerBoundTokens: 4096,
      reason: "test-limit",
      attempts: [],
      counter: { encoding: "o200k_base", estimated: true },
    })
    const { result, rerender } = renderHook(
      ({ contextKey }) =>
        useContextCapacity({
          enabled: true,
          blocked: false,
          contextKey,
          resolveRequest: async () => request,
          runner,
          historyAccess: { get: vi.fn().mockResolvedValue(null), save },
        }),
      { initialProps: { contextKey: "old" } },
    )
    act(() => result.current.run())
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    rerender({ contextKey: "new" })
    await act(async () => settle())
    expect(result.current.history).toBeNull()
    expect(result.current.historyError).toBe(false)
  },
)
it("retains a live result and reports an optional history save failure", async () => {
  const runner = vi.fn().mockResolvedValue({
    lowerBoundTokens: 4096,
    reason: "test-limit",
    attempts: [],
    counter: { encoding: "o200k_base", estimated: true },
  })
  const { result } = renderHook(() =>
    useContextCapacity({
      enabled: true,
      blocked: false,
      contextKey: "current",
      resolveRequest: async () => request,
      runner,
      historyAccess: {
        get: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockRejectedValue(new Error("disk unavailable")),
      },
    }),
  )
  act(() => result.current.run())
  await waitFor(() => expect(result.current.historyError).toBe(true))
  expect(result.current.result?.lowerBoundTokens).toBe(4096)
})
it("records a resolved request failure as history without exposing its secrets", async () => {
  const save = vi.fn().mockResolvedValue(saved)
  const { result } = renderHook(() =>
    useContextCapacity({
      enabled: true,
      blocked: false,
      contextKey: "failure",
      resolveRequest: async () => ({ ...request, secrets: ["secret"] }),
      runner: vi.fn().mockRejectedValue(new Error("secret failed")),
      historyAccess: {
        get: vi.fn().mockRejectedValue(new Error("unavailable")),
        save,
      },
    }),
  )
  await waitFor(() => expect(result.current.historyError).toBe(true))
  act(() => result.current.run())
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(expect.anything(), null, undefined),
  )
  expect(result.current.error).not.toContain("secret")
})

it("offers explicit cleanup after the interrupted-record limit and unlocks new tests after it completes", async () => {
  let release!: () => void
  const discardCheckpoints = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  const runner = vi.fn().mockRejectedValue(
    Object.assign(new Error("limit reached"), {
      name: "ContextCheckpointLimitError",
    }),
  )
  const { result } = renderHook(() =>
    useContextCapacity({
      enabled: true,
      blocked: false,
      contextKey: "limit",
      resolveRequest: async () => request,
      runner,
      discardCheckpoints,
    }),
  )
  act(() => result.current.run())
  await waitFor(() => expect(result.current.checkpointLimitReached).toBe(true))
  expect(result.current.canRun).toBe(false)
  act(() => result.current.discardCheckpoints!())
  expect(result.current.discardingCheckpoints).toBe(true)
  expect(result.current.canRun).toBe(false)
  await act(async () => release())
  expect(result.current.checkpointLimitReached).toBe(false)
  expect(result.current.error).toBeNull()
  expect(result.current.canRun).toBe(true)
})

it("keeps the discard control retryable when cleanup fails", async () => {
  const discardCheckpoints = vi
    .fn()
    .mockRejectedValueOnce(new Error("cleanup unavailable"))
    .mockResolvedValue(undefined)
  const runner = vi.fn().mockRejectedValue(
    Object.assign(new Error("limit"), {
      name: "ContextCheckpointLimitError",
    }),
  )
  const { result } = renderHook(() =>
    useContextCapacity({
      enabled: true,
      blocked: false,
      contextKey: "limit",
      resolveRequest: async () => request,
      runner,
      discardCheckpoints,
    }),
  )
  act(() => result.current.run())
  await waitFor(() => expect(result.current.checkpointLimitReached).toBe(true))
  act(() => result.current.discardCheckpoints!())
  await waitFor(() => expect(result.current.error).toBe("cleanup unavailable"))
  expect(result.current.checkpointLimitReached).toBe(true)
  expect(result.current.discardingCheckpoints).toBe(false)
  act(() => result.current.discardCheckpoints!())
  await waitFor(() => expect(result.current.canRun).toBe(true))
})

it.each([false, true])(
  "does not let an old cleanup change a replacement connection: failure=%s",
  async (failure) => {
    let settle!: () => void
    const pending = new Promise<void>((resolve, reject) => {
      settle = () =>
        failure ? reject(new Error("old cleanup failed")) : resolve()
    })
    const runner = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("limit"), {
          name: "ContextCheckpointLimitError",
        }),
      )
      .mockRejectedValue(new Error("current failure"))
    const { result, rerender } = renderHook(
      ({ contextKey }) =>
        useContextCapacity({
          enabled: true,
          blocked: false,
          contextKey,
          resolveRequest: async () => request,
          runner,
          discardCheckpoints: () => pending,
        }),
      { initialProps: { contextKey: "old" } },
    )
    act(() => result.current.run())
    await waitFor(() =>
      expect(result.current.checkpointLimitReached).toBe(true),
    )
    act(() => result.current.discardCheckpoints!())
    rerender({ contextKey: "new" })
    act(() => result.current.run())
    await waitFor(() => expect(result.current.error).toBe("current failure"))
    await act(async () => settle())
    expect(result.current.error).toBe("current failure")
    expect(result.current.discardingCheckpoints).toBe(false)
  },
)

it("keeps an accepted budget ledger when storage blocks continuation before dispatch", async () => {
  const paused = {
    lowerBoundTokens: 1024,
    reason: "budget",
    attempts: [{ targetTokens: 1024, outcome: "accepted" }],
    counter: { encoding: "o200k_base", estimated: true },
    inputLimit: 8192,
  }
  const runner = vi
    .fn()
    .mockResolvedValueOnce(paused)
    .mockRejectedValueOnce(
      Object.assign(new Error("limit"), {
        name: "ContextCheckpointLimitError",
      }),
    )
    .mockResolvedValueOnce({ ...paused, reason: "test-limit" })
  const save = vi.fn().mockResolvedValue(saved)
  const { result } = renderHook(() =>
    useContextCapacity({
      enabled: true,
      blocked: false,
      contextKey: "same",
      resolveRequest: async () => request,
      runner,
      historyAccess: { get: vi.fn().mockResolvedValue(null), save },
      discardCheckpoints: vi.fn().mockResolvedValue(undefined),
    }),
  )
  act(() => result.current.run())
  await waitFor(() => expect(result.current.result?.reason).toBe("budget"))
  act(() => result.current.run())
  await waitFor(() => expect(result.current.checkpointLimitReached).toBe(true))
  expect(result.current.result).toEqual(paused)
  act(() => result.current.discardCheckpoints!())
  await waitFor(() => expect(result.current.canRun).toBe(true))
  act(() => result.current.run())
  await waitFor(() => expect(runner).toHaveBeenCalledTimes(3))
  expect(runner.mock.calls[2]?.[0]).toMatchObject({ resumeFrom: paused })
  expect(save.mock.calls.some((call) => call[1] === null)).toBe(false)
})

it("restores the matching saved summary after inactive records are discarded", async () => {
  const get = vi.fn().mockResolvedValue(saved)
  const runner = vi.fn().mockRejectedValue(
    Object.assign(new Error("limit"), {
      name: "ContextCheckpointLimitError",
    }),
  )
  const { result } = renderHook(() =>
    useContextCapacity({
      enabled: true,
      blocked: false,
      contextKey: "same",
      resolveRequest: async () => request,
      runner,
      historyAccess: { get, save: vi.fn() },
      discardCheckpoints: vi.fn().mockResolvedValue(undefined),
    }),
  )
  await waitFor(() => expect(result.current.history).toEqual(saved))
  act(() => result.current.run())
  await waitFor(() => expect(result.current.checkpointLimitReached).toBe(true))
  act(() => result.current.discardCheckpoints!())
  await waitFor(() => expect(result.current.history).toEqual(saved))
  expect(get).toHaveBeenCalledTimes(2)
})

it("keeps successful cleanup usable when reloading its history fails", async () => {
  const get = vi
    .fn()
    .mockResolvedValueOnce(saved)
    .mockRejectedValue(new Error("history unavailable"))
  const { result } = renderHook(() =>
    useContextCapacity({
      enabled: true,
      blocked: false,
      contextKey: "same",
      resolveRequest: async () => request,
      historyAccess: { get, save: vi.fn() },
      discardCheckpoints: vi.fn().mockResolvedValue(undefined),
      runner: vi.fn().mockRejectedValue(
        Object.assign(new Error("limit"), {
          name: "ContextCheckpointLimitError",
        }),
      ),
    }),
  )
  await waitFor(() => expect(result.current.history).toEqual(saved))
  act(() => result.current.run())
  await waitFor(() => expect(result.current.checkpointLimitReached).toBe(true))
  act(() => result.current.discardCheckpoints!())
  await waitFor(() => expect(result.current.historyError).toBe(true))
  expect(result.current.error).toBeNull()
  expect(result.current.canRun).toBe(true)
})
