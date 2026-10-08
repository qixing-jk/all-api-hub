import { describe, expect, it, vi } from "vitest"

import { sub2ApiSiteAnnouncements } from "~/services/apiAdapters/sub2api/siteAnnouncements"
import { AuthTypeEnum } from "~/types"

const { fetchSub2ApiAnnouncementsMock, markSub2ApiAnnouncementReadMock } =
  vi.hoisted(() => ({
    fetchSub2ApiAnnouncementsMock: vi.fn(),
    markSub2ApiAnnouncementReadMock: vi.fn(),
  }))

vi.mock("~/services/apiService/sub2api/account/announcements", () => ({
  fetchSub2ApiAnnouncements: fetchSub2ApiAnnouncementsMock,
  markSub2ApiAnnouncementRead: markSub2ApiAnnouncementReadMock,
}))

const request = {
  baseUrl: "https://sub2.example.com",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "jwt-token",
  },
}

describe("sub2ApiSiteAnnouncements", () => {
  it("delegates unread-only fetches to the existing Sub2API helper", async () => {
    fetchSub2ApiAnnouncementsMock.mockResolvedValueOnce([
      {
        id: 12,
        title: "Deploy",
        content: "Maintenance",
      },
    ])

    await expect(
      sub2ApiSiteAnnouncements.fetch(request, { unreadOnly: true }),
    ).resolves.toEqual([
      {
        id: "12",
        title: "Deploy",
        content: "Maintenance",
        createdAt: undefined,
        updatedAt: undefined,
        readAt: undefined,
      },
    ])

    expect(fetchSub2ApiAnnouncementsMock).toHaveBeenCalledWith(request, {
      unreadOnly: true,
    })
  })

  it("projects protocol fallbacks and timestamps into the shared announcement model", async () => {
    fetchSub2ApiAnnouncementsMock.mockResolvedValueOnce([
      {
        id: null,
        title: " ",
        message: "fallback",
        created_at: 1715000000,
        updated_at: "2026-05-07T00:00:00Z",
        read_at: "invalid",
      },
      {
        id: 99,
        body: "body",
        created_at: "1715000000",
        updated_at: "1715003600000",
        read_at: "2026-05-07T01:00:00Z",
      },
    ])
    await expect(sub2ApiSiteAnnouncements.fetch(request)).resolves.toEqual([
      {
        id: undefined,
        title: " ",
        content: "fallback",
        createdAt: 1715000000000,
        updatedAt: Date.parse("2026-05-07T00:00:00Z"),
        readAt: undefined,
      },
      {
        id: "99",
        title: undefined,
        content: "body",
        createdAt: 1715000000000,
        updatedAt: 1715003600000,
        readAt: Date.parse("2026-05-07T01:00:00Z"),
      },
    ])
    expect(fetchSub2ApiAnnouncementsMock).toHaveBeenLastCalledWith(request, {
      unreadOnly: true,
    })
  })

  it("delegates mark-read requests to the existing Sub2API helper", async () => {
    markSub2ApiAnnouncementReadMock.mockResolvedValueOnce(true)

    await expect(
      sub2ApiSiteAnnouncements.markRead({
        request,
        id: "12",
      }),
    ).resolves.toBe(true)

    expect(markSub2ApiAnnouncementReadMock).toHaveBeenCalledWith(request, "12")
  })
})
