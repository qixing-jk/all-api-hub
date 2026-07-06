import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { voApiV2ContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/voapiV2"

const jwtWithUserId =
  "eyJhbGciOiJub25lIn0.eyJ1c2VySWQiOjQyLCJleHAiOjQxMDI0NDQ4MDB9.signature"

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

describe("voApiV2ContentSessionExtractor", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal("localStorage", createLocalStorageMock())
  })

  it("extracts the dashboard JWT from userStore.auth.token", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({
        auth: {
          token: jwtWithUserId,
          email: "owner@example.invalid",
        },
      }),
    )
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: 7,
        username: "owner",
        display_name: "Owner",
        email: "owner@example.invalid",
        access_token: null,
      }),
    )

    await expect(
      voApiV2ContentSessionExtractor.extract({
        url: "https://example.invalid",
      }),
    ).resolves.toEqual({
      userId: 7,
      user: {
        id: 7,
        username: "owner",
        display_name: "Owner",
        email: "owner@example.invalid",
      },
      accessToken: jwtWithUserId,
      siteTypeHint: SITE_TYPES.VO_API_V2,
    })
  })

  it("detects whether the VoAPI v2 user store is present", () => {
    expect(voApiV2ContentSessionExtractor.canExtract({})).toBe(false)

    localStorage.setItem("userStore", JSON.stringify({ auth: {} }))

    expect(voApiV2ContentSessionExtractor.canExtract({})).toBe(true)
  })

  it("falls back to JWT userId when localStorage.user has no id", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem("user", JSON.stringify({ access_token: null }))

    const result = await voApiV2ContentSessionExtractor.extract({})

    expect(result?.userId).toBe(42)
    expect(result?.accessToken).toBe(jwtWithUserId)
  })

  it("does not use localStorage.user.access_token", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 7, access_token: "wrong-token" }),
    )

    const result = await voApiV2ContentSessionExtractor.extract({})

    expect(result?.accessToken).toBe(jwtWithUserId)
    expect(result?.accessToken).not.toBe("wrong-token")
  })

  it("returns null when userStore is absent or malformed", async () => {
    await expect(voApiV2ContentSessionExtractor.extract({})).resolves.toBeNull()

    localStorage.setItem("userStore", "{")
    await expect(voApiV2ContentSessionExtractor.extract({})).resolves.toBeNull()
  })

  it("returns null when the dashboard JWT payload is malformed and no stored user id exists", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: "not-a.jwt" } }),
    )

    await expect(voApiV2ContentSessionExtractor.extract({})).resolves.toBeNull()
  })
})
