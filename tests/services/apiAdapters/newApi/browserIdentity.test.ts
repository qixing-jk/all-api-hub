import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import * as siteDefinitions from "~/services/accountSiteDefinitions"
import { apiyiContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/apiyi"
import { newApiBrowserIdentity } from "~/services/apiAdapters/newApi/browserIdentity"

const origin = "https://identity.example.invalid"

describe("New API family passive browser identity", () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    vi.stubGlobal("document", { cookie: "session-state" })
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  async function verifyHint(
    siteType: AccountSiteType,
    expectedId: string,
    candidateUserIds: string[] = [],
  ) {
    const observation = newApiBrowserIdentity.observe({
      origin,
      siteType,
      candidateUserIds,
    })!
    const read = vi
      .fn()
      .mockResolvedValue({ success: true, data: { id: expectedId } })
    expect(fetch).not.toHaveBeenCalled()
    expect(observation.sessionKey).not.toContain("private-dashboard-token")

    await expect(observation.verify(read)).resolves.toBe(expectedId)
    expect(read).toHaveBeenCalledExactlyOnceWith({
      url: `${origin}/api/user/self`,
      headers: expect.objectContaining({ "New-API-User": expectedId }),
    })
    expect(read.mock.calls[0]?.[0].headers).not.toHaveProperty("Authorization")
    expect(fetch).not.toHaveBeenCalled()
  }

  it.each([SITE_TYPES.APIYI, SITE_TYPES.LAOZHANG])(
    "prefers USER_STATE identity without forwarding credentials for %s",
    async (siteType) => {
      localStorage.setItem(
        "USER_STATE",
        JSON.stringify({
          user: { id: 42, access_token: "private-dashboard-token" },
        }),
      )
      localStorage.setItem("user", JSON.stringify({ id: 99 }))
      await verifyHint(siteType, "42")
    },
  )

  it("prefers the current V-API store over legacy user storage", async () => {
    localStorage.setItem(
      "user-storage",
      JSON.stringify({ state: { user: { id: 42 } } }),
    )
    localStorage.setItem("user", JSON.stringify({ id: 99 }))
    await verifyHint(SITE_TYPES.V_API, "42")
  })

  it.each([SITE_TYPES.APIYI, SITE_TYPES.LAOZHANG, SITE_TYPES.V_API])(
    "keeps legacy storage fallback when %s's primary store is malformed",
    async (siteType) => {
      localStorage.setItem("USER_STATE", "not-json")
      localStorage.setItem(
        "user-storage",
        JSON.stringify({ state: { user: [] } }),
      )
      localStorage.setItem("user", JSON.stringify({ id: 99 }))
      await verifyHint(siteType, "99")
    },
  )

  it("uses a sole saved candidate without adopting stale legacy identity from a valid primary object", async () => {
    localStorage.setItem("USER_STATE", JSON.stringify({ user: { id: "" } }))
    localStorage.setItem("user", JSON.stringify({ id: 99 }))
    await verifyHint(SITE_TYPES.APIYI, "42", ["42"])
  })

  it("does not use another variant's stored dashboard user", async () => {
    localStorage.setItem("USER_STATE", JSON.stringify({ user: { id: 42 } }))
    localStorage.setItem(
      "user-storage",
      JSON.stringify({ state: { user: { id: 77 } } }),
    )
    localStorage.setItem("user", JSON.stringify({ id: 99 }))
    await verifyHint(SITE_TYPES.NEW_API, "99")
  })

  it("uses the same declared store for onboarding selection and passive verification", async () => {
    const definition = siteDefinitions.getAccountSiteDefinition(
      SITE_TYPES.MODELFLARE,
    )!
    definition.onboarding!.browserUserStorage = "apiyi"
    vi.spyOn(siteDefinitions, "getAccountSiteDefinition").mockReturnValue(
      definition,
    )
    localStorage.setItem("USER_STATE", JSON.stringify({ user: { id: 42 } }))
    localStorage.setItem("user", JSON.stringify({ id: 99 }))

    expect(
      apiyiContentSessionExtractor.canExtract({
        siteTypeHint: SITE_TYPES.MODELFLARE,
      }),
    ).toBe(true)
    await expect(
      apiyiContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.MODELFLARE,
      }),
    ).resolves.toEqual({
      userId: "42",
      user: { id: 42 },
      siteTypeHint: SITE_TYPES.MODELFLARE,
    })
    await verifyHint(SITE_TYPES.MODELFLARE, "42")
  })
})
