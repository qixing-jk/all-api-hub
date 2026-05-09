import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  commonSiteAnnouncementProvider,
  createCommonSiteAnnouncementKey,
  createSub2ApiSiteAnnouncementKey,
  getSiteAnnouncementProvider,
  sub2ApiSiteAnnouncementProvider,
} from "~/services/siteAnnouncements/providers"
import { AuthTypeEnum } from "~/types"
import {
  SITE_ANNOUNCEMENT_STATUS,
  type SiteAnnouncementProviderRequest,
} from "~/types/siteAnnouncements"

const { getApiServiceMock } = vi.hoisted(() => ({
  getApiServiceMock: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: getApiServiceMock,
}))

const baseRequest: SiteAnnouncementProviderRequest = {
  accountId: "account-1",
  siteName: "Example",
  siteType: SITE_TYPES.NEW_API,
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
        siteType: SITE_TYPES.NEW_API,
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
        fingerprint: "22:**Hello** <b>world</b>",
      },
    ])
  })

  it("returns an empty common announcement list for blank notice bodies", async () => {
    getApiServiceMock.mockReturnValueOnce({
      fetchSiteNotice: vi.fn().mockResolvedValue("   "),
    })

    const result = await commonSiteAnnouncementProvider.fetch(baseRequest)

    expect(result).toMatchObject({
      status: SITE_ANNOUNCEMENT_STATUS.Success,
      announcements: [],
    })
  })

  it("marks common provider failures as unsupported with the upstream error text", async () => {
    getApiServiceMock.mockReturnValueOnce({
      fetchSiteNotice: vi.fn().mockRejectedValue(new Error("not supported")),
    })

    const result = await commonSiteAnnouncementProvider.fetch(baseRequest)

    expect(result).toMatchObject({
      status: SITE_ANNOUNCEMENT_STATUS.Unsupported,
      announcements: [],
      error: "not supported",
    })
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
      siteType: SITE_TYPES.SUB2API,
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

  it("normalizes Sub2API announcements from body/message fallbacks and mixed timestamp formats", async () => {
    getApiServiceMock.mockReturnValue({
      fetchSub2ApiAnnouncements: vi.fn().mockResolvedValue([
        {
          id: null,
          title: "  ",
          message: " Message fallback ",
          created_at: 1_715_000_000,
          updated_at: "2026-05-07T00:00:00Z",
          read_at: "invalid",
        },
        {
          id: 99,
          title: "Body fallback",
          body: " From body ",
          created_at: "1715000000",
          updated_at: "1715003600000",
        },
        {
          id: 100,
          title: "   ",
          content: "   ",
          message: "",
          body: "",
        },
      ]),
    })

    const request = {
      ...baseRequest,
      siteType: SITE_TYPES.SUB2API,
      providerId: "sub2api" as const,
    }
    const result = await sub2ApiSiteAnnouncementProvider.fetch(request)

    expect(result.status).toBe(SITE_ANNOUNCEMENT_STATUS.Success)
    expect(result.announcements).toHaveLength(2)
    expect(result.announcements[0]).toMatchObject({
      id: undefined,
      title: "",
      content: "Message fallback",
      createdAt: 1_715_000_000_000,
      updatedAt: Date.parse("2026-05-07T00:00:00Z"),
      readAt: undefined,
    })
    expect(result.announcements[1]).toMatchObject({
      id: "99",
      title: "Body fallback",
      content: "From body",
      createdAt: 1_715_000_000_000,
      updatedAt: 1_715_003_600_000,
      fingerprint: "99",
    })
  })

  it("returns an error result when Sub2API announcement fetch fails", async () => {
    getApiServiceMock.mockReturnValue({
      fetchSub2ApiAnnouncements: vi.fn().mockRejectedValue(new Error("denied")),
    })

    const request = {
      ...baseRequest,
      siteType: SITE_TYPES.SUB2API,
      providerId: "sub2api" as const,
    }
    const result = await sub2ApiSiteAnnouncementProvider.fetch(request)

    expect(result).toMatchObject({
      status: SITE_ANNOUNCEMENT_STATUS.Error,
      announcements: [],
      error: "denied",
    })
  })

  it("logs partial Sub2API mark-read failures without failing the whole batch", async () => {
    const markRead = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failed"))
      .mockResolvedValueOnce(true)
    getApiServiceMock.mockReturnValue({
      markSub2ApiAnnouncementRead: markRead,
    })

    const request = {
      ...baseRequest,
      siteType: SITE_TYPES.SUB2API,
      providerId: "sub2api" as const,
    }

    await expect(
      sub2ApiSiteAnnouncementProvider.markRead?.(request, [
        { id: "1" },
        { id: "2" },
      ]),
    ).resolves.toBeUndefined()
  })

  it("throws when every Sub2API mark-read request fails", async () => {
    const markRead = vi.fn().mockRejectedValue(new Error("all failed"))
    getApiServiceMock.mockReturnValue({
      markSub2ApiAnnouncementRead: markRead,
    })

    const request = {
      ...baseRequest,
      siteType: SITE_TYPES.SUB2API,
      providerId: "sub2api" as const,
    }

    await expect(
      sub2ApiSiteAnnouncementProvider.markRead?.(request, [{ id: "1" }]),
    ).rejects.toThrow("all failed")
  })

  it("skips mark-read requests when no upstream ids are available", async () => {
    const markRead = vi.fn()
    getApiServiceMock.mockReturnValue({
      markSub2ApiAnnouncementRead: markRead,
    })

    const request = {
      ...baseRequest,
      siteType: SITE_TYPES.SUB2API,
      providerId: "sub2api" as const,
    }

    await expect(
      sub2ApiSiteAnnouncementProvider.markRead?.(request, [{ title: "No id" }]),
    ).resolves.toBeUndefined()
    expect(markRead).not.toHaveBeenCalled()
  })

  it("wraps non-error full-batch mark-read failures with a safe error instance", async () => {
    const markRead = vi.fn().mockRejectedValue("bad gateway")
    getApiServiceMock.mockReturnValue({
      markSub2ApiAnnouncementRead: markRead,
    })

    const request = {
      ...baseRequest,
      siteType: SITE_TYPES.SUB2API,
      providerId: "sub2api" as const,
    }

    await expect(
      sub2ApiSiteAnnouncementProvider.markRead?.(request, [{ id: "1" }]),
    ).rejects.toThrow("bad gateway")
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
      siteType: SITE_TYPES.SUB2API,
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

  it("selects the provider implementation from the site type", () => {
    expect(getSiteAnnouncementProvider(SITE_TYPES.SUB2API)).toBe(
      sub2ApiSiteAnnouncementProvider,
    )
    expect(getSiteAnnouncementProvider(SITE_TYPES.NEW_API)).toBe(
      commonSiteAnnouncementProvider,
    )
  })
})
