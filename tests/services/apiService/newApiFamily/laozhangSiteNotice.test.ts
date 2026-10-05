import { describe, expect, it, vi } from "vitest"

import { fetchLaoZhangSiteNotice } from "~/services/apiService/newApiFamily/variants/laozhangSiteNotice"
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

describe("LaoZhang siteNotice", () => {
  it("returns a legacy notice string without account credentials", async () => {
    fetchApiMock.mockResolvedValueOnce({ success: true, data: "Notice body" })
    await expect(fetchLaoZhangSiteNotice(request)).resolves.toBe("Notice body")
    expect(fetchApiMock).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { authType: AuthTypeEnum.None } }),
      { endpoint: "/api/notice" },
    )
  })

  it.each([
    { version: "v1", audience: "mainland" },
    { version: "v2", audience: "mainland" },
    { version: "always", audience: "overseas" },
    {
      version: "",
      audience: "overseas",
      effective_audience: "mainland",
      country: "US",
      reason: "ip",
    },
    { version: 42, audience: null, country: "CN" },
    {},
  ])(
    "extracts the same body regardless of website popup metadata %j",
    async (metadata) => {
      const content = " **Service notice**\n<br>Details "
      fetchApiMock.mockResolvedValueOnce({
        success: true,
        data: { content, ...metadata },
      })
      await expect(fetchLaoZhangSiteNotice(request)).resolves.toBe(content)
    },
  )

  it("returns changed content even when the website revision stays the same", async () => {
    for (const content of ["Notice", "Edited notice"]) {
      fetchApiMock.mockResolvedValueOnce({
        success: true,
        data: { content, version: "v1", audience: "mainland" },
      })
      await expect(fetchLaoZhangSiteNotice(request)).resolves.toBe(content)
    }
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
    ].map((data) => [data]),
  )("returns null for invalid notice data %j", async (data) => {
    fetchApiMock.mockResolvedValueOnce({ success: true, data })
    await expect(fetchLaoZhangSiteNotice(request)).resolves.toBeNull()
  })

  it("returns null for unsuccessful or malformed notice responses", async () => {
    fetchApiMock.mockResolvedValueOnce({ success: false })
    await expect(fetchLaoZhangSiteNotice(request)).resolves.toBeNull()

    fetchApiMock.mockResolvedValueOnce({ success: true, data: "   " })
    await expect(fetchLaoZhangSiteNotice(request)).resolves.toBeNull()
  })

  it("returns null when the network request throws", async () => {
    fetchApiMock.mockRejectedValueOnce(new TypeError("network failed"))

    await expect(fetchLaoZhangSiteNotice(request)).resolves.toBeNull()
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "获取站点公告信息失败",
      expect.any(TypeError),
    )
  })
})
