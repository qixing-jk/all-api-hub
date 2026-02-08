import { beforeEach, describe, expect, it, vi } from "vitest"

import { handleGetUserFromLocalStorage } from "~/entrypoints/content/messageHandlers/handlers/storage"

const { mockFetchUserInfo } = vi.hoisted(() => ({
  mockFetchUserInfo: vi.fn(),
}))

vi.mock("i18next", () => ({
  t: vi.fn((key: string) => key),
  default: {
    t: vi.fn((key: string) => key),
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    fetchUserInfo: mockFetchUserInfo,
  })),
}))

describe("content storage handler", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
    vi.clearAllMocks()
  })

  it("returns Sub2API user payload when auth_token + auth_user exist", async () => {
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://sub2.example.com" },
        resolve,
      )
    })

    expect(response.success).toBe(true)
    expect(response.data?.userId).toBe(123)
    expect(response.data?.user).toEqual({
      id: 123,
      username: "alice",
      balance: 1.5,
    })
    expect(response.data?.accessToken).toBe("jwt-token")
    expect(response.data?.siteTypeHint).toBe("sub2api")
    expect(response.data?.sub2apiAuth).toBeUndefined()
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
  })

  it("refreshes Sub2API access token when token_expires_at is close", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    // Within the 2-min buffer: should attempt refresh.
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

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://sub2.example.com" },
        resolve,
      )
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://sub2.example.com/api/v1/auth/refresh",
    )

    expect(localStorage.getItem("auth_token")).toBe("new-token")
    expect(localStorage.getItem("refresh_token")).toBe("new-refresh")
    expect(localStorage.getItem("token_expires_at")).toBe(
      String(now + 3600 * 1000),
    )

    expect(response.success).toBe(true)
    expect(response.data?.accessToken).toBe("new-token")
    expect(response.data?.sub2apiAuth).toEqual({
      refreshToken: "new-refresh",
      tokenExpiresAt: now + 3600 * 1000,
    })
    expect(mockFetchUserInfo).not.toHaveBeenCalled()

    nowSpy.mockRestore()
  })

  it("returns loginRequired when refresh fails and token is expired", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now - 1))

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: 1, message: "invalid_refresh_token" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      )
    vi.stubGlobal("fetch", fetchMock as any)

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://sub2.example.com" },
        resolve,
      )
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(response.success).toBe(false)
    expect(response.error).toBe("messages:sub2api.loginRequired")
    expect(mockFetchUserInfo).not.toHaveBeenCalled()

    nowSpy.mockRestore()
  })

  it("keeps existing token when refresh fails but token is not expired", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now + 60_000))

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: 1, message: "invalid_refresh_token" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      )
    vi.stubGlobal("fetch", fetchMock as any)

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://sub2.example.com" },
        resolve,
      )
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(response.success).toBe(true)
    expect(response.data?.accessToken).toBe("old-token")
    expect(response.data?.sub2apiAuth).toEqual({
      refreshToken: "old-refresh",
      tokenExpiresAt: now + 60_000,
    })
    expect(mockFetchUserInfo).not.toHaveBeenCalled()

    nowSpy.mockRestore()
  })

  it("falls back to Sub2API email local-part when username is missing", async () => {
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, email: "alice@example.com", balance: 1.5 }),
    )

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://sub2.example.com" },
        resolve,
      )
    })

    expect(response.success).toBe(true)
    expect(response.data?.user).toEqual({
      id: 123,
      username: "alice",
      balance: 1.5,
    })
    expect(response.data?.accessToken).toBe("jwt-token")
    expect(response.data?.siteTypeHint).toBe("sub2api")
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
  })

  it("returns loginRequired when Sub2API keys exist but auth_user is invalid", async () => {
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem("auth_user", "not-json")

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://sub2.example.com" },
        resolve,
      )
    })

    expect(response.success).toBe(false)
    expect(response.error).toBe("messages:sub2api.loginRequired")
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
  })

  it("returns userInfoNotFound when no user payload exists", async () => {
    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage({ url: "https://example.com" }, resolve)
    })

    expect(response.success).toBe(false)
    expect(response.error).toBe("messages:content.userInfoNotFound")
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
  })
})
