import { afterEach, describe, expect, it, vi } from "vitest"

import { cubenceContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/cubence"
import { cubenceBrowserIdentity } from "~/services/apiAdapters/cubence/browserIdentity"

const context = {
  url: "https://cubence.com/dashboard",
  siteTypeHint: "cubence" as const,
}
const user = { id: 7, username: "example", active: true }

afterEach(() => vi.unstubAllGlobals())

describe("Cubence browser identity", () => {
  it("extracts live cookie identity without persisting a cached console or inference token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ user }) })
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() =>
        JSON.stringify({ user: { id: 99 }, token: "stale" }),
      ),
    })
    expect(await cubenceContentSessionExtractor.extract(context)).toEqual({
      userId: 7,
      user,
      siteTypeHint: "cubence",
    })
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", {
      credentials: "include",
      cache: "no-store",
    })
    expect(localStorage.getItem).not.toHaveBeenCalled()
  })

  it.each([
    { ok: false },
    { ok: true, json: async () => ({ user: { ...user, id: "7" } }) },
    { ok: true, json: async () => ({ user: { ...user, active: false } }) },
    { ok: true, json: async () => ({ user: null }) },
  ])("rejects expired or invalid sessions", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
    expect(await cubenceContentSessionExtractor.extract(context)).toBeNull()
  })

  it("checks the exact console and returns the live account for browser matching", async () => {
    vi.stubGlobal("document", { cookie: "" })
    const observationContext = {
      origin: "https://cubence.com",
      siteType: "cubence" as const,
      candidateUserIds: ["7"],
    }
    expect(cubenceBrowserIdentity.canObserve(observationContext)).toBe(true)
    expect(
      cubenceBrowserIdentity.canObserve({
        ...observationContext,
        origin: "https://api.cubence.com",
      }),
    ).toBe(false)
    const read = vi.fn().mockResolvedValue({ user })
    const observation = cubenceBrowserIdentity.observe(observationContext)!
    expect(await observation.verify(read)).toBe(7)
    expect(read).toHaveBeenCalledWith({
      url: "https://cubence.com/api/v1/auth/me",
    })
    read.mockResolvedValue({ user: { ...user, active: false } })
    expect(await observation.verify(read)).toBeNull()
  })
})
