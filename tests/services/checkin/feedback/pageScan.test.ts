// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { handlePageFeedbackScan } from "~/services/checkin/feedback/pageScan"
import { createDeferred } from "~~/tests/test-utils/deferred"

const origin = "https://example.com"
afterEach(() => {
  vi.unstubAllGlobals()
  document.head.innerHTML = ""
  document.body.innerHTML = ""
})

describe("rendered feedback scan", () => {
  it("reads the rendered page and fetches resources with its session while isolating status requests", async () => {
    vi.stubGlobal("location", { origin, href: origin + "/" })
    document.body.innerHTML = '<script src="/app.js"></script>'
    const fetch = vi.fn(
      async (url: string, _init: RequestInit) =>
        new Response(
          url.endsWith("app.js") ? "'/api/checkin'" : '{"success":true}',
          {
            headers: {
              "content-type": url.endsWith(".js")
                ? "text/javascript"
                : "application/json",
            },
          },
        ),
    )
    vi.stubGlobal("fetch", fetch)
    const result = createDeferred<any>()
    handlePageFeedbackScan(
      {
        action: RuntimeActionIds.ContentCheckinFeedbackScan,
        params: {
          originUrl: origin,
          requestId: "page-1",
          input: {
            baseUrl: origin,
            siteType: "new-api",
            auth: { authType: "access_token", accessToken: "selected" },
          },
        },
        statusOptions: {
          "/api/status": { credentials: "omit" },
          "/api/user/checkin": { credentials: "omit" },
          "/api/user/check_in_status": { credentials: "omit" },
        },
      },
      result.resolve,
    )
    const response = await result.promise
    expect(response.success).toBe(true)
    expect(response.data.routes).toEqual(["/api/checkin"])
    expect(fetch.mock.calls.some(([url]) => url === origin + "/")).toBe(false)
    for (const [url, options] of fetch.mock.calls) {
      expect(options.credentials).toBe(
        url.endsWith("app.js") ? "include" : "omit",
      )
      if (url.endsWith("app.js"))
        expect(new Headers(options.headers).has("Authorization")).toBe(false)
    }
  })

  it("rejects an origin change before collecting or exposing page information", async () => {
    vi.stubGlobal("location", { origin: "https://elsewhere.example" })
    const reply = vi.fn()
    handlePageFeedbackScan(
      {
        params: {
          originUrl: origin,
          requestId: "wrong-origin",
          input: { baseUrl: origin, siteType: "new-api" },
        },
      },
      reply,
    )
    expect(reply).toHaveBeenCalledWith({ success: false })
  })

  it("honors cancellation arriving before the scan message", () => {
    vi.stubGlobal("location", { origin })
    const reply = vi.fn()
    handlePageFeedbackScan(
      {
        action: RuntimeActionIds.ContentCancelCheckinFeedbackScan,
        requestId: "pre-cancel",
      },
      vi.fn(),
    )
    handlePageFeedbackScan(
      {
        params: {
          originUrl: origin,
          requestId: "pre-cancel",
          input: { baseUrl: origin, siteType: "new-api" },
        },
      },
      reply,
    )
    expect(reply).toHaveBeenCalledWith({ success: false })
  })
})
