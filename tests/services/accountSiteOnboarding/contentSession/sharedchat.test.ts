import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { sharedChatContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/sharedchat"

describe("sharedChatContentSessionExtractor", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it("extracts the logged-in SharedChat user through frontend getme", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        code: 1,
        data: {
          id: "shared-user-id",
          name: "Shared User",
          userToken: "shared-user-token",
        },
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      sharedChatContentSessionExtractor.extract({
        url: "https://new.sharedchat.cc/list/#/vibe-code",
        siteTypeHint: SITE_TYPES.SHAREDCHAT,
      }),
    ).resolves.toEqual({
      userId: "shared-user-id",
      user: {
        id: "shared-user-id",
        name: "Shared User",
        userToken: "shared-user-token",
      },
      accessToken: "shared-user-token",
      siteTypeHint: SITE_TYPES.SHAREDCHAT,
    })
    expect(fetchMock).toHaveBeenCalledWith("/frontend-api/getme", {
      cache: "no-store",
      credentials: "include",
    })
  })

  it("only extracts explicit SharedChat sessions", () => {
    expect(
      sharedChatContentSessionExtractor.canExtract({
        url: "https://new.sharedchat.cc",
        siteTypeHint: SITE_TYPES.SHAREDCHAT,
      }),
    ).toBe(true)
    expect(
      sharedChatContentSessionExtractor.canExtract({
        url: "https://new.sharedchat.cc",
        siteTypeHint: SITE_TYPES.UNKNOWN,
      }),
    ).toBe(false)
  })
})
