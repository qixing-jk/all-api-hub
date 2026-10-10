import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { collectCheckInFeedbackClues } from "~/services/checkin/feedback/scan"
import { AuthTypeEnum } from "~/types"

describe("split-origin feedback status queries", () => {
  it("reads registered API status with the selected token while scanning only browser-origin assets", async () => {
    const fetch = vi.fn(
      async (url: string) =>
        new Response(
          url === "https://ai-router.dev/"
            ? '<script src="https://api.ai-router.dev/private.js"></script><script src="https://untrusted.example/private.js"></script><script src="/app.js"></script>'
            : url.endsWith("/app.js")
              ? "'/checkin'"
              : '{"code":0,"data":{}}',
          {
            headers: {
              "content-type":
                url === "https://ai-router.dev/"
                  ? "text/html"
                  : url.endsWith(".js")
                    ? "application/javascript"
                    : "application/json",
            },
          },
        ),
    )
    const clues = await collectCheckInFeedbackClues(
      {
        baseUrl: "https://ai-router.dev",
        siteType: SITE_TYPES.SUB2API,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "selected-account-token",
        },
      },
      new AbortController().signal,
      { fetch: fetch as typeof globalThis.fetch },
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/api\.ai-router\.dev\/api\/v1\/user\/daily-checkin\?timezone=/,
      ),
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        redirect: "error",
        headers: expect.objectContaining({
          Authorization: "Bearer selected-account-token",
        }),
      }),
    )
    expect(clues.statusQueries.map((q) => q.path)).toContain(
      "/api/v1/user/daily-checkin",
    )
    expect(clues.statusQueries).toHaveLength(7)
    expect(fetch).toHaveBeenCalledWith(
      "https://ai-router.dev/app.js",
      expect.objectContaining({ headers: undefined }),
    )
    const urls = fetch.mock.calls.map(([url]) => url)
    expect(urls).not.toContain("https://api.ai-router.dev/private.js")
    expect(urls).not.toContain("https://untrusted.example/private.js")
    expect(urls).not.toContain(
      "https://ai-router.dev/api/v1/user/daily-checkin",
    )
  })
})
