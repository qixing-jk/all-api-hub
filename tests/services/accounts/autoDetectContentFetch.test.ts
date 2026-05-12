import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  fetchUserInfoViaAutoDetectContent,
  getOrCreateAccessTokenViaAutoDetectContent,
} from "~/services/accounts/autoDetectContentFetch"
import {
  EXTENSION_HEADER_NAME,
  EXTENSION_HEADER_VALUE,
} from "~/utils/browser/cookieHelper"

describe("autoDetectContentFetch", () => {
  const browserAny = globalThis.browser as any
  const originalTabs = browserAny.tabs

  beforeEach(() => {
    vi.clearAllMocks()
    browserAny.tabs = {
      sendMessage: vi.fn(),
    }
  })

  afterEach(() => {
    browserAny.tabs = originalTabs
  })

  it("fetches user info through the current tab with compatibility headers", async () => {
    browserAny.tabs.sendMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        message: "",
        data: {
          id: 2,
          username: "test",
          access_token: "existing-token",
        },
      },
    })

    const result = await fetchUserInfoViaAutoDetectContent({
      tabId: 123,
      baseUrl: "https://ai.example.com/",
      userId: 2,
    })

    expect(result).toEqual({
      id: 2,
      username: "test",
      access_token: "existing-token",
      user: {
        id: 2,
        username: "test",
        access_token: "existing-token",
      },
    })
    expect(browserAny.tabs.sendMessage).toHaveBeenCalledWith(123, {
      action: RuntimeActionIds.ContentPerformTempWindowFetch,
      requestId: expect.stringMatching(/^auto-detect-content-fetch-/),
      fetchUrl: "https://ai.example.com/api/user/self",
      responseType: "json",
      fetchOptions: {
        method: "GET",
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Pragma: "no-cache",
          [EXTENSION_HEADER_NAME]: EXTENSION_HEADER_VALUE,
          "New-API-User": "2",
          "User-id": "2",
        }),
      },
    })
  })

  it("creates an access token through the current tab when user info has none", async () => {
    browserAny.tabs.sendMessage
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: {
          success: true,
          message: "",
          data: {
            id: 2,
            username: "test",
            access_token: "",
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: {
          success: true,
          message: "",
          data: "created-token",
        },
      })

    const result = await getOrCreateAccessTokenViaAutoDetectContent({
      tabId: 123,
      baseUrl: "https://ai.example.com/",
      userId: 2,
    })

    expect(result).toEqual({
      username: "test",
      access_token: "created-token",
    })
    expect(browserAny.tabs.sendMessage).toHaveBeenNthCalledWith(
      2,
      123,
      expect.objectContaining({
        action: RuntimeActionIds.ContentPerformTempWindowFetch,
        fetchUrl: "https://ai.example.com/api/user/token",
      }),
    )
  })

  it("throws a stable error when content fetch returns an API failure envelope", async () => {
    browserAny.tabs.sendMessage.mockResolvedValueOnce({
      success: false,
      status: 401,
      data: {
        success: false,
        message: "Unauthorized, not logged in",
      },
      error: "Unauthorized, not logged in",
    })

    await expect(
      fetchUserInfoViaAutoDetectContent({
        tabId: 123,
        baseUrl: "https://ai.example.com/",
        userId: 2,
      }),
    ).rejects.toThrow("Unauthorized, not logged in")
  })

  it("throws a stable error when a successful content fetch returns an API failure envelope without data", async () => {
    browserAny.tabs.sendMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: false,
        message: "Unauthorized, not logged in",
      },
    })

    await expect(
      fetchUserInfoViaAutoDetectContent({
        tabId: 123,
        baseUrl: "https://ai.example.com/",
        userId: 2,
      }),
    ).rejects.toThrow("Unauthorized, not logged in")
  })

  it("accepts direct user info payloads without an API envelope", async () => {
    browserAny.tabs.sendMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        id: 2,
        username: "direct-user",
        access_token: "direct-token",
      },
    })

    const result = await fetchUserInfoViaAutoDetectContent({
      tabId: 123,
      baseUrl: "https://ai.example.com/",
      userId: 2,
    })

    expect(result).toEqual({
      id: 2,
      username: "direct-user",
      access_token: "direct-token",
      user: {
        id: 2,
        username: "direct-user",
        access_token: "direct-token",
      },
    })
  })

  it("accepts direct user info payloads with a domain success field", async () => {
    browserAny.tabs.sendMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        id: 2,
        username: "domain-success",
        access_token: "domain-token",
      },
    })

    const result = await fetchUserInfoViaAutoDetectContent({
      tabId: 123,
      baseUrl: "https://ai.example.com/",
      userId: 2,
    })

    expect(result).toEqual({
      id: 2,
      username: "domain-success",
      access_token: "domain-token",
      user: {
        success: true,
        id: 2,
        username: "domain-success",
        access_token: "domain-token",
      },
    })
  })

  it("throws when the content response is missing required user fields", async () => {
    browserAny.tabs.sendMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        message: "",
        data: {
          id: 2,
        },
      },
    })

    await expect(
      fetchUserInfoViaAutoDetectContent({
        tabId: 123,
        baseUrl: "https://ai.example.com/",
        userId: 2,
      }),
    ).rejects.toThrow("auto_detect_content_user_info_incomplete")
  })
})
