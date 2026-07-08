import { describe, expect, it, vi } from "vitest"

import { fetchSiteAnnouncements } from "~/services/apiService/newApiFamily/default/siteAnnouncements"
import { AuthTypeEnum } from "~/types"

const { fetchApiDataMock, loggerWarnMock } = vi.hoisted(() => ({
  fetchApiDataMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiData: fetchApiDataMock,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}))

const request = {
  baseUrl: "https://announcements.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "token",
  },
}

describe("newApiFamily siteAnnouncements", () => {
  it("returns structured announcements from public status responses", async () => {
    fetchApiDataMock.mockResolvedValueOnce({
      announcements_enabled: true,
      announcements: [
        {
          content: " Maintenance window ",
          publishDate: "2026-07-01T12:00:00Z",
          type: "warning",
          extra: " Expect brief interruptions ",
        },
        {
          content: "   ",
          publishDate: "2026-07-02T12:00:00Z",
          type: "success",
        },
      ],
    })

    await expect(fetchSiteAnnouncements(request)).resolves.toEqual([
      {
        content: " Maintenance window ",
        publishDate: "2026-07-01T12:00:00Z",
        type: "warning",
        extra: " Expect brief interruptions ",
      },
    ])

    expect(fetchApiDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { authType: AuthTypeEnum.None },
      }),
      { endpoint: "/api/status" },
    )
  })

  it("returns an empty list when announcements are disabled or malformed", async () => {
    fetchApiDataMock.mockResolvedValueOnce({
      announcements_enabled: false,
      announcements: [{ content: "Hidden" }],
    })
    await expect(fetchSiteAnnouncements(request)).resolves.toEqual([])

    fetchApiDataMock.mockResolvedValueOnce({
      announcements_enabled: true,
      announcements: "not-an-array",
    })
    await expect(fetchSiteAnnouncements(request)).resolves.toEqual([])
  })

  it("returns an empty list when the status request throws", async () => {
    fetchApiDataMock.mockRejectedValueOnce(new TypeError("network failed"))

    await expect(fetchSiteAnnouncements(request)).resolves.toEqual([])
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "获取站点系统公告失败",
      expect.any(TypeError),
    )
  })
})
