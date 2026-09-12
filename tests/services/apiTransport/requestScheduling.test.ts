import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SharedRead } from "~/services/apiTransport/requestScheduling"
import { createSiteRequestLimiter } from "~/services/apiTransport/siteRequestLimiter"

describe("shared scheduled reads", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("promotes a queued list lookup for export and keeps it when the list unmounts", async () => {
    const limit = createSiteRequestLimiter({
      maxConcurrentPerSite: 1,
      requestsPerMinute: 60,
      burst: 1,
    })
    const events: string[] = []
    await limit("site", async () => {})
    const background = limit(
      "site",
      async () => {
        events.push("other-check")
      },
      undefined,
      { priority: "background" },
    )
    const fetch = vi.fn(async () => {
      events.push("export")
      return "models"
    })
    const read = new SharedRead(({ signal, requestScheduling }) =>
      limit("site", fetch, signal, requestScheduling),
    )
    const controller = new AbortController()
    const automatic = read.read({
      signal: controller.signal,
      requestScheduling: { priority: "background" },
    })
    const canceled = expect(automatic).rejects.toMatchObject({
      name: "AbortError",
    })
    const exported = read.read()
    controller.abort()
    await canceled
    expect(read.signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(exported).resolves.toBe("models")
    expect(events).toEqual(["export"])
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    await background
  })

  it("removes orphaned queued reads without consuming the next rate-limit token", async () => {
    const limit = createSiteRequestLimiter({
      maxConcurrentPerSite: 1,
      requestsPerMinute: 60,
      burst: 1,
    })
    await limit("site", async () => {})
    const fetch = vi.fn(async () => "unused")
    const read = new SharedRead(({ signal, requestScheduling }) =>
      limit("site", fetch, signal, requestScheduling),
    )
    const controller = new AbortController()
    const pending = read.read({
      signal: controller.signal,
      requestScheduling: { priority: "background" },
    })
    const canceled = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    })
    controller.abort()
    await canceled
    const next = vi.fn(async () => "export")
    const exported = limit("site", next)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(exported).resolves.toBe("export")
    expect(fetch).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("waits for every consumer to detach before aborting shared work", async () => {
    const execute = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<string>((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          })
        }),
    )
    const read = new SharedRead(execute)
    const a = new AbortController()
    const b = new AbortController()
    const first = expect(read.read({ signal: a.signal })).rejects.toMatchObject(
      { name: "AbortError" },
    )
    const second = expect(
      read.read({ signal: b.signal }),
    ).rejects.toMatchObject({ name: "AbortError" })
    a.abort()
    expect(read.signal.aborted).toBe(false)
    b.abort()
    expect(read.signal.aborted).toBe(true)
    await Promise.all([first, second])
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
