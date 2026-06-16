import { describe, expect, it, vi } from "vitest"

import { newApiSiteNotice } from "~/services/apiAdapters/newApi/siteNotice"
import { AuthTypeEnum } from "~/types"

const { fetchSiteNoticeMock } = vi.hoisted(() => ({
  fetchSiteNoticeMock: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  fetchSiteNotice: fetchSiteNoticeMock,
}))

describe("newApiSiteNotice", () => {
  it("delegates notice fetches to the existing common fetchSiteNotice helper", async () => {
    fetchSiteNoticeMock.mockResolvedValueOnce("Notice body")

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
      },
    }

    await expect(newApiSiteNotice.fetch(request)).resolves.toBe("Notice body")
    expect(fetchSiteNoticeMock).toHaveBeenCalledWith(request)
  })
})
