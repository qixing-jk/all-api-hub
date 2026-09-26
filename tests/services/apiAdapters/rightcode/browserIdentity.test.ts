import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import * as rightcodeContentSession from "~/services/accountSiteOnboarding/contentSession/rightcode"
import { rightCodeBrowserIdentity } from "~/services/apiAdapters/rightcode/browserIdentity"

describe("rightCodeBrowserIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("observes only RightCode sites", () => {
    expect(
      rightCodeBrowserIdentity.canObserve({
        siteType: SITE_TYPES.RIGHT_CODE,
        origin: "https://www.right.codes",
        candidateUserIds: [],
      }),
    ).toBe(true)
    expect(
      rightCodeBrowserIdentity.canObserve({
        siteType: SITE_TYPES.ONE_API,
        origin: "https://one-api.example.invalid",
        candidateUserIds: [],
      }),
    ).toBe(false)
  })

  it("returns null when browser token is absent", () => {
    vi.spyOn(
      rightcodeContentSession,
      "readRightCodeBrowserToken",
    ).mockReturnValueOnce(null)

    expect(
      rightCodeBrowserIdentity.observe({
        origin: "https://www.right.codes",
        siteType: SITE_TYPES.RIGHT_CODE,
        candidateUserIds: [],
      }),
    ).toBeNull()
  })

  it("returns sessionKey and verifies username from me endpoint", async () => {
    vi.spyOn(
      rightcodeContentSession,
      "readRightCodeBrowserToken",
    ).mockReturnValueOnce("test-token")

    const observer = rightCodeBrowserIdentity.observe({
      origin: "https://www.right.codes",
      siteType: SITE_TYPES.RIGHT_CODE,
      candidateUserIds: [],
    })
    expect(observer).not.toBeNull()
    expect(observer?.sessionKey).toBe("test-token")

    const read = vi.fn().mockResolvedValueOnce({
      id: 123,
      username: "verified-user",
      user_token: "test-token",
    })

    const verified = await observer?.verify(read)
    expect(verified).toBe("verified-user")
    expect(read).toHaveBeenCalledWith({
      url: "https://www.right.codes/auth/me",
      headers: { Authorization: "Bearer test-token" },
    })

    // If read returns unexpected shape, returns null
    const unverified = await observer?.verify(
      vi.fn().mockResolvedValueOnce({ error: "Unauthorized" }),
    )
    expect(unverified).toBeNull()
  })
})
