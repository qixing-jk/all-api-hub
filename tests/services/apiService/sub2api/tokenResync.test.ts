import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession"
import { resyncSub2ApiAuthToken } from "~/services/apiService/sub2api/tokenResync"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"

const { mockResolveAccountBrowserSession } = vi.hoisted(() => ({
  mockResolveAccountBrowserSession: vi.fn(),
}))

vi.mock("~/services/accountBrowserSession", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/accountBrowserSession")>()

  return {
    ...actual,
    resolveAccountBrowserSession: mockResolveAccountBrowserSession,
  }
})

describe("Sub2API token re-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns an existing-tab token from the browser-session reader", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      siteType: "sub2api",
      userId: "42",
      user: { username: "tab-user" },
      accessToken: " token-from-tab ",
    })

    const result = await resyncSub2ApiAuthToken("https://sub2.example.com")

    expect(result).toEqual({
      accessToken: "token-from-tab",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    expect(mockResolveAccountBrowserSession).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sub2.example.com",
        siteType: "sub2api",
        useExistingTabs: true,
        useTempWindow: true,
        requestIdPrefix: "sub2api-token-resync",
        isUsableSession: expect.any(Function),
      }),
    )
    expect(mockResolveAccountBrowserSession).toHaveBeenCalledWith(
      expect.not.objectContaining({
        tempWindowRequestSource: expect.anything(),
      }),
    )
  })

  it("passes popup source to the browser-session reader", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce(null)

    await resyncSub2ApiAuthToken(
      "https://example.invalid",
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
    )

    expect(mockResolveAccountBrowserSession).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.invalid",
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }),
    )
  })

  it("maps current-tab source to existing public existing-tab source", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      siteType: "sub2api",
      userId: "42",
      user: { username: "current-user" },
      accessToken: "current-tab-token",
    })

    await expect(
      resyncSub2ApiAuthToken("https://sub2.example.com"),
    ).resolves.toEqual({
      accessToken: "current-tab-token",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
  })

  it("returns a temp-window token from the browser-session reader", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      siteType: "sub2api",
      userId: "42",
      user: { username: "temp-user" },
      accessToken: " temp-window-token ",
    })

    await expect(
      resyncSub2ApiAuthToken("https://sub2.example.com"),
    ).resolves.toEqual({
      accessToken: "temp-window-token",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
    })
  })

  it("returns null when the browser-session reader finds no usable token", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce(null)

    await expect(
      resyncSub2ApiAuthToken("https://sub2.example.com"),
    ).resolves.toBeNull()
  })

  it("passes a usability predicate that accepts only non-empty access tokens", async () => {
    mockResolveAccountBrowserSession.mockImplementationOnce(
      async ({ isUsableSession }) => {
        expect(
          isUsableSession({
            source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
            siteType: "sub2api",
            userId: "42",
            user: { username: "blank-user" },
            accessToken: "   ",
          }),
        ).toBe(false)
        expect(
          isUsableSession({
            source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
            siteType: "sub2api",
            userId: "42",
            user: { username: "usable-user" },
            accessToken: " usable-token ",
          }),
        ).toBe(true)

        return {
          source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
          siteType: "sub2api",
          userId: "42",
          user: { username: "usable-user" },
          accessToken: " usable-token ",
        }
      },
    )

    await expect(
      resyncSub2ApiAuthToken("https://sub2.example.com"),
    ).resolves.toEqual({
      accessToken: "usable-token",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
  })
})
