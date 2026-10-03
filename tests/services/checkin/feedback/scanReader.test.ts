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

  it("isolates API status reads from resources and shares one request budget", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    const reader = createScanReader(
      "https://ai-router.dev",
      new AbortController().signal,
      fetcher,
      "https://api.ai-router.dev",
    )
    await expect(
      reader.read("https://api.ai-router.dev/private.js"),
    ).rejects.toThrow("scan_origin")
    await expect(
      reader.readStatus("https://other.example/status"),
    ).rejects.toThrow("scan_origin")
    await expect(
      reader.readStatus("https://user:secret@api.ai-router.dev/status"),
    ).rejects.toThrow("scan_origin")
    expect(fetcher).not.toHaveBeenCalled()
    await reader.readStatus("/status", { Authorization: "Bearer selected" })
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.ai-router.dev/status",
      expect.objectContaining({ credentials: "omit", redirect: "error" }),
    )
    for (let i = 1; i < FEEDBACK_SCAN_LIMITS.requests; i++)
      await reader.read("/app.js")
    await expect(reader.readStatus("/status")).rejects.toThrow("scan_limit")
    expect(fetcher).toHaveBeenCalledTimes(FEEDBACK_SCAN_LIMITS.requests)
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
