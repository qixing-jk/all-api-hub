import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { compatibleUserContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/compatibleUser"

function createLocalStorageMock() {
  const store = new Map<string, string>()

  return {
    clear: vi.fn(() => {
      store.clear()
    }),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value))
    }),
    get length() {
      return store.size
    },
  }
}

describe("compatibleUserContentSessionExtractor", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal("localStorage", createLocalStorageMock())
  })

  it("resolves compatible users with an explicit site type hint", async () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 42, username: "alice", role: "admin" }),
    )

    await expect(
      compatibleUserContentSessionExtractor.extract({
        url: "https://example.invalid",
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).resolves.toEqual({
      userId: "42",
      user: { id: 42, username: "alice", role: "admin" },
      siteTypeHint: SITE_TYPES.NEW_API,
    })
  })

  it("omits siteTypeHint when the explicit site type is unknown", async () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 42, username: "alice", role: "admin" }),
    )

    await expect(
      compatibleUserContentSessionExtractor.extract({
        url: "https://example.invalid",
        siteTypeHint: SITE_TYPES.UNKNOWN,
      }),
    ).resolves.toEqual({
      userId: "42",
      user: { id: 42, username: "alice", role: "admin" },
    })
  })

  it("omits siteTypeHint when the explicit site type is not account-compatible", async () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 42, username: "alice", role: "admin" }),
    )

    await expect(
      compatibleUserContentSessionExtractor.extract({
        url: "https://example.invalid",
        siteTypeHint: "not-a-site-type" as typeof SITE_TYPES.UNKNOWN,
      }),
    ).resolves.toEqual({
      userId: "42",
      user: { id: 42, username: "alice", role: "admin" },
    })
  })

  it("uses AIHubMix username identity with an explicit AIHubMix hint", async () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ username: "aihubmix-user", display_name: "Alice" }),
    )

    await expect(
      compatibleUserContentSessionExtractor.extract({
        url: "https://console.aihubmix.example.invalid",
        siteTypeHint: SITE_TYPES.AIHUBMIX,
      }),
    ).resolves.toEqual({
      userId: "aihubmix-user",
      user: { username: "aihubmix-user", display_name: "Alice" },
      siteTypeHint: SITE_TYPES.AIHUBMIX,
    })
  })

  it("returns null when user storage is missing", async () => {
    await expect(
      compatibleUserContentSessionExtractor.extract({
        url: "https://example.invalid",
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).resolves.toBeNull()
  })

  it("returns null when user storage is malformed JSON", async () => {
    localStorage.setItem("user", "not-json")

    await expect(
      compatibleUserContentSessionExtractor.extract({
        url: "https://example.invalid",
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).resolves.toBeNull()
  })

  it("can extract compatible user storage when the user key exists", () => {
    expect(
      compatibleUserContentSessionExtractor.canExtract({
        url: "https://example.invalid",
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).toBe(false)

    localStorage.setItem("user", JSON.stringify({ id: 42 }))

    expect(
      compatibleUserContentSessionExtractor.canExtract({
        url: "https://example.invalid",
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).toBe(true)
  })
})
