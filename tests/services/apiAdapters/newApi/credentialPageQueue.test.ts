import { expect, it, vi } from "vitest"

import { resolveNewApiCredentialPage } from "~/services/apiAdapters/newApi/variantOperations/credentialPage"
import { withSiteApiRequestLease } from "~/services/apiTransport/siteRequestLimiter"

vi.mock(
  "~/services/apiTransport/siteRequestLimiter",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiTransport/siteRequestLimiter")
      >()
    return {
      ...actual,
      withSiteApiRequestLease: actual.createSiteRequestLeaseLimiter({
        enabled: true,
        maxConcurrentPerSite: 1,
        requestsPerMinute: 60,
        burst: 10,
      }),
    }
  },
)
it("returns the fallback when the probe deadline expires in the real transport queue without dispatch", async () => {
  vi.useFakeTimers()
  let release!: () => void
  const completion = new Promise<void>((resolve) => {
    release = resolve
  })
  const occupied = withSiteApiRequestLease(
    "https://queued.example.test",
    () => ({ result: completion, completion }),
  )
  const fetch = vi.spyOn(globalThis, "fetch")
  try {
    let result: string | undefined
    const pending = resolveNewApiCredentialPage(
      "https://queued.example.test",
      "/security",
    ).then((value) => {
      result = value
    })
    await vi.advanceTimersByTimeAsync(4000)
    expect(result).toBe("/security")
    await pending
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    release()
    await occupied
    fetch.mockRestore()
    vi.useRealTimers()
  }
})
