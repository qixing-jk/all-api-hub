import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildSiteOptions,
  buildSiteTypeOptions,
  filterSiteAnnouncements,
  formatAnnouncementTimestamp,
  formatDateTime,
  getAnnouncementSourceUrl,
  getMetricToneClasses,
} from "~/features/SiteAnnouncements/utils"
import type { SiteAnnouncementRecord } from "~/types/siteAnnouncements"

const { formatRelativeTimeMock, joinUrlMock, getAccountSiteApiRouterMock } =
  vi.hoisted(() => ({
    formatRelativeTimeMock: vi.fn(),
    joinUrlMock: vi.fn((baseUrl: string, path: string) => `${baseUrl}${path}`),
    getAccountSiteApiRouterMock: vi.fn(() => ({
      siteAnnouncementsPath: "/dashboard",
    })),
  }))

vi.mock("~/utils/core/formatters", () => ({
  formatRelativeTime: formatRelativeTimeMock,
}))

vi.mock("~/utils/core/url", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/core/url")>()),
  joinUrl: joinUrlMock,
}))

vi.mock("~/constants/siteType", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/constants/siteType")>()),
  getAccountSiteApiRouter: getAccountSiteApiRouterMock,
}))

const record: SiteAnnouncementRecord = {
  id: "record-1",
  siteKey: "site-1",
  siteName: "Example",
  siteType: "new-api",
  baseUrl: "https://example.com",
  accountId: "account-1",
  sourceScope: "site",
  title: "Notice",
  content: "Body",
  fingerprint: "fp-1",
  firstSeenAt: Date.UTC(2026, 4, 8, 0, 0, 0),
  lastSeenAt: Date.UTC(2026, 4, 8, 0, 0, 0),
  createdAt: Date.UTC(2026, 4, 7, 12, 0, 0),
  read: false,
}

describe("SiteAnnouncements utils", () => {
  it("uses publication time independently of site identity and discovery time otherwise", () => {
    formatRelativeTimeMock.mockReturnValue("2 hours ago")
    for (const siteType of ["new-api", "laozhang", "sub2api"] as const) {
      expect(formatAnnouncementTimestamp({ ...record, siteType })).toBe(
        "2 hours ago",
      )
    }
    formatRelativeTimeMock.mockClear()
    expect(
      formatAnnouncementTimestamp({ ...record, createdAt: undefined }),
    ).toBe(formatDateTime(record.firstSeenAt))
    expect(formatRelativeTimeMock).not.toHaveBeenCalled()
  })

  it("groups independent sources into one site filter without hiding account messages", () => {
    const accountRecord = {
      ...record,
      id: "message",
      siteKey: "account:site",
      sourceScope: "account" as const,
    }
    const options = buildSiteOptions([record, accountRecord], [])
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({
      value: record.siteKey,
      announcementCount: 2,
      sourceKeys: [record.siteKey, "account:site"],
    })
    expect(
      filterSiteAnnouncements([record, accountRecord], {
        siteKey: record.siteKey,
        siteKeys: options[0]!.sourceKeys,
        siteType: "all",
        unreadFilter: "all",
      }),
    ).toHaveLength(2)
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("formats timestamps and falls back when the value is missing", () => {
    expect(formatDateTime()).toBe("-")
    expect(formatAnnouncementTimestamp(record)).not.toBe("-")
  })

  it("falls back to absolute publication time when relative formatting is unavailable", () => {
    formatRelativeTimeMock
      .mockReturnValueOnce("2 hours ago")
      .mockReturnValueOnce("")

    const sub2Record: SiteAnnouncementRecord = {
      ...record,
      siteType: "sub2api",
    }
    expect(formatAnnouncementTimestamp(sub2Record)).toBe("2 hours ago")
    expect(formatAnnouncementTimestamp(sub2Record)).toBe(
      formatDateTime(sub2Record.createdAt),
    )
  })

  it("builds source urls and stable site/type filter options", () => {
    expect(getAnnouncementSourceUrl(record)).toBe(
      "https://example.com/dashboard",
    )
    expect(getAccountSiteApiRouterMock).toHaveBeenCalledWith("new-api")
    expect(joinUrlMock).toHaveBeenCalledWith(
      "https://example.com",
      "/dashboard",
    )

    expect(
      buildSiteOptions(
        [
          record,
          {
            ...record,
            id: "record-2",
            siteKey: "site-2",
            siteName: "Beta",
            baseUrl: "https://beta.example.com",
            siteType: "sub2api",
            sourceScope: "account",
            fingerprint: "fp-2",
          },
          {
            ...record,
            id: "record-3",
            siteKey: "site-2",
            siteName: "",
            baseUrl: "https://beta.example.com",
            siteType: "sub2api",
            sourceScope: "account",
            fingerprint: "fp-3",
          },
        ],
        [
          {
            siteKey: "site-3",
            siteName: "Gamma",
            baseUrl: "https://gamma.example.com",
          },
        ],
      ),
    ).toEqual([
      {
        value: "site-2",
        label: "Beta",
        announcementCount: 2,
      },
      { value: "site-1", label: "Example", announcementCount: 1 },
      { value: "site-3", label: "Gamma", announcementCount: 0 },
    ])
    expect(
      buildSiteTypeOptions([
        record,
        { ...record, id: "record-2", siteType: "sub2api", fingerprint: "fp-2" },
      ]),
    ).toEqual(["new-api", "sub2api"])
  })

  it("filters announcements by site, site type, and read state", () => {
    const secondRecord: SiteAnnouncementRecord = {
      ...record,
      id: "record-2",
      siteKey: "site-2",
      siteType: "sub2api",
      sourceScope: "account",
      fingerprint: "fp-2",
      read: true,
    }

    expect(
      filterSiteAnnouncements([record, secondRecord], {
        siteKey: "all",
        siteType: "all",
        unreadFilter: "all",
      }),
    ).toEqual([record, secondRecord])
    expect(
      filterSiteAnnouncements([record, secondRecord], {
        siteKey: "site-1",
        siteType: "new-api",
        unreadFilter: "unread",
      }),
    ).toEqual([record])
    expect(
      filterSiteAnnouncements([record, secondRecord], {
        siteKey: "site-1",
        siteType: "all",
        unreadFilter: "all",
      }),
    ).toEqual([record])
    expect(
      filterSiteAnnouncements([record, secondRecord], {
        siteKey: "all",
        siteType: "sub2api",
        unreadFilter: "all",
      }),
    ).toEqual([secondRecord])
    expect(
      filterSiteAnnouncements([record, secondRecord], {
        siteKey: "all",
        siteType: "all",
        unreadFilter: "unread",
      }),
    ).toEqual([record])
    expect(
      filterSiteAnnouncements([record, secondRecord], {
        siteKey: "all",
        siteType: "all",
        unreadFilter: "read",
      }),
    ).toEqual([secondRecord])
  })

  it("returns tone classes for each metric color", () => {
    expect(getMetricToneClasses("accent")).toContain("bg-primary-soft")
    expect(getMetricToneClasses("info")).toContain("bg-info-soft")
    expect(getMetricToneClasses("neutral")).toContain("bg-muted")
    expect(getMetricToneClasses("unknown" as any)).toEqual(
      getMetricToneClasses(undefined as any),
    )
  })
})
