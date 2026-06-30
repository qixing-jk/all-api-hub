import { describe, expect, it, vi } from "vitest"

import { newApiSiteNotice } from "~/services/apiAdapters/newApi/siteNotice"
import { AuthTypeEnum } from "~/types"

const { newApiFamilyFetchSiteNoticeMock } = vi.hoisted(() => ({
  newApiFamilyFetchSiteNoticeMock: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/siteNotice", () => ({
  fetchSiteNotice: newApiFamilyFetchSiteNoticeMock,
}))

describe("newApiSiteNotice", () => {
  it("delegates notice fetches through the New API-family implementation", async () => {
    newApiFamilyFetchSiteNoticeMock.mockResolvedValueOnce("Notice body")

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
      },
    }

    await expect(newApiSiteNotice.fetch(request)).resolves.toBe("Notice body")
    expect(newApiFamilyFetchSiteNoticeMock).toHaveBeenCalledWith(request)
  })
})
