import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildSiteOptions,
  buildSiteTypeOptions,
  filterSiteAnnouncements,
  formatAnnouncementTimestamp,
  formatDateTime,
  formatSub2ApiRelativeTimestamp,
  getAnnouncementSourceUrl,
  getMetricToneClasses,
  isSub2ApiAnnouncement,
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

vi.mock("~/utils/core/url", () => ({
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
  providerId: "common",
  title: "Notice",
  content: "Body",
  fingerprint: "fp-1",
  firstSeenAt: Date.UTC(2026, 4, 8, 0, 0, 0),
  lastSeenAt: Date.UTC(2026, 4, 8, 0, 0, 0),
  createdAt: Date.UTC(2026, 4, 7, 12, 0, 0),
  read: false,
}

describe("SiteAnnouncements utils", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("formats timestamps and falls back when the value is missing", () => {
    expect(formatDateTime()).toBe("-")
    expect(formatAnnouncementTimestamp(record)).not.toBe("-")
  })

  it("prefers relative timestamps for Sub2API announcements and falls back to absolute time", () => {
    formatRelativeTimeMock
      .mockReturnValueOnce("2 hours ago")
      .mockReturnValueOnce("")

    const sub2Record: SiteAnnouncementRecord = {
      ...record,
      siteType: "sub2api",
    }
    expect(formatSub2ApiRelativeTimestamp(sub2Record)).toBe("2 hours ago")
    expect(formatSub2ApiRelativeTimestamp(sub2Record)).toBe(
      formatAnnouncementTimestamp(sub2Record),
    )
  })

  it("detects Sub2API announcements from site type or provider id", () => {
    expect(isSub2ApiAnnouncement({ ...record, siteType: "sub2api" })).toBe(true)
    expect(isSub2ApiAnnouncement({ ...record, providerId: "sub2api" })).toBe(
      true,
    )
    expect(isSub2ApiAnnouncement(record)).toBe(false)
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
            siteName: "",
            baseUrl: "https://beta.example.com",
            siteType: "sub2api",
            providerId: "sub2api",
            fingerprint: "fp-2",
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
      ["site-3", "Gamma"],
      ["site-1", "Example"],
      ["site-2", "https://beta.example.com"],
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
      providerId: "sub2api",
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
    expect(getMetricToneClasses("blue")).toContain("bg-blue-50")
    expect(getMetricToneClasses("amber")).toContain("bg-amber-50")
    expect(getMetricToneClasses("emerald")).toContain("bg-emerald-50")
    expect(getMetricToneClasses("unknown" as any)).toEqual(
      getMetricToneClasses(undefined as any),
    )
  })
})
