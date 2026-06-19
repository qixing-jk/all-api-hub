import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  sub2ApiContentSessionExtractor,
  Sub2ApiContentSessionLoginRequiredError,
} from "~/services/accountSiteOnboarding/contentSession/sub2api"

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

describe("sub2ApiContentSessionExtractor", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.stubGlobal("localStorage", createLocalStorageMock())
  })

  it("returns the Sub2API user payload when auth_token and auth_user are valid", async () => {
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).resolves.toEqual({
      userId: 123,
      user: {
        id: 123,
        username: "alice",
        balance: 1.5,
      },
      accessToken: "jwt-token",
      siteTypeHint: SITE_TYPES.SUB2API,
    })
  })

  it("throws login-required when the saved access token is blank", async () => {
    localStorage.setItem("auth_token", "   ")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)
  })

  it("refreshes near-expiry tokens and returns refreshed auth metadata", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now + 60_000))

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            access_token: "new-token",
            refresh_token: "new-refresh",
            expires_in: 3600,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock as any)

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).resolves.toEqual({
      userId: 123,
      user: {
        id: 123,
        username: "alice",
        balance: 1.5,
      },
      accessToken: "new-token",
      sub2apiAuth: {
        refreshToken: "new-refresh",
        tokenExpiresAt: now + 3600 * 1000,
      },
      siteTypeHint: SITE_TYPES.SUB2API,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sub2.example.invalid/api/v1/auth/refresh",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer old-token",
        }),
        body: JSON.stringify({ refresh_token: "old-refresh" }),
      }),
    )
    expect(localStorage.getItem("auth_token")).toBe("new-token")
    expect(localStorage.getItem("refresh_token")).toBe("new-refresh")
    expect(localStorage.getItem("token_expires_at")).toBe(
      String(now + 3600 * 1000),
    )
  })

  it("throws login-required when refresh fails and the token is expired", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now - 1))

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 1, message: "invalid" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock as any)

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)
  })

  it("throws login-required when auth_user is invalid", async () => {
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem("auth_user", "not-json")

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)
  })
})
