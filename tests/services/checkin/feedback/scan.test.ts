import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getCheckInFeedbackStatusRoutes } from "~/services/checkin/autoCheckin/providers/feedbackRoutes"
import {
  collectCheckInFeedbackClues,
  extractCheckInRoutes,
  formatCheckInFeedbackClues,
} from "~/services/checkin/feedback/scan"
import { FEEDBACK_SCAN_LIMITS } from "~/services/checkin/feedback/scanLimits"
import { AuthTypeEnum } from "~/types"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const baseUrl = "https://example.com"
const response = (body: string, type = "application/json", status = 200) =>
  new Response(body, { status, headers: { "content-type": type } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("optional check-in clue scan", () => {
  it("completes public-only Agent Router scans without account credentials", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/api/status")
        ? response('{"success":true,"data":{}}')
        : response("<html></html>", "text/html"),
    )
    const clues = await collectCheckInFeedbackClues(
      { baseUrl: "https://agentrouter.org", siteType: SITE_TYPES.NEW_API },
      new AbortController().signal,
      { fetch: fetch as typeof globalThis.fetch },
    )
    expect(clues.status).toBe("completed")
    expect(clues.authenticatedQueriesUnavailable).toBe(false)
    expect(clues.statusQueries).toEqual([
      { path: "/api/status", status: 200, keys: ["success", "data"] },
    ])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith(
      "https://agentrouter.org/api/status",
      expect.objectContaining({ headers: undefined, credentials: "omit" }),
    )
  })

  it("uses only public login availability for Agent Router feedback", () => {
    expect(
      getCheckInFeedbackStatusRoutes(
        SITE_TYPES.NEW_API,
        "https://agentrouter.org",
      ),
    ).toEqual([{ path: "/api/status", public: true }])
    expect(getCheckInFeedbackStatusRoutes(SITE_TYPES.NEW_API, baseUrl)).toEqual(
      expect.arrayContaining([{ path: "/api/user/check_in_status" }]),
    )
  })

  it("does not start further status requests after cancellation", async () => {
    const controller = new AbortController()
    const fetch = vi.fn(async () => {
      controller.abort()
      return response('{"success":true}')
    })
    vi.stubGlobal("fetch", fetch)
    const clues = await collectCheckInFeedbackClues(
      {
        baseUrl,
        siteType: SITE_TYPES.NEW_API,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "selected" },
      },
      controller.signal,
    )
    expect(fetch).toHaveBeenCalledOnce()
    expect(clues.statusQueries).toHaveLength(1)
    expect(clues.status).toBe("partial")
  })

  it("uses Wong's read-only route and excludes AnyRouter's mutation-only flow", () => {
    expect(getCheckInFeedbackStatusRoutes(SITE_TYPES.WONG_GONGYI)).toEqual([
      { path: "/api/user/checkin" },
    ])
    expect(getCheckInFeedbackStatusRoutes(SITE_TYPES.ANYROUTER)).toEqual([])
  })
  it("reports route limits and invalid resource responses while retaining useful clues", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === baseUrl + "/")
          return response(
            '<script src="/a.js"></script><script src="/b.js"></script><script src="/bad.js"></script>',
            "text/html",
          )
        if (url.endsWith("bad.js"))
          return response("<html>challenge</html>", "text/html")
        const prefix = url.endsWith("a.js") ? "a" : "b"
        return response(
          Array.from(
            { length: 20 },
            (_, i) => `'/api/checkin/${prefix}${i}'`,
          ).join(";"),
          "text/javascript",
        )
      }),
    )
    const clues = await collectCheckInFeedbackClues(
      { baseUrl, siteType: SITE_TYPES.UNKNOWN },
      new AbortController().signal,
    )
    expect(clues.routes).toHaveLength(FEEDBACK_SCAN_LIMITS.routes)
    expect(clues.status).toBe("partial")
    expect(clues.issues).toEqual(
      expect.arrayContaining(["route_limit", "resource_response"]),
    )
  })

  it("searches already loaded chunks absent from the DOM without fetching unused references when clues are found", async () => {
    const fetch = vi.fn(async (url: string) =>
      url === baseUrl + "/"
        ? response('<script src="/app.js"></script>', "text/html")
        : response(
            url.endsWith("app.js")
              ? "const files = ['/unused.js']"
              : "'/api/checkin'",
            "text/javascript",
          ),
    )
    vi.stubGlobal("fetch", fetch)
    const clues = await collectCheckInFeedbackClues(
      { baseUrl, siteType: SITE_TYPES.UNKNOWN },
      new AbortController().signal,
      {
        loadedAssets: [
          baseUrl + "/app.js",
          baseUrl + "/active.js",
          "https://other.example/private.js",
          baseUrl + "/logo.png",
        ],
      },
    )
    expect(clues.routes).toEqual(["/api/checkin"])
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      baseUrl + "/",
      baseUrl + "/app.js",
      baseUrl + "/active.js",
    ])
    expect(clues.resources).toEqual({ discovered: 4, scanned: 3, skipped: 1 })
    expect(clues.status).toBe("completed")
    expect(formatCheckInFeedbackClues(clues)).toContain(
      "unloaded_resources_skipped: 1",
    )
  })

  it("finishes searching loaded resources before expanding references when no path was found", async () => {
    const loaded = createDeferred<Response>()
    const fetch = vi.fn(async (url: string) =>
      url === baseUrl + "/"
        ? response(
            '<script src="/app.js"></script><link rel="preload" href="/unused.js">',
            "text/html",
          )
        : url.endsWith("app.js")
          ? loaded.promise
          : response("'/api/checkin'", "text/javascript"),
    )
    vi.stubGlobal("fetch", fetch)
    const pending = collectCheckInFeedbackClues(
      { baseUrl, siteType: SITE_TYPES.UNKNOWN },
      new AbortController().signal,
      { loadedAssets: [baseUrl + "/app.js"] },
    )
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    loaded.resolve(response("import './deep.js'", "text/javascript"))
    const clues = await pending
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      baseUrl + "/",
      baseUrl + "/app.js",
      baseUrl + "/unused.js",
      baseUrl + "/deep.js",
    ])
    expect(clues.status).toBe("completed")
    expect(clues.resources).toEqual({ discovered: 4, scanned: 4 })
  })

  it("loads public scripts while status queries wait, then cancels at the overall deadline", async () => {
    vi.useFakeTimers()
    const aborted: string[] = []
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname
      if (path === "/")
        return response('<script src="/app.js"></script>', "text/html")
      if (path === "/app.js")
        return response("'/api/checkin'", "text/javascript")
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener(
          "abort",
          () => {
            aborted.push(path)
            reject(new Error("aborted"))
          },
          { once: true },
        )
      })
    })
    vi.stubGlobal("fetch", fetch)
    const pending = collectCheckInFeedbackClues(
      {
        baseUrl,
        siteType: SITE_TYPES.NEW_API,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "test-token" },
      },
      new AbortController().signal,
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toContain(
      "/app.js",
    )
    await vi.advanceTimersByTimeAsync(FEEDBACK_SCAN_LIMITS.taskTimeoutMs)
    const clues = await pending
    expect(clues.routes).toEqual(["/api/checkin"])
    expect(clues.issues).toEqual(["task_timeout", "timeout"])
    expect(aborted).toHaveLength(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("cancels active resource reads and does not start queued resources on close", async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url === baseUrl + "/")
          return response(
            Array.from(
              { length: 12 },
              (_, i) => `<script src="/${i}.js"></script>`,
            ).join(""),
            "text/html",
          )
        return new Promise<Response>((_resolve, reject) => {
          signals.push(init.signal!)
          init.signal!.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          )
        })
      }),
    )
    const controller = new AbortController()
    const pending = collectCheckInFeedbackClues(
      { baseUrl, siteType: SITE_TYPES.UNKNOWN },
      controller.signal,
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(signals).toHaveLength(FEEDBACK_SCAN_LIMITS.resourceConcurrency)
    controller.abort()
    await pending
    expect(signals).toHaveLength(FEEDBACK_SCAN_LIMITS.resourceConcurrency)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("prioritizes scripts and loads slow resources concurrently within the task budget", async () => {
    vi.useFakeTimers()
    let active = 0
    let peak = 0
    const started: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === baseUrl + "/")
          return response(
            '<link rel="stylesheet" href="/style.css"><link rel="preload" href="/locale.json">' +
              Array.from(
                { length: 6 },
                (_, i) => `<script src="/${i}.js"></script>`,
              ).join(""),
            "text/html",
          )
        started.push(new URL(url).pathname)
        peak = Math.max(peak, ++active)
        await new Promise((resolve) => setTimeout(resolve, 6000))
        active--
        return response("'/api/checkin'", "text/javascript")
      }),
    )
    const pending = collectCheckInFeedbackClues(
      { baseUrl, siteType: SITE_TYPES.UNKNOWN },
      new AbortController().signal,
    )
    await vi.advanceTimersByTimeAsync(6000)
    expect(started.slice(0, 4)).toEqual(["/0.js", "/1.js", "/2.js", "/3.js"])
    expect(started.slice(4)).toEqual([
      "/4.js",
      "/5.js",
      "/locale.json",
      "/style.css",
    ])
    expect(peak).toBe(FEEDBACK_SCAN_LIMITS.resourceConcurrency)
    await vi.advanceTimersByTimeAsync(6000)
    const clues = await pending
    expect(clues.status).toBe("completed")
    expect(clues.resources).toEqual({ discovered: 9, scanned: 9 })
    expect(clues.issues).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it("searches HTML, preload modules and recursively imported chunks", async () => {
    const pages: Record<string, string> = {
      "/": `<script src="/assets/app.js"></script><link rel="modulepreload" href="/assets/preload.js"><script>const route='/api/check-in/html'</script>`,
      "/assets/app.js": `import './shared.js'; const files=['assets/lazy.js'];`,
      "/assets/preload.js": `'/api/check_in/preload'`,
      "/assets/shared.js": `import('./deep.js'); import './app.js';`,
      "/assets/deep.js": `'/api/checkin/deep'`,
      "/assets/lazy.js": `'/api/daily/checkin'`,
    }
    const fetch = vi.fn(async (url: string) =>
      response(
        pages[new URL(url).pathname] ?? "",
        url === baseUrl + "/" ? "text/html" : "text/javascript",
      ),
    )
    vi.stubGlobal("fetch", fetch)
    const clues = await collectCheckInFeedbackClues(
      { baseUrl, siteType: SITE_TYPES.UNKNOWN },
      new AbortController().signal,
    )
    expect(clues.routes).toEqual(
      expect.arrayContaining([
        "/api/check-in/html",
        "/api/check_in/preload",
        "/api/checkin/deep",
        "/api/daily/checkin",
      ]),
    )
    expect(fetch).toHaveBeenCalledTimes(6)
    expect(clues.resources).toEqual({ discovered: 6, scanned: 6 })
  })

  it("reports keyword-only clues in escaped text, styles and JSON without copying source", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url === baseUrl + "/")
        return response(
          `<script>const label='\\u7b7e\\u5230'; const secret='private-value'</script><link rel=stylesheet href=/style.css><link rel=preload href=/locale.json>`,
          "text/html",
        )
      if (url.endsWith(".css")) return response(".daily-reward {}", "text/css")
      return response('{"label":"簽到", "action":"attendance"}')
    })
    vi.stubGlobal("fetch", fetch)
    const clues = await collectCheckInFeedbackClues(
      { baseUrl, siteType: SITE_TYPES.UNKNOWN },
      new AbortController().signal,
    )
    expect(clues.status).toBe("completed")
    expect(clues.keywords).toEqual(
      expect.arrayContaining(["签到", "簽到", "daily", "reward", "attendance"]),
    )
    expect(clues.resources).toEqual({ discovered: 3, scanned: 3 })
    expect(formatCheckInFeedbackClues(clues)).not.toContain("private-value")
  })

  it("continues past failed assets and excludes external nested imports", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url === baseUrl + "/")
        return response('<script src="/app.js"></script>', "text/html")
      if (url.endsWith("app.js"))
        return response(
          `import './broken.js'; import './good.js'; import 'https://other.example/external.js';`,
          "text/javascript",
        )
      if (url.endsWith("broken.js")) throw new Error("network")
      return response(
        `'/api/attendance'; import './app.js#cycle'`,
        "text/javascript",
      )
    })
    vi.stubGlobal("fetch", fetch)
    const clues = await collectCheckInFeedbackClues(
      { baseUrl, siteType: SITE_TYPES.UNKNOWN },
      new AbortController().signal,
    )
    expect(clues.status).toBe("partial")
    expect(clues.routes).toEqual(["/api/attendance"])
    expect(clues.resources).toEqual({ discovered: 4, scanned: 3 })
    expect(formatCheckInFeedbackClues(clues)).toContain(
      "scan_notes: unavailable",
    )
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(
      fetch.mock.calls.every(([url]) => new URL(url).origin === baseUrl),
    ).toBe(true)
  })

  it("extracts paths without queries, fragments, source context or obvious secrets", () => {
    expect(
      extractCheckInRoutes(
        `const secret = 'sk-keep-out'; const paths = ['/api/checkin?token=secret#x', 'https://private.example/api/checkin', '/api/redeem', 'redeem my secret'];`,
      ),
    ).toEqual(["/api/checkin", "/api/redeem"])
    expect(
      extractCheckInRoutes(`'/checkin/sk-abcdefghijklmnopqrstuv'`),
    ).toEqual([])
  })

  it.each(["http://example.com", "https://example.com"])(
    "honors the configured origin %s with fixed authenticated GETs and public same-origin scripts",
    async (baseUrl) => {
      const fetch = vi.fn(async (url: string) => {
        if (url === baseUrl + "/")
          return response(
            '<script src="/app.js"></script><script src="https://other.example/leak.js"></script>',
            "text/html",
          )
        if (url.endsWith("app.js"))
          return response(
            `'/new/checkin?token=secret'; '/api/redeem#private'`,
            "text/javascript",
          )
        return response(
          '{"success":true,"data":{"token":"hidden"},"token":"hidden"}',
        )
      })
      vi.stubGlobal("fetch", fetch)
      const clues = await collectCheckInFeedbackClues(
        {
          baseUrl,
          siteType: SITE_TYPES.NEW_API,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "account-secret",
            userId: "42",
          },
        },
        new AbortController().signal,
      )
      expect(clues.status).toBe("completed")
      expect(clues.routes).toEqual(["/new/checkin", "/api/redeem"])
      expect(atIndex(clues.statusQueries, 0).keys).toEqual(["success", "data"])
      for (const [url, init] of fetch.mock.calls as unknown as Array<
        [string, RequestInit]
      >) {
        expect(new URL(url).origin).toBe(baseUrl)
        expect(init.method).toBe("GET")
        expect(init.redirect).toBe("error")
        expect(init.credentials).toBe("omit")
        if (
          url.endsWith("app.js") ||
          url === baseUrl + "/" ||
          url === baseUrl + "/api/status"
        )
          expect(init.headers).toBeUndefined()
        else
          expect(new Headers(init.headers).get("Authorization")).toBe(
            "Bearer account-secret",
          )
      }
      expect(fetch.mock.calls.map(([url]) => url)).not.toContain(
        baseUrl + "/new/checkin",
      )
      expect(formatCheckInFeedbackClues(clues)).not.toMatch(
        /hidden|secret|other.example/,
      )
    },
  )

  it("keeps HTTP exclusion clues when public resources fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === baseUrl + "/"
          ? response("blocked", "text/html", 403)
          : response("not found", "text/plain", 404),
      ),
    )
    const clues = await collectCheckInFeedbackClues(
      {
        baseUrl,
        siteType: SITE_TYPES.VO_API_V2,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "raw-token" },
      },
      new AbortController().signal,
    )
    expect(clues.status).toBe("partial")
    expect(clues.statusQueries).toEqual([
      { path: "/api/check_in/stats", status: 404, keys: [] },
    ])
  })

  it("does not use an ambient cookie session for a selected account", async () => {
    const fetch = vi.fn(async () => response("<html></html>", "text/html"))
    vi.stubGlobal("fetch", fetch)
    const clues = await collectCheckInFeedbackClues(
      {
        baseUrl,
        siteType: SITE_TYPES.SUB2API,
        auth: { authType: AuthTypeEnum.Cookie, cookie: "session=private" },
      },
      new AbortController().signal,
    )
    expect(clues.authenticatedQueriesUnavailable).toBe(true)
    expect(formatCheckInFeedbackClues(clues)).toContain(
      "authenticated_status: unavailable",
    )
    expect(clues.statusQueries).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      baseUrl + "/",
      expect.objectContaining({ credentials: "omit", headers: undefined }),
    )
  })

  it("bounds asset requests", async () => {
    const fetch = vi.fn(async (url: string) =>
      url === baseUrl + "/"
        ? response(
            Array.from(
              { length: FEEDBACK_SCAN_LIMITS.requests + 16 },
              (_, i) => `<script src="/${i}.js"></script>`,
            ).join(""),
            "text/html",
          )
        : response("'/api/checkin'", "text/javascript"),
    )
    vi.stubGlobal("fetch", fetch)
    const clues = await collectCheckInFeedbackClues(
      { baseUrl, siteType: SITE_TYPES.UNKNOWN },
      new AbortController().signal,
    )
    expect(fetch).toHaveBeenCalledTimes(FEEDBACK_SCAN_LIMITS.requests)
    expect(clues.status).toBe("partial")
    expect(clues.issues).toContain("limit")
  })

  it("cancels an oversized asset and continues collecting clues from other assets", async () => {
    const cancel = vi.fn()
    const fetch = vi.fn(async (url: string) => {
      if (url === baseUrl + "/")
        return response(
          '<script src="/large.js"></script><script src="/small.js"></script>',
          "text/html",
        )
      if (url.endsWith("large.js"))
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new Uint8Array(FEEDBACK_SCAN_LIMITS.responseBytes + 1),
              )
              controller.enqueue(
                new TextEncoder().encode("'/api/checkin/omitted'"),
              )
              controller.close()
            },
            cancel,
          }),
          { headers: { "content-type": "text/javascript" } },
        )
      return response("'/api/checkin'", "text/javascript")
    })
    vi.stubGlobal("fetch", fetch)
    const clues = await collectCheckInFeedbackClues(
      { baseUrl, siteType: SITE_TYPES.UNKNOWN },
      new AbortController().signal,
    )
    expect(clues.routes).toEqual(["/api/checkin"])
    expect(clues.issues).toContain("limit")
    expect(clues.issues).not.toContain("unavailable")
    expect(clues.status).toBe("partial")
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("cancels an oversized stream before reading the remaining body", async () => {
    const cancel = vi.fn()
    const fetch = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(FEEDBACK_SCAN_LIMITS.bytes + 1))
            },
            cancel,
          }),
          { headers: { "content-type": "text/html" } },
        ),
    )
    vi.stubGlobal("fetch", fetch)
    const clues = await collectCheckInFeedbackClues(
      { baseUrl, siteType: SITE_TYPES.UNKNOWN },
      new AbortController().signal,
    )
    expect(cancel).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledOnce()
    expect(clues.status).toBe("empty")
  })

  it("cancels a pending request on close and on timeout", async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init.signal!
            signals.push(signal)
            signal.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            )
          }),
      ),
    )
    const controller = new AbortController()
    const first = collectCheckInFeedbackClues(
      { baseUrl, siteType: SITE_TYPES.UNKNOWN },
      controller.signal,
    )
    controller.abort()
    await first
    expect(atIndex(signals, 0).aborted).toBe(true)
    const second = collectCheckInFeedbackClues(
      { baseUrl, siteType: SITE_TYPES.UNKNOWN },
      new AbortController().signal,
    )
    await vi.advanceTimersByTimeAsync(FEEDBACK_SCAN_LIMITS.requestTimeoutMs)
    const timedOut = await second
    expect(timedOut.status).toBe("empty")
    expect(timedOut.issues).toContain("timeout")
    expect(atIndex(signals, 1).aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
