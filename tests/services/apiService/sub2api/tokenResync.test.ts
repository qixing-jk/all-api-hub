import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession"
import {
  resyncSub2ApiAuthToken,
  Sub2ApiAuthIdentityMismatchError,
} from "~/services/apiService/sub2api/tokenResync"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

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
      userId: "42",
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
    const protectionBypassExecution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.ReauthenticateAccount,
    )

    await resyncSub2ApiAuthToken(
      "https://example.invalid",
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
      protectionBypassExecution,
    )

    expect(mockResolveAccountBrowserSession).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.invalid",
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution,
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
      userId: "42",
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
      userId: "42",
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
      userId: "42",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
  })

  it("rejects another same-origin user and returns the complete matching session", async () => {
    mockResolveAccountBrowserSession.mockImplementationOnce(async (options) => {
      const wrongUser = {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
        siteType: "sub2api" as const,
        userId: "user-2",
        user: { id: "user-2" },
        accessToken: "wrong-user-token",
      }
      const matchingUser = {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
        siteType: "sub2api" as const,
        userId: "user-1",
        user: { id: "user-1" },
        accessToken: "matching-token",
        sub2apiAuth: {
          refreshToken: "matching-refresh",
          tokenExpiresAt: 1_800_000_000_000,
        },
      }

      expect(options.isUsableSession?.(wrongUser)).toBe(false)
      expect(options.isUsableSession?.(matchingUser)).toBe(true)
      return matchingUser
    })

    await expect(
      resyncSub2ApiAuthToken(
        "https://auth.example.invalid",
        undefined,
        undefined,
        " user-1 ",
      ),
    ).resolves.toEqual({
      accessToken: "matching-token",
      userId: "user-1",
      sub2apiAuth: {
        refreshToken: "matching-refresh",
        tokenExpiresAt: 1_800_000_000_000,
      },
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
  })

  it("reports an identity mismatch when the session resolver returns another user", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      siteType: "sub2api",
      userId: "user-2",
      user: { id: "user-2" },
      accessToken: "wrong-user-token",
    })

    await expect(
      resyncSub2ApiAuthToken(
        "https://auth.example.invalid",
        undefined,
        undefined,
        "user-1",
      ),
    ).rejects.toBeInstanceOf(Sub2ApiAuthIdentityMismatchError)
  })

  it("reports an identity mismatch when only another user is usable", async () => {
    mockResolveAccountBrowserSession.mockImplementationOnce(
      async ({ isUsableSession }) => {
        expect(
          isUsableSession({
            source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
            siteType: "sub2api",
            userId: "user-2",
            user: { id: "user-2" },
            accessToken: "wrong-user-token",
          }),
        ).toBe(false)
        return null
      },
    )

    await expect(
      resyncSub2ApiAuthToken(
        "https://auth.example.invalid",
        undefined,
        undefined,
        "user-1",
      ),
    ).rejects.toBeInstanceOf(Sub2ApiAuthIdentityMismatchError)
  })
})
