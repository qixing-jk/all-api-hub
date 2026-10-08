import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useVerificationRunLifecycle } from "~/hooks/useVerificationRunLifecycle"
import { API_TYPES } from "~/services/verification/aiApiVerification"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("verification run lifecycle", () => {
  it("stops a sequential suite before another probe starts, even when the first resolves", async () => {
    const pending = deferred()
    const started: string[] = []
    const { result } = renderHook(() => useVerificationRunLifecycle())
    let running!: Promise<void>
    act(() => {
      running = result.current.runSuite(async (signal) => {
        await result.current.runSequentialProbes(
          API_TYPES.OPENAI_COMPATIBLE,
          async (probe) => {
            started.push(probe.id)
            await pending.promise
          },
          signal,
        )
      })
    })
    expect(result.current.isRunning).toBe(true)
    expect(started).toHaveLength(1)
    act(() => result.current.stopSuite())
    await act(async () => {
      pending.resolve()
      await running
    })
    expect(started).toHaveLength(1)
    expect(result.current.isRunning).toBe(false)
  })

  it("keeps the current probe cancellable when an older attempt settles", async () => {
    const first = deferred()
    const second = deferred()
    const { result } = renderHook(() => useVerificationRunLifecycle())
    let latestSignal!: AbortSignal
    let older!: Promise<void>
    let newer!: Promise<void>
    act(() => {
      older = result.current.runProbe("models", () => first.promise)
      newer = result.current.runProbe("models", (signal) => {
        latestSignal = signal
        return second.promise
      })
    })
    await act(async () => {
      first.resolve()
      await older
    })
    act(() => result.current.stopProbe("models"))
    expect(latestSignal.aborted).toBe(true)
    await act(async () => {
      second.resolve()
      await newer
    })
  })

  it("distinguishes stopping one probe from interrupting the run and resets all controllers", async () => {
    const pending = deferred()
    const { result } = renderHook(() => useVerificationRunLifecycle())
    let signal!: AbortSignal
    let running!: Promise<void>
    act(() => {
      running = result.current.runProbe("models", (nextSignal) => {
        signal = nextSignal
        return pending.promise
      })
      result.current.stopProbe("models")
    })
    expect(signal.aborted).toBe(true)
    expect(result.current.isStopped()).toBe(false)
    act(() => result.current.stopProbe("models", { interruptRun: true }))
    expect(result.current.isStopped()).toBe(true)
    act(() => result.current.reset())
    expect(result.current.isStopped()).toBe(false)
    await act(async () => {
      pending.resolve()
      await running
    })
  })
})
