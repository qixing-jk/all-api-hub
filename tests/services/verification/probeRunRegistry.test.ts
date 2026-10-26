import { describe, expect, it } from "vitest"

import { createApiCheckProbeRunRegistry } from "~/services/verification/webAiApiCheck/probeRunRegistry"

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe("api check probe run registry", () => {
  it("cancels the in-flight run it owns", async () => {
    const registry = createApiCheckProbeRunRegistry()
    let signal: AbortSignal | undefined
    const run = registry.run("run-1", async (runSignal) => {
      signal = runSignal
      return new Promise((_, reject) =>
        runSignal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        ),
      )
    })

    expect(registry.cancel("run-1")).toBe(true)
    expect(signal?.aborted).toBe(true)
    await expect(run).rejects.toThrow("aborted")
    // A cancelled run is released, so a repeated cancel reports nothing to stop.
    expect(registry.cancel("run-1")).toBe(false)
  })

  it("does not let a superseded run release its successor", async () => {
    const registry = createApiCheckProbeRunRegistry()
    const first = createDeferred<void>()
    const second = createDeferred<void>()
    const firstRun = registry.run("run-1", async () => first.promise)
    const secondRun = registry.run("run-1", async () => second.promise)

    first.resolve()
    await firstRun

    expect(registry.cancel("run-1")).toBe(true)
    second.resolve()
    await secondRun
  })

  it("aborts only the runs started by the tab that went away", async () => {
    const registry = createApiCheckProbeRunRegistry()
    const signals = new Map<string, AbortSignal | undefined>()
    const run = (runId: string, ownerTabId: number | undefined) =>
      registry.run(
        runId,
        async (signal) => {
          signals.set(runId, signal)
          return new Promise((_, reject) =>
            signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            ),
          )
        },
        ownerTabId,
      )

    const closingTab = run("closing", 42)
    const otherTab = run("other", 7)
    const senderless = run("senderless", undefined)

    registry.cancelForTab(42)

    expect(signals.get("closing")?.aborted).toBe(true)
    expect(signals.get("other")?.aborted).toBe(false)
    // An unknown tab id must not be treated as the sender-less runs' owner.
    expect(signals.get("senderless")?.aborted).toBe(false)

    registry.cancelForTab(undefined as unknown as number)
    expect(signals.get("senderless")?.aborted).toBe(false)

    registry.cancelForTab(7)
    expect(signals.get("other")?.aborted).toBe(true)

    await Promise.allSettled([closingTab, otherTab])
    // The untouched run stays registered and cancellable.
    expect(registry.cancel("senderless")).toBe(true)
    await expect(senderless).rejects.toThrow("aborted")
  })
})
