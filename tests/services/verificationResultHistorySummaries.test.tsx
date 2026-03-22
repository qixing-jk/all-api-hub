import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  createProfileVerificationHistoryTarget,
  serializeVerificationHistoryTarget,
  type ApiVerificationHistorySummary,
  type ApiVerificationHistoryTarget,
} from "~/services/verification/verificationResultHistory"
import { useVerificationResultHistorySummaries } from "~/services/verification/verificationResultHistory/useVerificationResultHistorySummaries"
import { requireHistoryTarget } from "~~/tests/test-utils/history"

const {
  getLatestSummariesMock,
  subscribeMock,
  unsubscribeMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getLatestSummariesMock: vi.fn(),
  subscribeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}))

vi.mock("~/services/verification/verificationResultHistory/storage", () => ({
  verificationResultHistoryStorage: {
    getLatestSummaries: (...args: unknown[]) => getLatestSummariesMock(...args),
  },
  subscribeToVerificationResultHistoryChanges: (callback: () => void) => {
    subscribeMock(callback)
    return unsubscribeMock
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: (...args: unknown[]) => loggerErrorMock(...args),
  }),
}))

/**
 *
 */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

/**
 *
 */
function buildSummary(
  target: ApiVerificationHistoryTarget,
  verifiedAt = 1,
): ApiVerificationHistorySummary {
  return {
    target,
    targetKey: serializeVerificationHistoryTarget(target),
    status: "pass",
    verifiedAt,
    apiType: API_TYPES.OPENAI_COMPATIBLE,
    probes: [
      {
        id: "models",
        status: "pass",
        latencyMs: 1,
        summary: `Stored summary ${verifiedAt}`,
      },
    ],
  }
}

describe("useVerificationResultHistorySummaries", () => {
  beforeEach(() => {
    getLatestSummariesMock.mockReset()
    subscribeMock.mockReset()
    unsubscribeMock.mockReset()
    loggerErrorMock.mockReset()
  })

  it("clears summaries without reloading when targets become empty", async () => {
    const target = requireHistoryTarget(
      createProfileVerificationHistoryTarget("profile-1"),
    )
    const targetKey = serializeVerificationHistoryTarget(target)

    getLatestSummariesMock.mockResolvedValueOnce({
      [targetKey]: buildSummary(target),
    })

    const { result, rerender } = renderHook(
      ({ targets }: { targets: ApiVerificationHistoryTarget[] }) =>
        useVerificationResultHistorySummaries(targets),
      {
        initialProps: {
          targets: [target],
        },
      },
    )

    await waitFor(() => {
      expect(result.current.summariesByKey).toEqual({
        [targetKey]: buildSummary(target),
      })
    })

    rerender({ targets: [] })

    await waitFor(() => {
      expect(result.current.summariesByKey).toEqual({})
    })
    expect(getLatestSummariesMock).toHaveBeenCalledTimes(1)
  })

  it("logs and clears summaries when the latest reload fails", async () => {
    const target = requireHistoryTarget(
      createProfileVerificationHistoryTarget("profile-2"),
    )
    const targetKey = serializeVerificationHistoryTarget(target)
    const expectedError = new Error("load failed")

    getLatestSummariesMock
      .mockResolvedValueOnce({
        [targetKey]: buildSummary(target),
      })
      .mockRejectedValueOnce(expectedError)

    const { result } = renderHook(() =>
      useVerificationResultHistorySummaries([target]),
    )

    await waitFor(() => {
      expect(result.current.summariesByKey).toEqual({
        [targetKey]: buildSummary(target),
      })
    })

    await act(async () => {
      await result.current.reload()
    })

    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Failed to load verification result history",
      expectedError,
    )
    expect(result.current.summariesByKey).toEqual({})
  })

  it("subscribes to storage changes and reloads on change notifications", async () => {
    const target = requireHistoryTarget(
      createProfileVerificationHistoryTarget("profile-3"),
    )

    getLatestSummariesMock.mockResolvedValue({})

    const { unmount } = renderHook(() =>
      useVerificationResultHistorySummaries([target]),
    )

    await waitFor(() => {
      expect(getLatestSummariesMock).toHaveBeenCalledTimes(1)
    })

    expect(subscribeMock).toHaveBeenCalledTimes(1)

    const callback = subscribeMock.mock.calls[0]?.[0] as
      | (() => void)
      | undefined
    if (!callback) {
      throw new Error("Expected storage listener callback")
    }

    act(() => {
      callback()
    })

    await waitFor(() => {
      expect(getLatestSummariesMock).toHaveBeenCalledTimes(2)
    })

    unmount()
    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
  })

  it("ignores stale reload failures after a newer reload succeeds", async () => {
    const target = requireHistoryTarget(
      createProfileVerificationHistoryTarget("profile-4"),
    )
    const targetKey = serializeVerificationHistoryTarget(target)
    const staleError = new Error("stale failure")
    const firstRequest =
      createDeferred<Record<string, ApiVerificationHistorySummary>>()
    const secondRequest =
      createDeferred<Record<string, ApiVerificationHistorySummary>>()

    getLatestSummariesMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise)

    const { result } = renderHook(() =>
      useVerificationResultHistorySummaries([target]),
    )

    await waitFor(() => {
      expect(getLatestSummariesMock).toHaveBeenCalledTimes(1)
    })

    act(() => {
      void result.current.reload()
    })

    await waitFor(() => {
      expect(getLatestSummariesMock).toHaveBeenCalledTimes(2)
    })

    secondRequest.resolve({
      [targetKey]: buildSummary(target, 2),
    })

    await waitFor(() => {
      expect(result.current.summariesByKey).toEqual({
        [targetKey]: buildSummary(target, 2),
      })
    })

    await act(async () => {
      firstRequest.reject(staleError)
      await Promise.resolve()
    })

    expect(loggerErrorMock).not.toHaveBeenCalled()
    expect(result.current.summariesByKey).toEqual({
      [targetKey]: buildSummary(target, 2),
    })
  })

  it("reloads when target sets change even if joined keys would collide", async () => {
    const firstTargets = [
      requireHistoryTarget(
        createProfileVerificationHistoryTarget("a|profile:b"),
      ),
      requireHistoryTarget(createProfileVerificationHistoryTarget("c")),
    ]
    const secondTargets = [
      requireHistoryTarget(createProfileVerificationHistoryTarget("a")),
      requireHistoryTarget(
        createProfileVerificationHistoryTarget("b|profile:c"),
      ),
    ]

    getLatestSummariesMock.mockResolvedValue({})

    const { rerender } = renderHook(
      ({ targets }: { targets: ApiVerificationHistoryTarget[] }) =>
        useVerificationResultHistorySummaries(targets),
      {
        initialProps: {
          targets: firstTargets,
        },
      },
    )

    await waitFor(() => {
      expect(getLatestSummariesMock).toHaveBeenCalledTimes(1)
    })

    rerender({ targets: secondTargets })

    await waitFor(() => {
      expect(getLatestSummariesMock).toHaveBeenCalledTimes(2)
    })
  })
})
