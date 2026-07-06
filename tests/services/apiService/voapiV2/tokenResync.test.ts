import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession"
import { resyncVoApiV2AuthToken } from "~/services/apiService/voapiV2/tokenResync"

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

describe("VoAPI v2 token re-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns a dashboard JWT from the browser-session reader", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      siteType: "voapi-v2",
      siteTypeHint: "voapi-v2",
      userId: "42",
      user: { username: "tab-user" },
      accessToken: " dashboard-jwt-from-tab ",
    })

    await expect(
      resyncVoApiV2AuthToken("https://voapi.example.invalid"),
    ).resolves.toEqual({
      accessToken: "dashboard-jwt-from-tab",
      userId: "42",
      username: "tab-user",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    expect(mockResolveAccountBrowserSession).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://voapi.example.invalid",
        siteType: "voapi-v2",
        useExistingTabs: true,
        useTempWindow: true,
        requestIdPrefix: "voapi-v2-token-resync",
        isUsableSession: expect.any(Function),
      }),
    )
  })

  it("maps current-tab source to existing-tab for public result shape", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      siteType: "voapi-v2",
      userId: "42",
      user: { display_name: "Current User" },
      accessToken: "current-tab-token",
    })

    await expect(
      resyncVoApiV2AuthToken("https://voapi.example.invalid"),
    ).resolves.toEqual({
      accessToken: "current-tab-token",
      userId: "42",
      username: "Current User",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
  })

  it("returns null when no usable dashboard JWT is available", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce(null)

    await expect(
      resyncVoApiV2AuthToken("https://voapi.example.invalid"),
    ).resolves.toBeNull()
  })

  it("accepts only VoAPI v2 sessions with non-empty access tokens", async () => {
    mockResolveAccountBrowserSession.mockImplementationOnce(
      async ({ isUsableSession }) => {
        expect(
          isUsableSession({
            source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
            siteType: "voapi-v2",
            siteTypeHint: "voapi-v2",
            userId: "42",
            user: { username: "blank-user" },
            accessToken: "   ",
          }),
        ).toBe(false)
        expect(
          isUsableSession({
            source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
            siteType: "VoAPI",
            siteTypeHint: "VoAPI",
            userId: "42",
            user: { username: "old-voapi-user" },
            accessToken: "old-token",
          }),
        ).toBe(false)
        expect(
          isUsableSession({
            source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
            siteType: "voapi-v2",
            siteTypeHint: "voapi-v2",
            userId: "42",
            user: { username: "usable-user" },
            accessToken: " usable-token ",
          }),
        ).toBe(true)

        return {
          source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
          siteType: "voapi-v2",
          siteTypeHint: "voapi-v2",
          userId: "42",
          user: { username: "usable-user" },
          accessToken: " usable-token ",
        }
      },
    )

    await expect(
      resyncVoApiV2AuthToken("https://voapi.example.invalid"),
    ).resolves.toEqual({
      accessToken: "usable-token",
      userId: "42",
      username: "usable-user",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
  })
})
