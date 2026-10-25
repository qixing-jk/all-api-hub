import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { pmApiContentSessionExtractor as extractor } from "~/services/accountSiteOnboarding/contentSession/pmapi"

const context = {
  url: "https://pmcat.top/#/console",
  siteTypeHint: SITE_TYPES.PMAPI,
}
const body = { success: true, data: { id: 7, username: "alice", quota: 0 } }
let token: string | null
beforeEach(() => {
  token = " session "
  vi.stubGlobal("localStorage", { getItem: () => token })
  vi.stubGlobal("location", { origin: "https://pmcat.top" })
})
afterEach(() => vi.unstubAllGlobals())
const respond = (value: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(value), { status })),
  )

describe("PM-API console session extraction", () => {
  it.each([undefined, "invalid", "https://unrelated.test"])(
    "rejects unregistered origins: %s",
    (url) => {
      expect(extractor.canExtract({ ...context, url })).toBe(false)
    },
  )
  it("requires both the protocol hint and a stored token", async () => {
    expect(extractor.canExtract(context)).toBe(true)
    expect(
      extractor.canExtract({ ...context, siteTypeHint: SITE_TYPES.NEW_API }),
    ).toBe(false)
    token = " "
    expect(extractor.canExtract(context)).toBe(false)
    expect(await extractor.extract(context)).toBeNull()
  })
  it("verifies the current origin before returning a trimmed credential", async () => {
    respond(body)
    expect(await extractor.extract(context)).toEqual({
      userId: "7",
      user: { id: "7", username: "alice" },
      accessToken: "session",
      siteTypeHint: SITE_TYPES.PMAPI,
    })
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://pmcat.top/api/me"),
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        headers: { Authorization: "Bearer session" },
      }),
    )
  })
  it.each([null, { success: false }, { success: true, data: { id: "bad" } }])(
    "rejects invalid identity evidence: %j",
    async (value) => {
      respond(value)
      expect(await extractor.extract(context)).toBeNull()
    },
  )
  it("rejects an expired session", async () => {
    respond(body, 401)
    expect(await extractor.extract(context)).toBeNull()
  })
  it.each([429, 503])(
    "keeps temporary probe failure distinct from a different protocol: %s",
    async (status) => {
      respond({}, status)
      await expect(extractor.extract(context)).rejects.toThrow(
        "session probe request failed",
      )
    },
  )
  it("rejects unreadable response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid json")),
    )
    await expect(extractor.extract(context)).rejects.toThrow(
      "session probe request failed",
    )
  })
  it("rejects an account switch while identity is being verified", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        token = "other-session"
        return new Response(JSON.stringify(body))
      }),
    )
    expect(await extractor.extract(context)).toBeNull()
  })
})
