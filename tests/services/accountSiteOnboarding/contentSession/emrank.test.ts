import { afterEach, describe, expect, it, vi } from "vitest"

import { emRankContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/emrank"
import { emRankBrowserIdentity } from "~/services/apiAdapters/emrank/browserIdentity"

const context = {
  url: "https://emrank.tech/account",
  siteTypeHint: "emrank" as const,
}
const session = {
  authenticated: true,
  user: {
    id: 6088,
    username: "ld_ko_c803",
    display_name: "Qi_xing_jk",
    role: 1,
  },
}

afterEach(() => vi.unstubAllGlobals())

describe("EMRank browser identity", () => {
  it("does not claim another console or an unknown hint", () => {
    for (const url of ["invalid", "https://docs.emrank.tech", undefined]) {
      expect(
        emRankContentSessionExtractor.canExtract({ ...context, url }),
      ).toBe(false)
    }
    expect(
      emRankContentSessionExtractor.canExtract({
        ...context,
        url: "https://emrank.tech",
        siteTypeHint: "new-api",
      }),
    ).toBe(false)
  })

  it("extracts the live session without trusting cached console state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => session })
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => JSON.stringify({ user: { id: 99 } })),
    })
    expect(await emRankContentSessionExtractor.extract(context)).toEqual({
      userId: 6088,
      user: { id: 6088, username: "ld_ko_c803" },
      siteTypeHint: "emrank",
    })
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", {
      credentials: "include",
      cache: "no-store",
    })
    expect(localStorage.getItem).not.toHaveBeenCalled()
  })

  it.each([
    { ok: false },
    { ok: true, json: async () => ({ authenticated: false, user: null }) },
    {
      ok: true,
      json: async () => ({ ...session, user: { ...session.user, id: "6088" } }),
    },
    {
      ok: true,
      json: async () => ({
        ...session,
        user: { ...session.user, username: "" },
      }),
    },
  ])(
    "leaves identity unconfirmed for an unusable session %j",
    async (response) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
      expect(await emRankContentSessionExtractor.extract(context)).toBeNull()
    },
  )

  it("returns null on a network failure instead of a cached identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect(await emRankContentSessionExtractor.extract(context)).toBeNull()
  })

  it("verifies the exact console origin against the live session", async () => {
    vi.stubGlobal("document", { cookie: "" })
    const observationContext = {
      origin: "https://emrank.tech",
      siteType: "emrank" as const,
      candidateUserIds: ["6088"],
    }
    expect(emRankBrowserIdentity.canObserve(observationContext)).toBe(true)
    expect(
      emRankBrowserIdentity.canObserve({
        ...observationContext,
        origin: "https://docs.emrank.tech",
      }),
    ).toBe(false)
    const read = vi.fn().mockResolvedValue(session)
    const observation = emRankBrowserIdentity.observe(observationContext)!
    expect(await observation.verify(read)).toBe(6088)
    expect(read).toHaveBeenCalledWith({
      url: "https://emrank.tech/api/auth/session",
    })
    read.mockResolvedValue({ ...session, authenticated: false })
    expect(await observation.verify(read)).toBeNull()
  })
})
