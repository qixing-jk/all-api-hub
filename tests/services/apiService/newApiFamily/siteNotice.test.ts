import { describe, expect, it, vi } from "vitest"

import { fetchSiteNotice } from "~/services/apiService/newApiFamily/default/siteNotice"
import { AuthTypeEnum } from "~/types"

const { fetchApiMock, loggerWarnMock } = vi.hoisted(() => ({
  fetchApiMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: {
    envelope: fetchApiMock,
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
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
  it("projects a legacy notice string from a successful response", async () => {
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
    )
  })

  it.each(
    [
      null,
      [],
      42,
      {},
      { content: 42 },
      { content: "  " },
      { content: "", title: "Unused" },
      { content: "LaoZhang-only object", version: "v2", audience: "mainland" },
    ].map((data) => [data]),
  )("returns null for invalid notice data %j", async (data) => {
    fetchApiMock.mockResolvedValueOnce({ success: true, data })
    await expect(fetchSiteNotice(request)).resolves.toBeNull()
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
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "获取站点公告信息失败",
      expect.any(TypeError),
    )
  })
})
