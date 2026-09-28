import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { kimiOpenPlatformContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/kimiOpenPlatform"

function createLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => store.delete(key)),
    setItem: vi.fn((key: string, value: string) =>
      store.set(key, String(value)),
    ),
    get length() {
      return store.size
    },
  }
}

const token = (payload: Record<string, unknown>) =>
  `header.${btoa(JSON.stringify(payload))}.signature`

describe("kimiOpenPlatformContentSessionExtractor", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal("localStorage", createLocalStorageMock())
  })

  it("reads the console session and selects the site type from the origin", async () => {
    localStorage.setItem("token", token({ sub: "user-1", exp: 1_800_000_000 }))
    localStorage.setItem("rtoken", token({ sub: "user-1", typ: "refresh" }))
    localStorage.setItem("currentOrganizationId", JSON.stringify("org-1"))

    const context = { url: "https://platform.kimi.ai/console/api-keys" }
    expect(kimiOpenPlatformContentSessionExtractor.canExtract(context)).toBe(
      true,
    )
    await expect(
      kimiOpenPlatformContentSessionExtractor.extract(context),
    ).resolves.toMatchObject({
      userId: "user-1",
      accessToken: expect.stringContaining("header."),
      siteTypeHint: SITE_TYPES.KIMI_GLOBAL,
      kimiOpenPlatformAuth: {
        refreshToken: expect.any(String),
        organizationId: "org-1",
        tokenExpiresAt: 1_800_000_000_000,
      },
    })
  })

  it("does not claim a different site that happens to store a token", () => {
    localStorage.setItem("token", token({ sub: "user-1" }))
    expect(
      kimiOpenPlatformContentSessionExtractor.canExtract({
        url: "https://openrouter.ai/settings",
      }),
    ).toBe(false)
  })
})
