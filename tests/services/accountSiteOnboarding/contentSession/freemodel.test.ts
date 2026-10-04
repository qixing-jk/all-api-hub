import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { freeModelContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/freemodel"
import { freeModelBrowserIdentity } from "~/services/apiAdapters/freemodel/browserIdentity"

const context = {
  url: "https://freemodel.dev/dashboard",
  siteTypeHint: SITE_TYPES.FREEMODEL,
}

afterEach(() => vi.unstubAllGlobals())

describe("FreeModel browser session", () => {
  it.each([
    undefined,
    null,
    "7",
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects an invalid passive browser identity: %s", async (id) => {
    vi.stubGlobal("document", { cookie: "" })
    const observation = freeModelBrowserIdentity.observe({
      origin: "https://freemodel.dev",
      siteType: SITE_TYPES.FREEMODEL,
      candidateUserIds: ["7"],
    })!
    const read = vi.fn().mockResolvedValue({ user: { id } })
    expect(await observation.verify(read)).toBeNull()
  })

  it("reads a numeric identity from the live cookie endpoint without an access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 7, name: "Example" } }),
    })
    vi.stubGlobal("fetch", fetchMock)
    expect(freeModelContentSessionExtractor.canExtract(context)).toBe(true)
    expect(await freeModelContentSessionExtractor.extract(context)).toEqual({
      userId: 7,
      user: { id: 7, name: "Example" },
      siteTypeHint: SITE_TYPES.FREEMODEL,
    })
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", {
      cache: "no-store",
      credentials: "include",
    })
  })

  it.each([
    undefined,
    "invalid",
    "https://api.freemodel.dev",
    "https://freemodel.dev.example.invalid",
    "http://freemodel.dev",
  ])("does not claim another origin: %s", (url) => {
    expect(
      freeModelContentSessionExtractor.canExtract({ ...context, url }),
    ).toBe(false)
  })

  it.each([
    { ok: false },
    { ok: true, json: async () => ({ user: null }) },
    { ok: true, json: async () => ({ user: { id: "7" } }) },
  ])("does not trust missing or malformed sessions", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
    expect(await freeModelContentSessionExtractor.extract(context)).toBeNull()
  })

  it("uses only the matching console for passive identity observation", async () => {
    vi.stubGlobal("document", { cookie: "" })
    const identityContext = {
      origin: "https://freemodel.dev",
      siteType: SITE_TYPES.FREEMODEL,
      candidateUserIds: ["7"],
    }
    expect(freeModelBrowserIdentity.canObserve(identityContext)).toBe(true)
    expect(
      freeModelBrowserIdentity.canObserve({
        ...identityContext,
        origin: "https://api.freemodel.dev",
      }),
    ).toBe(false)
    const read = vi.fn().mockResolvedValue({ user: { id: 7 } })
    expect(
      await freeModelBrowserIdentity.observe(identityContext)!.verify(read),
    ).toBe(7)
    expect(read).toHaveBeenCalledWith({
      url: "https://freemodel.dev/api/auth/me",
    })
  })
})
