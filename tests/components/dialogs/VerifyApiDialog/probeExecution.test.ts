import { describe, expect, it, vi } from "vitest"

import { isVerificationAbortError } from "~/components/dialogs/verificationDialogUtils"
import { executeDialogProbe } from "~/components/dialogs/VerifyApiDialog/probeExecution"
import { buildProbeState } from "~/components/dialogs/VerifyApiDialog/probeState"
import {
  API_TYPES,
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_IDS,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"

function createExecution() {
  let probes = buildProbeState(API_TYPES.OPENAI_COMPATIBLE)
  const acceptResult = vi.fn().mockResolvedValue(undefined)
  const report = vi.fn()
  const options = {
    probeId: API_VERIFICATION_PROBE_IDS.Models,
    mode: API_VERIFICATION_MODES.Streaming,
    isStopped: () => false,
    readProbes: () => probes,
    replaceProbes: (next: typeof probes) => {
      probes = next
    },
    acceptResult,
    failure: {
      secrets: () => ["private-key"],
      summary: "Safe failure",
      report,
    },
  }
  return { options, acceptResult, report }
}

describe("dialog probe execution", () => {
  it("preserves the caller's abort classification for upstream failure objects", async () => {
    const { options, acceptResult } = createExecution()
    const upstreamFailure = { code: "ABORT_ERR" }
    const outcome = await executeDialogProbe({
      ...options,
      isAbortFailure: (error: unknown) => isVerificationAbortError(error),
      execute: async () => {
        throw upstreamFailure
      },
    })

    expect(outcome.result?.status).toBe("fail")
    expect(acceptResult).toHaveBeenCalledOnce()
  })

  it("accepts concurrent probe results without replacing a sibling's result", async () => {
    const { options, acceptResult } = createExecution()
    let resolveFirst!: (result: ApiVerificationProbeResult) => void
    const firstResult: ApiVerificationProbeResult = {
      id: API_VERIFICATION_PROBE_IDS.Models,
      status: "pass",
      latencyMs: 1,
      summary: "Models found",
    }
    const first = executeDialogProbe({
      ...options,
      execute: () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    })
    const secondResult: ApiVerificationProbeResult = {
      ...firstResult,
      id: API_VERIFICATION_PROBE_IDS.TextGeneration,
      summary: "Generated",
    }
    await executeDialogProbe({
      ...options,
      probeId: secondResult.id,
      execute: async () => secondResult,
    })
    resolveFirst(firstResult)
    await first

    expect(
      options
        .readProbes()
        .filter((probe) => probe.result)
        .map((probe) => probe.result),
    ).toEqual([firstResult, secondResult])
    expect(acceptResult).toHaveBeenCalledTimes(2)
    expect(
      options.readProbes().filter((probe) => probe.attempts === 1),
    ).toHaveLength(2)
  })

  it("settles a late successful response as stopped without persisting it", async () => {
    const { options, acceptResult } = createExecution()
    let stopped = false
    const execution = executeDialogProbe({
      ...options,
      isStopped: () => stopped,
      execute: async () => {
        stopped = true
        return {
          id: options.probeId,
          status: "pass",
          latencyMs: 1,
          summary: "Late response",
        }
      },
    })

    expect(await execution).toEqual({ result: null })
    expect(acceptResult).not.toHaveBeenCalled()
    expect(options.readProbes()[0]).toMatchObject({
      isRunning: false,
      attempts: 1,
    })
    expect(options.readProbes()[0]?.result?.status).not.toBe("pass")
  })

  it("reports only sanitized failures and persists the safe fallback", async () => {
    const { options, acceptResult, report } = createExecution()
    const error = new Error("Request rejected for private-key")
    const outcome = await executeDialogProbe({
      ...options,
      execute: async () => {
        throw error
      },
    })

    expect(outcome.error).toBe(error)
    expect(outcome.result).toMatchObject({
      id: options.probeId,
      status: "fail",
      summary: "Safe failure",
    })
    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0]?.[0]).not.toContain("private-key")
    expect(JSON.stringify(outcome.result)).not.toContain("private-key")
    expect(acceptResult).toHaveBeenCalledWith(
      options.readProbes(),
      outcome.result,
    )
  })
})
