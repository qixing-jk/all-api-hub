import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  resolveAccountBrowserSession,
} from "~/services/accountBrowserSession"
import { resyncRightCodeAuthToken } from "~/services/apiService/rightcode/tokenResync"

vi.mock("~/services/accountBrowserSession", () => ({
  ACCOUNT_BROWSER_SESSION_SOURCES: {
    CURRENT_TAB: "current_tab",
    EXISTING_TAB: "existing_tab",
    TEMP_WINDOW: "temp_window",
  },
  resolveAccountBrowserSession: vi.fn(),
}))

describe("resyncRightCodeAuthToken", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null when no browser session is resolved", async () => {
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(null)

    const result = await resyncRightCodeAuthToken("https://www.right.codes")
    expect(result).toBeNull()
  })

  it("returns null when session has an empty access token", async () => {
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce({
      siteType: SITE_TYPES.RIGHT_CODE,
      accessToken: "   ",
      userId: "7",
      source: "existing_tab" as never,
    } as never)

    const result = await resyncRightCodeAuthToken("https://www.right.codes")
    expect(result).toBeNull()
  })

  it("returns null when session userId does not match expectedUserId", async () => {
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce({
      siteType: SITE_TYPES.RIGHT_CODE,
      accessToken: "valid-token",
      userId: "99",
      source: "existing_tab" as never,
    } as never)

    const result = await resyncRightCodeAuthToken(
      "https://www.right.codes",
      "7",
    )
    expect(result).toBeNull()
  })

  it("resolves and normalizes username from user fields and maps sources correctly", async () => {
    // Case 1: user.username and TEMP_WINDOW source
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce({
      siteType: SITE_TYPES.RIGHT_CODE,
      accessToken: "token-1",
      userId: "7",
      user: { username: "user-one" },
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
    } as never)

    const res1 = await resyncRightCodeAuthToken("https://www.right.codes", "7")
    expect(res1).toEqual({
      accessToken: "token-1",
      userId: "7",
      username: "user-one",
      source: "temp_window",
    })

    // Case 2: user.display_name and CURRENT_TAB source
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce({
      siteType: SITE_TYPES.RIGHT_CODE,
      accessToken: "token-2",
      userId: "7",
      user: { display_name: "Display Name" },
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
    } as never)

    const res2 = await resyncRightCodeAuthToken("https://www.right.codes", "7")
    expect(res2).toEqual({
      accessToken: "token-2",
      userId: "7",
      username: "Display Name",
      source: "existing_tab",
    })

    // Case 3: user.email and EXISTING_TAB source
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce({
      siteTypeHint: SITE_TYPES.RIGHT_CODE,
      accessToken: "token-3",
      userId: "7",
      user: { email: "test@example.com" },
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    } as never)

    const res3 = await resyncRightCodeAuthToken("https://www.right.codes", "7")
    expect(res3).toEqual({
      accessToken: "token-3",
      userId: "7",
      username: "test@example.com",
      source: "existing_tab",
    })

    // Case 4: no username fields
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce({
      siteType: SITE_TYPES.RIGHT_CODE,
      accessToken: "token-4",
      userId: "7",
      user: {},
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    } as never)

    const res4 = await resyncRightCodeAuthToken("https://www.right.codes", "7")
    expect(res4).toEqual({
      accessToken: "token-4",
      userId: "7",
      source: "existing_tab",
    })
  })

  it("passes custom isUsableSession predicate checking siteType and expectedUserId", async () => {
    let capturedPredicate: ((session: unknown) => boolean) | undefined
    vi.mocked(resolveAccountBrowserSession).mockImplementationOnce(
      async (options: any) => {
        capturedPredicate = options.isUsableSession
        return null
      },
    )

    await resyncRightCodeAuthToken("https://www.right.codes", "42")
    expect(capturedPredicate).toBeDefined()

    // Wrong site type
    expect(
      capturedPredicate!({
        siteType: SITE_TYPES.ONE_API,
        accessToken: "tok",
        userId: "42",
      }),
    ).toBe(false)

    // Empty access token
    expect(
      capturedPredicate!({
        siteType: SITE_TYPES.RIGHT_CODE,
        accessToken: "",
        userId: "42",
      }),
    ).toBe(false)

    // Mismatched userId
    expect(
      capturedPredicate!({
        siteType: SITE_TYPES.RIGHT_CODE,
        accessToken: "tok",
        userId: "99",
      }),
    ).toBe(false)

    // Matching session
    expect(
      capturedPredicate!({
        siteType: SITE_TYPES.RIGHT_CODE,
        accessToken: "tok",
        userId: "42",
      }),
    ).toBe(true)
  })
})
