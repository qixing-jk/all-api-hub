import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ProbeItemState } from "~/components/dialogs/VerifyApiDialog/types"
import { useVerificationDialogState } from "~/components/dialogs/VerifyApiDialog/useVerificationDialogState"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  createProfileVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import { requireHistoryTarget } from "~~/tests/test-utils/history"

/**
 * Create a deferred promise so tests can resolve history loads on demand.
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

describe("useVerificationDialogState", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("restores resolvedModelId only when the persisted summary is applied", async () => {
    const target = requireHistoryTarget(
      createProfileVerificationHistoryTarget("profile-1"),
    )
    const summary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      preferredModelId: "gpt-test",
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 5,
          summary: "Stored models",
        },
      ],
    })

    if (!summary) {
      throw new Error("Expected history summary")
    }

    vi.spyOn(
      verificationResultHistoryStorage,
      "getLatestSummary",
    ).mockResolvedValue(summary)

    const onResolvedModelId = vi.fn()
    const { result } = renderHook(() => useVerificationDialogState(target))

    await act(async () => {
      await result.current.loadVerificationHistory({
        apiType: API_TYPES.ANTHROPIC,
        onResolvedModelId,
        shouldApplySummaryToProbes: () => false,
      })
    })

    expect(result.current.persistedSummary).toEqual(summary)
    expect(result.current.probes.every((probe) => probe.result === null)).toBe(
      true,
    )
    expect(onResolvedModelId).not.toHaveBeenCalled()
  })

  it("ignores late history loads after live probe state changes", async () => {
    const target = requireHistoryTarget(
      createProfileVerificationHistoryTarget("profile-2"),
    )
    const summary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 5,
          summary: "Stale history",
        },
      ],
    })

    if (!summary) {
      throw new Error("Expected history summary")
    }

    const deferred = createDeferred<typeof summary | null>()
    vi.spyOn(
      verificationResultHistoryStorage,
      "getLatestSummary",
    ).mockReturnValue(deferred.promise)

    const { result } = renderHook(() => useVerificationDialogState(target))

    act(() => {
      void result.current.loadVerificationHistory({
        apiType: API_TYPES.OPENAI_COMPATIBLE,
      })
    })

    const liveProbes: ProbeItemState[] = [
      {
        definition: {
          id: "models",
          requiresModelId: false,
        },
        isRunning: false,
        attempts: 1,
        result: {
          id: "models",
          status: "pass",
          latencyMs: 1,
          summary: "Live probe result",
        },
      },
    ]

    act(() => {
      result.current.setProbes(liveProbes)
    })

    await act(async () => {
      deferred.resolve(summary)
      await Promise.resolve()
    })

    expect(result.current.persistedSummary).toBeNull()
    expect(result.current.probes).toEqual(liveProbes)
  })

  it("excludes stopped probes when persisting later verification results", async () => {
    const target = requireHistoryTarget(
      createProfileVerificationHistoryTarget("profile-stopped"),
    )
    const upsertLatestSummary = vi
      .spyOn(verificationResultHistoryStorage, "upsertLatestSummary")
      .mockImplementation(async (summary) => summary)
    const { result } = renderHook(() => useVerificationDialogState(target))

    const probes: ProbeItemState[] = [
      {
        definition: { id: "models", requiresModelId: false },
        isRunning: false,
        attempts: 1,
        result: {
          id: "models",
          status: "unsupported",
          latencyMs: 0,
          summary: "Stopped",
          summaryKey: "verifyDialog.summaries.stopped",
        },
      },
      {
        definition: { id: "text-generation", requiresModelId: true },
        isRunning: false,
        attempts: 1,
        result: {
          id: "text-generation",
          mode: "streaming",
          status: "pass",
          latencyMs: 5,
          summary: "Chat passed",
        },
      },
    ]

    await act(async () => {
      await result.current.persistCurrentResults(
        API_TYPES.OPENAI_COMPATIBLE,
        probes,
      )
    })

    expect(upsertLatestSummary).toHaveBeenCalledOnce()
    expect(upsertLatestSummary.mock.calls[0]![0].probes).toEqual([
      expect.objectContaining({ id: "text-generation", status: "pass" }),
    ])
  })
})
