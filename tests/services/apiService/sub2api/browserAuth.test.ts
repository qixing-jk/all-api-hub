import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession"
import {
  recoverSub2ApiBrowserAuth,
  Sub2ApiAuthIdentityMismatchError,
} from "~/services/apiService/sub2api/browserAuth"
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

describe("Sub2API browser auth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const recoverBrowserAuth = (expectedUserId?: string) =>
    recoverSub2ApiBrowserAuth({
      baseUrl: "https://sub2.example.com",
      ...(expectedUserId ? { expectedUserId } : {}),
    })

  it("returns credentials and fetch context from an existing tab", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      siteType: "sub2api",
      userId: "42",
      accessToken: " token-from-tab ",
      sub2apiAuth: {
        refreshToken: "refresh-from-tab",
        tokenExpiresAt: 1_800_000_000_000,
      },
      fetchContext: {
        kind: "current-tab",
        tabId: 17,
        origin: "https://sub2.example.com",
      },
    })

    await expect(recoverBrowserAuth()).resolves.toEqual({
      accessToken: "token-from-tab",
      userId: "42",
      sub2apiAuth: {
        refreshToken: "refresh-from-tab",
        tokenExpiresAt: 1_800_000_000_000,
      },
      fetchContext: {
        kind: "current-tab",
        tabId: 17,
        origin: "https://sub2.example.com",
      },
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    expect(mockResolveAccountBrowserSession).toHaveBeenCalledWith({
      baseUrl: "https://sub2.example.com",
      siteType: "sub2api",
      useExistingTabs: true,
      useTempWindow: true,
      requestIdPrefix: "sub2api-auth-recovery",
      isUsableSession: expect.any(Function),
    })
  })

  it("normalizes a current-tab result to the existing-tab source", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      siteType: "sub2api",
      userId: "42",
      accessToken: "current-tab-token",
    })

    await expect(recoverBrowserAuth()).resolves.toEqual({
      accessToken: "current-tab-token",
      userId: "42",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
  })

  it("returns null when no existing tab has a usable token", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce(null)

    await expect(recoverBrowserAuth()).resolves.toBeNull()
  })

  it("delegates temporary-context policy metadata to the shared session reader", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce(null)
    const protectionBypassExecution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
    )

    await recoverSub2ApiBrowserAuth({
      baseUrl: "https://sub2.example.com",
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      protectionBypassExecution,
    })

    expect(mockResolveAccountBrowserSession).toHaveBeenCalledWith(
      expect.objectContaining({
        useExistingTabs: true,
        useTempWindow: true,
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution,
      }),
    )
  })

  it("accepts only non-empty access tokens from the session reader", async () => {
    mockResolveAccountBrowserSession.mockImplementationOnce(
      async ({ isUsableSession }) => {
        expect(
          isUsableSession({
            source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
            siteType: "sub2api",
            accessToken: "   ",
          }),
        ).toBe(false)
        expect(
          isUsableSession({
            source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
            siteType: "sub2api",
            accessToken: " usable-token ",
          }),
        ).toBe(true)
        return null
      },
    )

    await expect(recoverBrowserAuth()).resolves.toBeNull()
  })

  it("selects only a session for the expected account identity", async () => {
    mockResolveAccountBrowserSession.mockImplementationOnce(async (options) => {
      const wrongUser = {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
        siteType: "sub2api" as const,
        userId: "user-2",
        accessToken: "wrong-user-token",
      }
      const matchingUser = {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
        siteType: "sub2api" as const,
        userId: "user-1",
        accessToken: "matching-token",
      }

      expect(options.isUsableSession?.(wrongUser)).toBe(false)
      expect(options.isUsableSession?.(matchingUser)).toBe(true)
      return matchingUser
    })

    await expect(recoverBrowserAuth(" user-1 ")).resolves.toMatchObject({
      accessToken: "matching-token",
      userId: "user-1",
    })
  })

  it("rejects a returned session for another account identity", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      siteType: "sub2api",
      userId: "user-2",
      accessToken: "wrong-user-token",
    })

    await expect(recoverBrowserAuth("user-1")).rejects.toBeInstanceOf(
      Sub2ApiAuthIdentityMismatchError,
    )
  })
})
