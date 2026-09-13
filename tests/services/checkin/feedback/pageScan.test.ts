// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { handlePageFeedbackScan } from "~/services/checkin/feedback/pageScan"
import { createDeferred } from "~~/tests/test-utils/deferred"

const origin = "https://example.com"
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.head.innerHTML = ""
  document.body.innerHTML = ""
})

describe("rendered feedback scan", () => {
  it("stops authenticated reads when the page changes origin during collection", async () => {
    const pageLocation = { origin, href: origin + "/" }
    vi.stubGlobal("location", pageLocation)
    const fetch = vi.fn(async () => {
      pageLocation.origin = "https://other.example"
      return new Response('{"success":true}')
    })
    vi.stubGlobal("fetch", fetch)
    const result = createDeferred<any>()
    handlePageFeedbackScan(
      {
        params: {
          originUrl: origin,
          requestId: "origin-during-read",
          input: {
            baseUrl: origin,
            siteType: "new-api",
            auth: { authType: "access_token", accessToken: "selected" },
          },
        },
        statusOptions: { "/api/user/checkin": { credentials: "omit" } },
      },
      result.resolve,
    )
    expect((await result.promise).data.status).toBe("partial")
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("rejects malformed scan envelopes before reading the page", () => {
    const reply = vi.fn()
    handlePageFeedbackScan({ params: {} }, reply)
    expect(reply).toHaveBeenCalledWith({ success: false })
  })

  it("does not send a selected token without background-prepared status options", async () => {
    vi.stubGlobal("location", { origin, href: origin + "/" })
    const fetch = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response('{"success":true}'),
    )
    vi.stubGlobal("fetch", fetch)
    const result = createDeferred<any>()
    handlePageFeedbackScan(
      {
        params: {
          originUrl: origin,
          requestId: "missing-isolation",
          input: {
            baseUrl: origin,
            siteType: "new-api",
            auth: { authType: "access_token", accessToken: "selected" },
          },
        },
      },
      result.resolve,
    )
    const reply = await result.promise
    expect(reply.success).toBe(true)
    expect(reply.data.status).toBe("partial")
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      origin + "/api/status",
      expect.any(Object),
    )
    expect(
      new Headers(fetch.mock.calls[0][1]?.headers).has("Authorization"),
    ).toBe(false)
  })

  it("discards a result when pagehide cancels an active resource read", async () => {
    vi.stubGlobal("location", { origin, href: origin + "/" })
    document.body.innerHTML = '<script src="/app.js"></script>'
    const resource = createDeferred<Response>()
    const fetch = vi.fn(() => resource.promise)
    vi.stubGlobal("fetch", fetch)
    const result = createDeferred<any>()
    handlePageFeedbackScan(
      {
        params: {
          originUrl: origin,
          requestId: "pagehide-read",
          input: { baseUrl: origin, siteType: "unknown" },
        },
      },
      result.resolve,
    )
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    window.dispatchEvent(new Event("pagehide"))
    resource.resolve(
      new Response("'/api/checkin'", {
        headers: { "content-type": "text/javascript" },
      }),
    )
    expect(await result.promise).toEqual({ success: false })
  })

  it("reads the rendered page and fetches resources with its session while isolating status requests", async () => {
    vi.stubGlobal("location", { origin, href: origin + "/" })
    document.body.innerHTML = '<script src="/app.js"></script>'
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { name: origin + "/app.js" } as PerformanceEntry,
    ])
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
          "/api/user/checkin": { headers: { "X-Test-Isolation": "prepared" } },
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
      if (new URL(url).pathname === "/api/user/checkin")
        expect(new Headers(options.headers).get("X-Test-Isolation")).toBe(
          "prepared",
        )
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
