import { describe, expect, it, vi } from "vitest"

import { FEEDBACK_SCAN_LIMITS } from "~/services/checkin/feedback/scanLimits"
import { createScanReader } from "~/services/checkin/feedback/scanReader"

describe("feedback response boundaries", () => {
  it("rejects foreign origins and embedded credentials before dispatch", async () => {
    const fetcher = vi.fn()
    const reader = createScanReader(
      "https://example.com",
      new AbortController().signal,
      fetcher,
    )
    await expect(reader.read("https://other.example/status")).rejects.toThrow(
      "scan_origin",
    )
    await expect(
      reader.read("https://user:secret@example.com/status"),
    ).rejects.toThrow("scan_origin")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("handles empty responses and stops dispatching after the request budget", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    const reader = createScanReader(
      "https://example.com",
      new AbortController().signal,
      fetcher,
    )
    for (let i = 0; i < FEEDBACK_SCAN_LIMITS.requests; i++)
      expect(await reader.read("/status")).toEqual({
        status: 204,
        text: "",
        type: "",
      })
    await expect(reader.read("/status")).rejects.toThrow("scan_limit")
    expect(fetcher).toHaveBeenCalledTimes(FEEDBACK_SCAN_LIMITS.requests)
    expect(reader.issues).toEqual(new Set(["limit"]))
  })
})
