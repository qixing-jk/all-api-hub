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

const { getSiteTypeCapabilitiesMock } = vi.hoisted(() => ({
  getSiteTypeCapabilitiesMock: vi.fn(),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: getSiteTypeCapabilitiesMock,
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

const createNoticeAdapter = (fetch = vi.fn().mockResolvedValue(null)) => ({
  siteType: SITE_TYPES.NEW_API,
  family: "newApiFamily" as const,
  site: {
    notice: {
      fetch,
    },
  },
})

const createCommonAdapter = (overrides?: {
  notice?: ReturnType<typeof vi.fn>
  announcements?: ReturnType<typeof vi.fn>
}) => ({
  siteType: SITE_TYPES.NEW_API,
  family: "newApiFamily" as const,
  site: {
    notice: {
      fetch: overrides?.notice ?? vi.fn().mockResolvedValue(null),
    },
    announcements: {
      fetch: overrides?.announcements ?? vi.fn().mockResolvedValue([]),
    },
  },
})

const createSub2ApiAdapter = (overrides?: {
  fetch?: ReturnType<typeof vi.fn>
  markRead?: ReturnType<typeof vi.fn>
}) => ({
  siteType: SITE_TYPES.SUB2API,
  family: "sub2api" as const,
  account: {
    announcements: {
      fetch: overrides?.fetch ?? vi.fn().mockResolvedValue([]),
      markRead: overrides?.markRead ?? vi.fn().mockResolvedValue(true),
    },
  },
})

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
    getSiteTypeCapabilitiesMock.mockReturnValueOnce(
      createNoticeAdapter(
        vi.fn().mockResolvedValue(" **Hello** <b>world</b> "),
      ),
    )

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
    getSiteTypeCapabilitiesMock.mockReturnValueOnce(
      createNoticeAdapter(vi.fn().mockResolvedValue("   ")),
    )

    const result = await commonSiteAnnouncementProvider.fetch(baseRequest)

    expect(result).toMatchObject({
      status: SITE_ANNOUNCEMENT_STATUS.Success,
      announcements: [],
    })
  })

  it("normalizes New API structured announcements alongside site notices", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValueOnce(
      createCommonAdapter({
        notice: vi.fn().mockResolvedValue(" Site notice "),
        announcements: vi.fn().mockResolvedValue([
          {
            id: 7,
            content: " Maintenance ",
            publishDate: "2026-07-01T12:00:00Z",
            type: "warning",
            extra: " Brief interruption ",
          },
          {
            content: "",
            publishDate: "2026-07-02T12:00:00Z",
            type: "success",
          },
        ]),
      }),
    )

    const result = await commonSiteAnnouncementProvider.fetch(baseRequest)

    expect(result.status).toBe(SITE_ANNOUNCEMENT_STATUS.Success)
    expect(result.announcements).toEqual([
      {
        content: "Maintenance\n\nBrief interruption",
        createdAt: Date.parse("2026-07-01T12:00:00Z"),
        id: "7",
        fingerprint:
          "1:7|7:warning|20:2026-07-01T12:00:00Z|11:Maintenance|18:Brief interruption",
      },
      {
        content: "Site notice",
        fingerprint: "11:Site notice",
      },
    ])
  })

  it("keeps structured announcements when the site notice fetch fails", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValueOnce(
      createCommonAdapter({
        notice: vi.fn().mockRejectedValue(new Error("notice unavailable")),
        announcements: vi.fn().mockResolvedValue([
          {
            content: "Structured",
            publishDate: "2026-07-01T12:00:00Z",
          },
        ]),
      }),
    )

    const result = await commonSiteAnnouncementProvider.fetch(baseRequest)

    expect(result).toMatchObject({
      status: SITE_ANNOUNCEMENT_STATUS.Success,
      announcements: [
        {
          content: "Structured",
          createdAt: Date.parse("2026-07-01T12:00:00Z"),
          fingerprint: "0:|0:|20:2026-07-01T12:00:00Z|10:Structured|0:",
        },
      ],
    })
  })

  it("marks common provider failures as unsupported with the upstream error text", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValueOnce(
      createNoticeAdapter(
        vi.fn().mockRejectedValue(new Error("not supported")),
      ),
    )

    const result = await commonSiteAnnouncementProvider.fetch(baseRequest)

    expect(result).toMatchObject({
      status: SITE_ANNOUNCEMENT_STATUS.Unsupported,
      announcements: [],
      error: "not supported",
    })
  })

  it("marks common provider missing site announcement capabilities as unsupported", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
      siteType: SITE_TYPES.AIHUBMIX,
    })

    const result = await commonSiteAnnouncementProvider.fetch({
      ...baseRequest,
      siteType: SITE_TYPES.AIHUBMIX,
    })

    expect(result).toMatchObject({
      status: SITE_ANNOUNCEMENT_STATUS.Unsupported,
      announcements: [],
      error: "site announcement capabilities are not implemented for AIHubMix",
    })
  })

  it("normalizes Sub2API unread announcement lists and marks ids as read", async () => {
    const markRead = vi.fn().mockResolvedValue(true)
    const fetch = vi.fn().mockResolvedValue([
      {
        id: 12,
        title: "Deploy",
        content: "Maintenance",
        created_at: "2026-05-07T00:00:00Z",
        read_at: "2026-05-07T01:00:00Z",
      },
    ])
    getSiteTypeCapabilitiesMock.mockReturnValue(
      createSub2ApiAdapter({ fetch, markRead }),
    )

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

    expect(fetch).toHaveBeenCalledWith(request.apiRequest, { unreadOnly: true })
    expect(markRead).toHaveBeenCalledWith({
      request: request.apiRequest,
      id: "12",
    })
  })

  it("normalizes Sub2API announcements from body/message fallbacks and mixed timestamp formats", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValue(
      createSub2ApiAdapter({
        fetch: vi.fn().mockResolvedValue([
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
      }),
    )

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
    getSiteTypeCapabilitiesMock.mockReturnValue(
      createSub2ApiAdapter({
        fetch: vi.fn().mockRejectedValue(new Error("denied")),
      }),
    )

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

  it("returns an error result when Sub2API siteAnnouncements capability is missing", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.SUB2API,
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
      error: "siteAnnouncements is not implemented for sub2api",
    })
  })

  it("logs partial Sub2API mark-read failures without failing the whole batch", async () => {
    const markRead = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failed"))
      .mockResolvedValueOnce(true)
    getSiteTypeCapabilitiesMock.mockReturnValue(
      createSub2ApiAdapter({ markRead }),
    )

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
    expect(markRead).toHaveBeenCalledWith({
      request: request.apiRequest,
      id: "1",
    })
  })

  it("throws when every Sub2API mark-read request fails", async () => {
    const markRead = vi.fn().mockRejectedValue(new Error("all failed"))
    getSiteTypeCapabilitiesMock.mockReturnValue(
      createSub2ApiAdapter({ markRead }),
    )

    const request = {
      ...baseRequest,
      siteType: SITE_TYPES.SUB2API,
      providerId: "sub2api" as const,
    }

    await expect(
      sub2ApiSiteAnnouncementProvider.markRead?.(request, [{ id: "1" }]),
    ).rejects.toThrow("all failed")
    expect(markRead).toHaveBeenCalledWith({
      request: request.apiRequest,
      id: "1",
    })
  })

  it("skips mark-read requests when no upstream ids are available", async () => {
    const markRead = vi.fn()
    getSiteTypeCapabilitiesMock.mockReturnValue(
      createSub2ApiAdapter({ markRead }),
    )

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
    getSiteTypeCapabilitiesMock.mockReturnValue(
      createSub2ApiAdapter({ markRead }),
    )

    const request = {
      ...baseRequest,
      siteType: SITE_TYPES.SUB2API,
      providerId: "sub2api" as const,
    }

    await expect(
      sub2ApiSiteAnnouncementProvider.markRead?.(request, [{ id: "1" }]),
    ).rejects.toThrow("bad gateway")
    expect(markRead).toHaveBeenCalledWith({
      request: request.apiRequest,
      id: "1",
    })
  })

  it("keeps Sub2API title-only announcements title-only", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValue(
      createSub2ApiAdapter({
        fetch: vi.fn().mockResolvedValue([
          {
            id: 13,
            title: "Title only",
            content: "",
          },
        ]),
      }),
    )

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
