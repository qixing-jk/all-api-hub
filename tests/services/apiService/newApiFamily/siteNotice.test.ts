import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchSiteNotice } from "~/services/apiService/newApiFamily/siteNotice"
import { AuthTypeEnum } from "~/types"

const { commonFetchSiteNotice } = vi.hoisted(() => ({
  commonFetchSiteNotice: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  fetchSiteNotice: commonFetchSiteNotice,
}))

const request = {
  baseUrl: "https://notice.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "token",
  },
}

describe("newApiFamily siteNotice", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses the common-compatible site notice fetcher", async () => {
    commonFetchSiteNotice.mockResolvedValueOnce("Notice body")

    await expect(fetchSiteNotice(request)).resolves.toBe("Notice body")

    expect(commonFetchSiteNotice).toHaveBeenCalledOnce()
    expect(commonFetchSiteNotice).toHaveBeenCalledWith(request)
  })
})
