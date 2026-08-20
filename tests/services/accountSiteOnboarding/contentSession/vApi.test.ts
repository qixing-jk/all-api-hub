import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { vApiContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/vApi"

function createLocalStorageMock() {
  const store = new Map<string, string>()

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value))
    }),
  }
}

describe("vApiContentSessionExtractor", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal("localStorage", createLocalStorageMock())
  })

  it("extracts the current V-API user store", async () => {
    localStorage.setItem(
      "user-storage",
      JSON.stringify({
        state: {
          user: {
            id: 42,
            username: "example-user",
            group: "default",
          },
        },
        version: 0,
      }),
    )

    await expect(
      vApiContentSessionExtractor.extract({
        url: "https://v-api.example.invalid/panel",
        siteTypeHint: SITE_TYPES.V_API,
      }),
    ).resolves.toEqual({
      userId: "42",
      user: {
        id: 42,
        username: "example-user",
        group: "default",
      },
      siteTypeHint: SITE_TYPES.V_API,
    })
  })

  it("only handles current storage for an explicit V-API session", () => {
    localStorage.setItem(
      "user-storage",
      JSON.stringify({ state: { user: { id: 42 } }, version: 0 }),
    )

    expect(
      vApiContentSessionExtractor.canExtract({
        siteTypeHint: SITE_TYPES.V_API,
      }),
    ).toBe(true)
    expect(
      vApiContentSessionExtractor.canExtract({
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).toBe(false)
  })

  it("returns null when the current V-API user store is malformed", async () => {
    localStorage.setItem("user-storage", "not-json")

    await expect(
      vApiContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.V_API,
      }),
    ).resolves.toBeNull()
  })
})
