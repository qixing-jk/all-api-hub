import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { resyncSub2ApiAuthToken } from "~/services/apiService/sub2api/tokenResync"

const { mockGetAllTabs, mockSendRuntimeMessage } = vi.hoisted(() => ({
  mockGetAllTabs: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  getAllTabs: mockGetAllTabs,
  sendRuntimeMessage: mockSendRuntimeMessage,
}))

describe("Sub2API token re-sync", () => {
  const mockTabSendMessage = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.stubGlobal("browser", {
      tabs: {
        query: vi.fn(),
        sendMessage: mockTabSendMessage,
      },
    })
  })

  it("skips existing-tab lookup for invalid site URLs and falls back to temp-window recovery", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce({})

    await expect(resyncSub2ApiAuthToken("not-a-url")).resolves.toBeNull()

    expect(mockGetAllTabs).not.toHaveBeenCalled()
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoDetectSite,
        url: "not-a-url",
      }),
    )
  })

  it("prefers same-origin existing tabs and trims the recovered access token", async () => {
    mockGetAllTabs.mockResolvedValueOnce([
      { id: 1, url: "https://other.example.com/dashboard", active: false },
      { id: 2, url: "https://sub2.example.com/settings", active: false },
      { id: 3, url: "https://sub2.example.com/console", active: true },
    ])

    mockTabSendMessage
      .mockResolvedValueOnce({
        success: true,
        data: { accessToken: "   " },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { accessToken: " token-from-tab " },
      })

    const result = await resyncSub2ApiAuthToken("https://sub2.example.com")

    expect(result).toEqual({
      accessToken: "token-from-tab",
      source: "existing_tab",
    })
    expect(mockTabSendMessage).toHaveBeenNthCalledWith(1, 3, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: "https://sub2.example.com",
      siteType: "sub2api",
    })
    expect(mockTabSendMessage).toHaveBeenNthCalledWith(2, 2, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: "https://sub2.example.com",
      siteType: "sub2api",
    })
    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("falls back to the temp-window runtime flow when no existing tab yields a token", async () => {
    mockGetAllTabs.mockResolvedValueOnce([
      { id: 10, url: "https://sub2.example.com/dashboard", active: true },
    ])
    mockTabSendMessage.mockResolvedValueOnce({
      success: false,
    })
    mockSendRuntimeMessage.mockResolvedValueOnce({
      data: { accessToken: " temp-window-token " },
    })

    const result = await resyncSub2ApiAuthToken("https://sub2.example.com")

    expect(result).toEqual({
      accessToken: "temp-window-token",
      source: "temp_window",
    })
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoDetectSite,
        url: "https://sub2.example.com",
      }),
    )
  })

  it("returns null when both existing-tab and temp-window recovery fail", async () => {
    mockGetAllTabs.mockResolvedValueOnce([
      { id: 11, url: "https://sub2.example.com/dashboard", active: true },
    ])
    mockTabSendMessage.mockRejectedValueOnce(new Error("receiver missing"))
    mockSendRuntimeMessage.mockRejectedValueOnce(new Error("window blocked"))

    await expect(
      resyncSub2ApiAuthToken("https://sub2.example.com"),
    ).resolves.toBeNull()
  })
})
