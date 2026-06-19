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

  it("only claims Sub2API storage when the context is for Sub2API", () => {
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )

    expect(
      sub2ApiContentSessionExtractor.canExtract({
        url: "https://sub2.example.invalid",
        siteTypeHint: SITE_TYPES.SUB2API,
      }),
    ).toBe(true)
    expect(
      sub2ApiContentSessionExtractor.canExtract({
        url: "https://one-api.example.invalid",
        siteTypeHint: SITE_TYPES.ONE_API,
      }),
    ).toBe(false)
    expect(
      sub2ApiContentSessionExtractor.canExtract({
        url: "https://example.invalid",
        siteTypeHint: SITE_TYPES.UNKNOWN,
      }),
    ).toBe(false)
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

  it("keeps a still-valid token when the refresh response is not JSON", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now + 60_000))

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not-json", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      ) as any,
    )

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).resolves.toMatchObject({
      accessToken: "old-token",
      sub2apiAuth: {
        refreshToken: "old-refresh",
        tokenExpiresAt: now + 60_000,
      },
    })
  })

  it("keeps a still-valid token when refreshed token fields are incomplete", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now + 60_000))

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            data: { access_token: "", refresh_token: "", expires_in: 0 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ) as any,
    )

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).resolves.toMatchObject({
      accessToken: "old-token",
      sub2apiAuth: {
        refreshToken: "old-refresh",
        tokenExpiresAt: now + 60_000,
      },
    })
  })

  it("throws login-required when an expired token has no refresh token", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("token_expires_at", String(now - 1))

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)
  })

  it("bounds stalled refresh requests and reports login-required for expired tokens", async () => {
    vi.useFakeTimers()
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now - 1))

    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"))
          })
        }),
    )
    vi.stubGlobal("fetch", fetchMock as any)

    const extraction = sub2ApiContentSessionExtractor.extract({
      url: "https://sub2.example.invalid",
    })
    const expectedRejection = expect(extraction).rejects.toBeInstanceOf(
      Sub2ApiContentSessionLoginRequiredError,
    )

    await vi.advanceTimersByTimeAsync(10_000)

    await expectedRejection
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it("uses refreshed tokens saved by a concurrent extraction before reporting login-required", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now - 1))

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
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
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 1, message: "invalid" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
    vi.stubGlobal("fetch", fetchMock as any)

    const [firstResult, secondResult] = await Promise.all([
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ])

    expect(firstResult?.accessToken).toBe("new-token")
    expect(secondResult?.accessToken).toBe("new-token")
    expect(fetchMock).toHaveBeenCalledTimes(2)
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
