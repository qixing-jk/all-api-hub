import { describe, expect, it, vi } from "vitest"

import {
  commonSiteAnnouncementProvider,
  createCommonSiteAnnouncementKey,
  createSub2ApiSiteAnnouncementKey,
  sub2ApiSiteAnnouncementProvider,
} from "~/services/siteAnnouncements/providers"
import { AuthTypeEnum } from "~/types"
import { SITE_ANNOUNCEMENT_STATUS } from "~/types/siteAnnouncements"

const { getApiServiceMock } = vi.hoisted(() => ({
  getApiServiceMock: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: getApiServiceMock,
}))

const baseRequest = {
  accountId: "account-1",
  siteName: "Example",
  siteType: "new-api",
  baseUrl: "https://Example.com/",
  providerId: "common" as const,
  apiRequest: {
    baseUrl: "https://Example.com/",
    accountId: "account-1",
    auth: {
      authType: AuthTypeEnum.None,
    },
  },
}

describe("site announcement providers", () => {
  it("uses normalized site keys for common and Sub2API providers", () => {
    expect(
      createCommonSiteAnnouncementKey({
        siteType: "new-api",
        baseUrl: "https://Example.com/path",
      }),
    ).toBe("notice:new-api:https://example.com")

    expect(
      createSub2ApiSiteAnnouncementKey({
        accountId: "account-1",
        baseUrl: "https://Example.com/path",
      }),
    ).toBe("sub2api:account-1:https://example.com")
  })

  it("returns a common announcement for non-empty /api/notice responses", async () => {
    getApiServiceMock.mockReturnValueOnce({
      fetchSiteNotice: vi.fn().mockResolvedValue(" **Hello** <b>world</b> "),
    })

    const result = await commonSiteAnnouncementProvider.fetch(baseRequest)

    expect(result.status).toBe(SITE_ANNOUNCEMENT_STATUS.Success)
    expect(result.announcements).toEqual([
      {
        content: "**Hello** <b>world</b>",
        fingerprint: "**Hello** <b>world</b>",
      },
    ])
  })

  it("normalizes Sub2API unread announcement lists and marks ids as read", async () => {
    const markRead = vi.fn().mockResolvedValue(true)
    getApiServiceMock.mockReturnValue({
      fetchSub2ApiAnnouncements: vi.fn().mockResolvedValue([
        {
          id: 12,
          title: "Deploy",
          content: "Maintenance",
          created_at: "2026-05-07T00:00:00Z",
          read_at: "2026-05-07T01:00:00Z",
        },
      ]),
      markSub2ApiAnnouncementRead: markRead,
    })

    const request = {
      ...baseRequest,
      siteType: "sub2api",
      providerId: "sub2api" as const,
    }
    const result = await sub2ApiSiteAnnouncementProvider.fetch(request)

    expect(result.status).toBe(SITE_ANNOUNCEMENT_STATUS.Success)
    expect(result.announcements[0]).toMatchObject({
      id: "12",
      title: "Deploy",
      content: "Maintenance",
      createdAt: Date.parse("2026-05-07T00:00:00Z"),
      readAt: Date.parse("2026-05-07T01:00:00Z"),
      fingerprint: "12",
    })

    await sub2ApiSiteAnnouncementProvider.markRead?.(
      request,
      result.announcements,
    )

    expect(markRead).toHaveBeenCalledWith(request.apiRequest, "12")
  })

  it("keeps Sub2API title-only announcements title-only", async () => {
    getApiServiceMock.mockReturnValue({
      fetchSub2ApiAnnouncements: vi.fn().mockResolvedValue([
        {
          id: 13,
          title: "Title only",
          content: "",
        },
      ]),
    })

    const request = {
      ...baseRequest,
      siteType: "sub2api",
      providerId: "sub2api" as const,
    }
    const result = await sub2ApiSiteAnnouncementProvider.fetch(request)

    expect(result.announcements[0]).toMatchObject({
      id: "13",
      title: "Title only",
      content: "",
      fingerprint: "13",
    })
  })
})
