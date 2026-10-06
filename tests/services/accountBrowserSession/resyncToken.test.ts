import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  resolveAccountBrowserSession,
  type AccountBrowserSession,
} from "~/services/accountBrowserSession"
import { createBrowserTokenResync } from "~/services/accountBrowserSession/resyncToken"

vi.mock("~/services/accountBrowserSession", () => ({
  ACCOUNT_BROWSER_SESSION_SOURCES: {
    CURRENT_TAB: "current_tab",
    EXISTING_TAB: "existing_tab",
    TEMP_WINDOW: "temp_window",
  },
  resolveAccountBrowserSession: vi.fn(),
}))

const resync = createBrowserTokenResync({
  siteType: SITE_TYPES.RIGHT_CODE,
  requestIdPrefix: "identity-test",
  usernameFields: ["username"],
})

describe("browser token resync identity", () => {
  beforeEach(() => vi.resetAllMocks())

  it.each([
    { expectedUserId: 42, sessionUserId: "42", accepted: true },
    { expectedUserId: 42, sessionUserId: "7", accepted: false },
    { expectedUserId: 0, sessionUserId: "0", accepted: true },
    { expectedUserId: 0, sessionUserId: "7", accepted: false },
    { expectedUserId: Number.NaN, sessionUserId: "7", accepted: false },
    {
      expectedUserId: Number.POSITIVE_INFINITY,
      sessionUserId: "Infinity",
      accepted: false,
    },
    { expectedUserId: undefined, sessionUserId: "7", accepted: true },
    { expectedUserId: "", sessionUserId: "7", accepted: true },
  ])(
    "matches the expected identity in selection and readback: %j",
    async ({ expectedUserId, sessionUserId, accepted }) => {
      const session: AccountBrowserSession = {
        siteType: SITE_TYPES.RIGHT_CODE,
        source: "existing_tab",
        userId: sessionUserId,
        user: {},
        accessToken: "fresh-token",
      }
      vi.mocked(resolveAccountBrowserSession).mockImplementationOnce(
        async (options) => {
          expect(options.isUsableSession?.(session)).toBe(accepted)
          // Verify defensive readback even if a resolver returns a rejected session.
          return session
        },
      )
      const result = await resync({
        baseUrl: "https://example.invalid",
        expectedUserId,
      })
      if (accepted)
        expect(result).toMatchObject({
          accessToken: "fresh-token",
          userId: sessionUserId,
        })
      else expect(result).toBeNull()
    },
  )
})
