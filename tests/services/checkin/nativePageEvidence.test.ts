import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { collectCheckInEvidence } from "~/services/checkin/discovery/evidence/scan"
import {
  CHECK_IN_EVIDENCE_SCAN_PURPOSES,
  FEEDBACK_SCAN_STATUSES,
} from "~/services/checkin/discovery/evidence/scanTypes"
import { scanNativeCheckInPageSources } from "~/services/checkin/discovery/nativePageScan"
import { AuthTypeEnum } from "~/types"

const origin = "https://site.test"
const nativeInput = {
  baseUrl: origin,
  siteType: SITE_TYPES.NEW_API,
  purpose: CHECK_IN_EVIDENCE_SCAN_PURPOSES.NativePage,
}

function serveAssets(assets: Record<string, string>) {
  return vi.fn(async (url: string) => {
    const path = new URL(url).pathname
    return new Response(assets[path], {
      status: path in assets ? 200 : 404,
      headers: {
        "content-type": path.endsWith(".js") ? "text/javascript" : "text/html",
      },
    })
  })
}

describe("read-only native page evidence", () => {
  it("keeps the native scan complete when generic API route clues exceed their limit", async () => {
    const routes = Array.from(
      { length: 30 },
      (_, index) => `"/api/daily-${index}"`,
    )
    const fetch = serveAssets({
      "/": '<script src="/app.js"></script><script src="/extra.js"></script>',
      "/app.js": `const apiRoutes=[${routes.join(",")}]; const page={path:"/profile"}`,
      "/extra.js": 'const extra="/api/daily-extra"',
    })
    const result = await collectCheckInEvidence(
      nativeInput,
      new AbortController().signal,
      { fetch: fetch as typeof globalThis.fetch },
    )
    expect(result.status).toBe(FEEDBACK_SCAN_STATUSES.Completed)
    expect(result.issues).toEqual([])
    expect(result.pageCandidates).toEqual([
      { path: "/profile", sources: ["script"] },
    ])
  })

  it("checks known referenced chunks even after a loaded script declares a page", async () => {
    const fetch = serveAssets({
      "/": '<script src="/app.js"></script>',
      "/app.js": 'const page={path:"/profile"}; import("./daily.js")',
      "/daily.js": 'const page={path:"/rewards/daily"}',
    })
    const result = await collectCheckInEvidence(
      nativeInput,
      new AbortController().signal,
      {
        fetch: fetch as typeof globalThis.fetch,
        loadedAssets: [origin + "/app.js"],
      },
    )
    expect(result.status).toBe(FEEDBACK_SCAN_STATUSES.Completed)
    expect(result.pageCandidates).toEqual([
      { path: "/profile", sources: ["script"] },
      { path: "/rewards/daily", sources: ["script"] },
    ])
  })

  it("caps native candidates, merges corroborating sources and rejects unsafe paths", async () => {
    const routes = Array.from(
      { length: 31 },
      (_, index) => `{path:"/daily/${index}"}`,
    )
    const fetch = serveAssets({
      "/": '<script src="/app.js"></script>',
      "/app.js": `const routes=[${routes.join(",")}, {path:"//other.test/profile"}, {path:"/profile?tab=daily"}, {path:"profile"}]`,
    })
    const result = await collectCheckInEvidence(
      nativeInput,
      new AbortController().signal,
      {
        fetch: fetch as typeof globalThis.fetch,
        navigation: {
          candidates: ["/daily/0", "/daily/0", "//other.test/daily"],
          candidatesComplete: false,
        },
      },
    )
    expect(result.status).toBe(FEEDBACK_SCAN_STATUSES.Partial)
    expect(result.issues).toContain("route_limit")
    expect(result.pageCandidates).toEqual(
      Array.from({ length: 30 }, (_, index) => ({
        path: `/daily/${index}`,
        sources: index === 0 ? ["script", "navigation"] : ["script"],
      })),
    )
  })

  it("does not report completeness after reaching the resource request limit", async () => {
    const assets = Array.from({ length: 64 }, (_, index) => `/app-${index}.js`)
    const fetch = serveAssets({
      "/": assets.map((path) => `<script src="${path}"></script>`).join(""),
      ...Object.fromEntries(
        assets.map((path) => [path, 'const page={path:"/profile"}']),
      ),
    })
    const result = await collectCheckInEvidence(
      nativeInput,
      new AbortController().signal,
      { fetch: fetch as typeof globalThis.fetch },
    )
    expect(fetch).toHaveBeenCalledTimes(64)
    expect(result.status).toBe(FEEDBACK_SCAN_STATUSES.Partial)
    expect(result.issues).toContain("limit")
    expect(result.resources).toMatchObject({ discovered: 65, scanned: 64 })
  })

  it("reports skipped sources as incomplete even when the remote scan found a candidate", async () => {
    const candidates = [{ path: "/profile", sources: ["script"] }]
    const send = vi.fn().mockResolvedValue({
      success: true,
      data: {
        status: FEEDBACK_SCAN_STATUSES.Completed,
        pageCandidates: candidates,
        resources: { discovered: 3, scanned: 2, skipped: 1 },
      },
    })
    expect(
      await scanNativeCheckInPageSources({
        originUrl: origin,
        siteType: SITE_TYPES.NEW_API,
        requestId: "incomplete-scan",
        send,
      }),
    ).toEqual({ candidates, complete: false })
  })

  it.each([undefined, { success: false }, { success: true }])(
    "treats a native scan without evidence as incomplete: %j",
    async (reply) => {
      expect(
        await scanNativeCheckInPageSources({
          originUrl: origin,
          siteType: SITE_TYPES.NEW_API,
          requestId: "missing-evidence",
          send: async () => reply,
        }),
      ).toEqual({ candidates: [], complete: false })
    },
  )

  it("keeps the full private destination and limits public feedback to its pathname", async () => {
    const fetch = serveAssets({ "/": "<html></html>" })
    const options = {
      fetch: fetch as typeof globalThis.fetch,
      navigation: { candidates: ["/profile?tab=checkin#/daily"] },
    }
    const signal = new AbortController().signal
    const native = await collectCheckInEvidence(nativeInput, signal, options)
    expect(native.pageCandidates).toEqual([
      { path: "/profile?tab=checkin#/daily", sources: ["navigation"] },
    ])
    const feedback = await collectCheckInEvidence(
      { baseUrl: origin, siteType: SITE_TYPES.NEW_API },
      signal,
      options,
    )
    expect(feedback.routes).toEqual(["/profile"])
    expect(feedback.pageCandidates).toBeUndefined()
  })

  it("exposes declared frontend routes as clues without probing an account API", async () => {
    const fetch = vi.fn(
      async (url: string) =>
        new Response(
          url.endsWith("/app.js")
            ? 'const links=["/unrelated","/daily-decoy"]; const route={path:"/invite/"}; createFileRoute("/_authenticated/profile/"); const endpoint="/api/user/checkin"'
            : '<script src="/app.js"></script>',
          {
            headers: {
              "content-type": url.endsWith(".js")
                ? "text/javascript"
                : "text/html",
            },
          },
        ),
    )
    const result = await collectCheckInEvidence(
      {
        ...nativeInput,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "fixture" },
        routePaths: ["/api/checkin"],
      },
      new AbortController().signal,
      { fetch: fetch as typeof globalThis.fetch },
    )
    expect(result.pageCandidates).toEqual([
      { path: "/invite/", sources: ["script"] },
      { path: "/profile/", sources: ["script"] },
    ])
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://site.test/",
      "https://site.test/app.js",
    ])
    expect(result.statusQueries).toEqual([])
    expect(result.authenticatedQueriesUnavailable).toBe(false)
  })
})
