import { describe, expect, it, vi } from "vitest"

import { fetchSiteNotice } from "~/services/apiService/common"
import { AuthTypeEnum } from "~/types"

const { fetchApiMock } = vi.hoisted(() => ({
  fetchApiMock: vi.fn(),
}))

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: fetchApiMock,
}))

const request = {
  baseUrl: "https://example.com",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "token",
  },
}

describe("apiService common fetchSiteNotice", () => {
  it("returns a non-empty notice string from a successful response", async () => {
    fetchApiMock.mockResolvedValueOnce({
      success: true,
      data: "Notice body",
    })

    await expect(fetchSiteNotice(request)).resolves.toBe("Notice body")
    expect(fetchApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ authType: AuthTypeEnum.None }),
      }),
      { endpoint: "/api/notice" },
      false,
    )
  })

  it("returns null for unsuccessful or malformed notice responses", async () => {
    fetchApiMock.mockResolvedValueOnce({ success: false })
    await expect(fetchSiteNotice(request)).resolves.toBeNull()

    fetchApiMock.mockResolvedValueOnce({ success: true, data: "   " })
    await expect(fetchSiteNotice(request)).resolves.toBeNull()
  })

  it("returns null when the network request throws", async () => {
    fetchApiMock.mockRejectedValueOnce(new TypeError("network failed"))

    await expect(fetchSiteNotice(request)).resolves.toBeNull()
  })
})
