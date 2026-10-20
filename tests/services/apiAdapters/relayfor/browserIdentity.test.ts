import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { relayForBrowserIdentity } from "~/services/apiAdapters/relayfor/browserIdentity"
import { readRelayForBrowserToken } from "~/services/apiService/relayfor/browserSession"

vi.mock("~/services/apiService/relayfor/browserSession", () => ({
  readRelayForBrowserToken: vi.fn(),
}))

describe("relayForBrowserIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("canObserve only for SITE_TYPES.RELAYFOR", () => {
    expect(
      relayForBrowserIdentity.canObserve({
        siteType: SITE_TYPES.RELAYFOR,
        origin: "https://relayfor.xyz",
        candidateUserIds: [],
      }),
    ).toBe(true)
    expect(
      relayForBrowserIdentity.canObserve({
        siteType: SITE_TYPES.NEW_API,
        origin: "https://relayfor.xyz",
        candidateUserIds: [],
      }),
    ).toBe(false)
  })

  it("returns null when no browser token is present", () => {
    vi.mocked(readRelayForBrowserToken).mockReturnValue(null)
    expect(
      relayForBrowserIdentity.observe({
        siteType: SITE_TYPES.RELAYFOR,
        origin: "https://relayfor.xyz",
        candidateUserIds: [],
      }),
    ).toBeNull()
  })

  it("observes and verifies session via read callback", async () => {
    vi.mocked(readRelayForBrowserToken).mockReturnValue("test-token")

    const observation = relayForBrowserIdentity.observe({
      siteType: SITE_TYPES.RELAYFOR,
      origin: "https://relayfor.xyz",
      candidateUserIds: [],
    })
    expect(observation).not.toBeNull()
    expect(observation?.sessionKey).toBe("test-token")

    const readMock = vi.fn().mockResolvedValueOnce({
      id: 1,
      username: "alice",
    })

    const verified = await observation?.verify(readMock)
    expect(verified).toBe("alice")
    expect(readMock).toHaveBeenCalledWith({
      url: "https://relayfor.xyz/api/user/self",
      headers: { Authorization: "Bearer test-token" },
    })
  })
})
