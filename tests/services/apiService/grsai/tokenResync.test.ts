import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  resolveAccountBrowserSession,
} from "~/services/accountBrowserSession"
import { resyncGrsaiAuthToken } from "~/services/apiService/grsai/tokenResync"

vi.mock("~/services/accountBrowserSession", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/accountBrowserSession")
  >()),
  resolveAccountBrowserSession: vi.fn(),
}))

const session = (overrides: Record<string, unknown>) =>
  ({
    siteType: SITE_TYPES.GRSAI,
    userId: "6aba891720c8e541cff9d0e3",
    user: {},
    accessToken: "fresh-session-token",
    source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    ...overrides,
  }) as never

describe("resyncGrsaiAuthToken", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("resolves the console session for this site only", async () => {
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(null)

    await expect(resyncGrsaiAuthToken("https://grsai.com")).resolves.toBeNull()

    expect(resolveAccountBrowserSession).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://grsai.com",
        siteType: SITE_TYPES.GRSAI,
        useExistingTabs: true,
        useTempWindow: true,
        requestIdPrefix: "grsai-token-resync",
      }),
    )
  })

  it("returns null when the resolved session carries no token", async () => {
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(
      session({ accessToken: "   " }),
    )

    await expect(resyncGrsaiAuthToken("https://grsai.com")).resolves.toBeNull()
  })

  it("refuses a session belonging to a different account", async () => {
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(
      session({ userId: "someone-else" }),
    )

    await expect(
      resyncGrsaiAuthToken("https://grsai.com", "6aba891720c8e541cff9d0e3"),
    ).resolves.toBeNull()
  })

  it("accepts the account's own session and reports where it came from", async () => {
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(
      session({
        user: { username: "example@example.invalid" },
        source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      }),
    )

    await expect(
      resyncGrsaiAuthToken("https://grsai.com", "6aba891720c8e541cff9d0e3"),
    ).resolves.toEqual({
      accessToken: "fresh-session-token",
      userId: "6aba891720c8e541cff9d0e3",
      username: "example@example.invalid",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
    })
  })

  it("maps an in-place tab read to the existing-tab source", async () => {
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(
      session({ source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB }),
    )

    await expect(
      resyncGrsaiAuthToken("https://grsai.com"),
    ).resolves.toMatchObject({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
  })

  it.each([
    ["display_name", { display_name: "Display Name" }, "Display Name"],
    ["mail", { mail: "example@example.invalid" }, "example@example.invalid"],
  ])("falls back to user.%s", async (_label, user, expected) => {
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(
      session({ user }),
    )

    await expect(
      resyncGrsaiAuthToken("https://grsai.com"),
    ).resolves.toMatchObject({ username: expected })
  })

  it("omits the username when the session carries none", async () => {
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(session({}))

    const result = await resyncGrsaiAuthToken("https://grsai.com")

    expect(result).not.toBeNull()
    expect(result).not.toHaveProperty("username")
  })

  it("rejects a session the resolver only matched for another site", async () => {
    // `isUsableSession` is the resolver's filter; this asserts the predicate it
    // was handed refuses a session that is not this site's.
    vi.mocked(resolveAccountBrowserSession).mockImplementationOnce(
      async (options) => {
        const foreign = session({ siteType: SITE_TYPES.RIGHT_CODE })
        return options.isUsableSession?.(foreign as never) ? foreign : null
      },
    )

    await expect(resyncGrsaiAuthToken("https://grsai.com")).resolves.toBeNull()
  })
})
