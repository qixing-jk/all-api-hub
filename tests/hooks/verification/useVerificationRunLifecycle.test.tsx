import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useVerificationRunLifecycle } from "~/hooks/verification/useVerificationRunLifecycle"
import { API_TYPES } from "~/services/verification/aiApiVerification"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("verification run lifecycle", () => {
  it("does not let a reset suite completion clear its replacement", async () => {
    const older = deferred()
    const newer = deferred()
    const { result } = renderHook(() => useVerificationRunLifecycle())
    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = result.current.runSuite(() => older.promise)
    })
    act(() => {
      result.current.reset()
      second = result.current.runSuite(() => newer.promise)
    })
    await act(async () => {
      older.resolve()
      await first
    })
    expect(result.current.isRunning).toBe(true)
    await act(async () => {
      newer.resolve()
      await second
    })
    expect(result.current.isRunning).toBe(false)
  })

  it("cancels suites and individual probes on unmount", async () => {
    const pending = deferred()
    const { result, unmount } = renderHook(() => useVerificationRunLifecycle())
    const signals: AbortSignal[] = []
    let suite!: Promise<void>
    let probe!: Promise<void>
    act(() => {
      suite = result.current.runSuite((signal) => {
        signals.push(signal)
        return pending.promise
      })
      probe = result.current.runProbe("models", (signal) => {
        signals.push(signal)
        return pending.promise
      })
    })
    unmount()
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    await act(async () => {
      pending.resolve()
      await Promise.all([suite, probe])
    })
  })

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
