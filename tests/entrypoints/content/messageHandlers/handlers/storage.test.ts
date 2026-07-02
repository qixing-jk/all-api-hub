import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  handleGetLocalStorage,
  handleGetUserFromLocalStorage,
} from "~/entrypoints/content/messageHandlers/handlers/storage"
import { compatibleUserContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/compatibleUser"
import { sharedChatContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/sharedchat"
import {
  sub2ApiContentSessionExtractor,
  Sub2ApiContentSessionLoginRequiredError,
} from "~/services/accountSiteOnboarding/contentSession/sub2api"

const { mockGetContentSessionExtractors } = vi.hoisted(() => ({
  mockGetContentSessionExtractors: vi.fn(),
}))

vi.mock("~/services/accountSiteOnboarding/registry", () => ({
  getContentSessionExtractors: mockGetContentSessionExtractors,
}))

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string) => key),
}))

describe("content storage handler", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
    vi.clearAllMocks()
    mockGetContentSessionExtractors.mockReturnValue([
      sub2ApiContentSessionExtractor,
      compatibleUserContentSessionExtractor,
    ])
  })

  it("returns a single localStorage key when requested directly", () => {
    localStorage.setItem("theme", "dark")

    const sendResponse = vi.fn()

    expect(handleGetLocalStorage({ key: "theme" }, sendResponse)).toBe(true)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        theme: "dark",
      },
    })
  })

  it("returns every localStorage entry when no specific key is requested", () => {
    localStorage.setItem("theme", "dark")
    localStorage.setItem("language", "zh-CN")

    const sendResponse = vi.fn()

    expect(handleGetLocalStorage({}, sendResponse)).toBe(true)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        theme: "dark",
        language: "zh-CN",
      },
    })
  })

  it("returns a structured error when localStorage access throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked")
    })

    const sendResponse = vi.fn()

    expect(handleGetLocalStorage({ key: "theme" }, sendResponse)).toBe(true)
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "storage blocked",
    })
  })

  it("returns Sub2API user payload when auth_token + auth_user exist", async () => {
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://sub2.example.com", siteType: "sub2api" },
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
  })

  it("returns loginRequired when the saved Sub2API access token is blank", async () => {
    localStorage.setItem("auth_token", "   ")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://sub2.example.com", siteType: "sub2api" },
        resolve,
      )
    })

    expect(response.success).toBe(false)
    expect(response.error).toBe("messages:sub2api.loginRequired")
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
        { url: "https://sub2.example.com", siteType: "sub2api" },
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

    nowSpy.mockRestore()
  })

  it("uses the relative refresh endpoint when Sub2API baseUrl is unavailable", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

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
            expires_in: 1800,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock as any)

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage({ siteType: "sub2api" }, resolve)
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/refresh",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer old-token",
        }),
      }),
    )
    expect(response.success).toBe(true)
    expect(response.data?.accessToken).toBe("new-token")
    expect(response.data?.sub2apiAuth).toEqual({
      refreshToken: "new-refresh",
      tokenExpiresAt: now + 1800 * 1000,
    })

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
        { url: "https://sub2.example.com", siteType: "sub2api" },
        resolve,
      )
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(response.success).toBe(false)
    expect(response.error).toBe("messages:sub2api.loginRequired")

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
        { url: "https://sub2.example.com", siteType: "sub2api" },
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

    nowSpy.mockRestore()
  })

  it("skips refresh when token_expires_at is invalid and keeps the stored refresh token", async () => {
    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", "not-a-number")

    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock as any)

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://sub2.example.com", siteType: "sub2api" },
        resolve,
      )
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(response.success).toBe(true)
    expect(response.data?.accessToken).toBe("old-token")
    expect(response.data?.sub2apiAuth).toEqual({
      refreshToken: "old-refresh",
    })
    expect(response.data?.sub2apiAuth?.tokenExpiresAt).toBeUndefined()
  })

  it("falls back to Sub2API email local-part when username is missing", async () => {
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, email: "alice@example.com", balance: 1.5 }),
    )

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://sub2.example.com", siteType: "sub2api" },
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
  })

  it("returns loginRequired when Sub2API keys exist but auth_user is invalid", async () => {
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem("auth_user", "not-json")

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://sub2.example.com", siteType: "sub2api" },
        resolve,
      )
    })

    expect(response.success).toBe(false)
    expect(response.error).toBe("messages:sub2api.loginRequired")
  })

  it("returns the standard local user payload when a non-Sub2API user exists", async () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ id: "user-1", username: "alice", role: "admin" }),
    )

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage({ url: "https://example.com" }, resolve)
    })

    expect(response).toEqual({
      success: true,
      data: {
        userId: "user-1",
        user: {
          id: "user-1",
          username: "alice",
          role: "admin",
        },
      },
    })
  })

  it("falls through to compatible user extraction when non-Sub2API storage also has Sub2API keys", async () => {
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "sub2-user", balance: 1.5 }),
    )
    localStorage.setItem(
      "user",
      JSON.stringify({ id: "user-1", username: "alice", role: "admin" }),
    )

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://example.com", siteType: "new-api" },
        resolve,
      )
    })

    expect(response).toEqual({
      success: true,
      data: {
        userId: "user-1",
        user: {
          id: "user-1",
          username: "alice",
          role: "admin",
        },
        siteTypeHint: "new-api",
      },
    })
  })

  it("normalizes numeric standard local user ids to string identities", async () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 42, username: "alice", role: "admin" }),
    )

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage({ url: "https://example.com" }, resolve)
    })

    expect(response).toEqual({
      success: true,
      data: {
        userId: "42",
        user: {
          id: 42,
          username: "alice",
          role: "admin",
        },
      },
    })
  })

  it("uses AIHubMix localStorage username as the account identity", async () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ username: "aihubmix-user", display_name: "Alice" }),
    )

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://console.aihubmix.com", siteType: "AIHubMix" },
        resolve,
      )
    })

    expect(response).toEqual({
      success: true,
      data: {
        userId: "aihubmix-user",
        siteTypeHint: "AIHubMix",
        user: {
          username: "aihubmix-user",
          display_name: "Alice",
        },
      },
    })
  })

  it("does not infer AIHubMix identity from url without an explicit site type", async () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ username: "aihubmix-user", display_name: "Alice" }),
    )

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url: "https://console.aihubmix.com" },
        resolve,
      )
    })

    expect(response.success).toBe(false)
    expect(response.error).toBe("messages:content.userInfoNotFound")
  })

  it("returns userInfoNotFound when no user payload exists", async () => {
    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage({ url: "https://example.com" }, resolve)
    })

    expect(response.success).toBe(false)
    expect(response.error).toBe("messages:content.userInfoNotFound")
  })

  it("returns a structured error when reading localStorage throws during user lookup", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("localStorage unavailable")
    })

    const response = await new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage({ url: "https://example.com" }, resolve)
    })

    expect(response).toEqual({
      success: false,
      error: "localStorage unavailable",
    })
  })

  describe("content session extractor routing", () => {
    it("uses the first extractor result and does not call later extractors", async () => {
      const firstExtractor = {
        id: "first",
        canExtract: vi.fn(() => true),
        extract: vi.fn().mockResolvedValue({
          userId: "first-user",
          user: { id: "first-user", username: "first" },
        }),
      }
      const laterExtractor = {
        id: "later",
        canExtract: vi.fn(() => true),
        extract: vi.fn().mockResolvedValue({
          userId: "later-user",
          user: { id: "later-user", username: "later" },
        }),
      }
      mockGetContentSessionExtractors.mockReturnValue([
        firstExtractor,
        laterExtractor,
      ])

      const response = await new Promise<any>((resolve) => {
        handleGetUserFromLocalStorage(
          { url: "https://example.invalid", siteType: "new-api" },
          resolve,
        )
      })

      expect(response).toEqual({
        success: true,
        data: {
          userId: "first-user",
          user: { id: "first-user", username: "first" },
        },
      })
      expect(firstExtractor.canExtract).toHaveBeenCalledWith({
        url: "https://example.invalid",
        siteTypeHint: "new-api",
      })
      expect(firstExtractor.extract).toHaveBeenCalledWith({
        url: "https://example.invalid",
        siteTypeHint: "new-api",
      })
      expect(laterExtractor.canExtract).not.toHaveBeenCalled()
      expect(laterExtractor.extract).not.toHaveBeenCalled()
    })

    it("skips extractors whose canExtract returns false", async () => {
      const skippedExtractor = {
        id: "skipped",
        canExtract: vi.fn(() => false),
        extract: vi.fn(),
      }
      const matchingExtractor = {
        id: "matching",
        canExtract: vi.fn(() => true),
        extract: vi.fn().mockResolvedValue({
          userId: "matching-user",
          user: { id: "matching-user" },
        }),
      }
      mockGetContentSessionExtractors.mockReturnValue([
        skippedExtractor,
        matchingExtractor,
      ])

      const response = await new Promise<any>((resolve) => {
        handleGetUserFromLocalStorage(
          { url: "https://example.invalid", siteType: "not-a-site-type" },
          resolve,
        )
      })

      expect(response).toEqual({
        success: true,
        data: {
          userId: "matching-user",
          user: { id: "matching-user" },
        },
      })
      expect(skippedExtractor.extract).not.toHaveBeenCalled()
      expect(matchingExtractor.canExtract).toHaveBeenCalledWith({
        url: "https://example.invalid",
        siteTypeHint: "unknown",
      })
      expect(matchingExtractor.extract).toHaveBeenCalledWith({
        url: "https://example.invalid",
        siteTypeHint: "unknown",
      })
    })

    it("extracts SharedChat users with the site-type hint from temp-window detection", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 1,
          data: {
            id: "shared-user-id",
            name: "Shared User",
            userToken: "shared-user-token",
          },
        }),
      })
      vi.stubGlobal("fetch", fetchMock)
      mockGetContentSessionExtractors.mockReturnValue([
        sharedChatContentSessionExtractor,
        compatibleUserContentSessionExtractor,
      ])

      const response = await new Promise<any>((resolve) => {
        handleGetUserFromLocalStorage(
          {
            url: "https://new.sharedchat.cc/list/#/vibe-code",
            siteType: "sharedchat",
          },
          resolve,
        )
      })

      expect(response).toEqual({
        success: true,
        data: {
          userId: "shared-user-id",
          user: {
            id: "shared-user-id",
            name: "Shared User",
            userToken: "shared-user-token",
          },
          accessToken: "shared-user-token",
          siteTypeHint: "sharedchat",
        },
      })
    })

    it("returns userInfoNotFound when no extractor returns a result", async () => {
      mockGetContentSessionExtractors.mockReturnValue([
        {
          id: "empty",
          canExtract: vi.fn(() => true),
          extract: vi.fn().mockResolvedValue(null),
        },
      ])

      const response = await new Promise<any>((resolve) => {
        handleGetUserFromLocalStorage(
          { url: "https://example.invalid" },
          resolve,
        )
      })

      expect(response).toEqual({
        success: false,
        error: "messages:content.userInfoNotFound",
      })
    })

    it("returns structured errors from unexpected extractor failures", async () => {
      mockGetContentSessionExtractors.mockReturnValue([
        {
          id: "throws",
          canExtract: vi.fn(() => true),
          extract: vi.fn().mockRejectedValue(new Error("extractor failed")),
        },
      ])

      const response = await new Promise<any>((resolve) => {
        handleGetUserFromLocalStorage(
          { url: "https://example.invalid" },
          resolve,
        )
      })

      expect(response).toEqual({
        success: false,
        error: "extractor failed",
      })
    })

    it("preserves Sub2API loginRequired mapping from extractor errors", async () => {
      mockGetContentSessionExtractors.mockReturnValue([
        {
          id: "sub2api",
          canExtract: vi.fn(() => true),
          extract: vi
            .fn()
            .mockRejectedValue(new Sub2ApiContentSessionLoginRequiredError()),
        },
      ])

      const response = await new Promise<any>((resolve) => {
        handleGetUserFromLocalStorage(
          { url: "https://example.invalid" },
          resolve,
        )
      })

      expect(response).toEqual({
        success: false,
        error: "messages:sub2api.loginRequired",
      })
    })
  })
})
