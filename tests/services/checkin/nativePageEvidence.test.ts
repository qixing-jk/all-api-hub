import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { collectCheckInEvidence } from "~/services/checkin/discovery/evidence/scan"
import { CHECK_IN_EVIDENCE_SCAN_PURPOSES } from "~/services/checkin/discovery/evidence/scanTypes"

describe("read-only native page evidence", () => {
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
        baseUrl: "https://site.test",
        siteType: SITE_TYPES.NEW_API,
        purpose: CHECK_IN_EVIDENCE_SCAN_PURPOSES.NativePage,
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
