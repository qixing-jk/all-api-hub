import { describe, expect, it } from "vitest"

import {
  normalizeProductAnnouncementFeed,
  selectProductAnnouncementView,
} from "~/services/productAnnouncements/catalog"
import {
  PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION,
  PRODUCT_ANNOUNCEMENT_SEVERITIES,
} from "~/services/productAnnouncements/constants"

const now = Date.parse("2026-06-06T12:00:00.000Z")
const baseFeed = {
  schemaVersion: PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION,
  defaultLocale: "zh-CN",
  announcements: [
    {
      id: "critical-risk",
      revision: 1,
      severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Critical,
      priority: 100,
      affectedVersions: ">=3.44.0 <3.44.1",
      startsAt: "2026-06-06T00:00:00.000Z",
      expiresAt: "2026-06-20T00:00:00.000Z",
      content: {
        "zh-CN": {
          title: "关键风险",
          message: "请升级到 3.44.1。",
          cta: {
            label: "查看修复说明",
            url: "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.44.1",
          },
        },
        en: {
          title: "Critical risk",
          message: "Update to 3.44.1.",
        },
      },
    },
    {
      id: "info-note",
      revision: 1,
      severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Info,
      priority: 1,
      affectedVersions: "*",
      startsAt: "2026-06-01T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
      content: {
        en: {
          title: "FYI",
          message: "Informational note.",
        },
      },
    },
    {
      id: "future-risk",
      revision: 1,
      severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Critical,
      priority: 500,
      affectedVersions: ">=9.0.0 <10.0.0",
      startsAt: "2026-06-01T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
      content: {
        "zh-CN": {
          title: "未来版本风险",
          message: "仅影响未来版本。",
        },
      },
    },
  ],
}

describe("product announcement feed normalization", () => {
  it("returns an unsupported schema error for incompatible feeds", () => {
    expect(
      normalizeProductAnnouncementFeed(
        {
          ...baseFeed,
          schemaVersion: 999,
        },
        {
          currentVersion: "3.44.0",
          locale: "zh-CN",
          now,
          dismissed: {},
          seenAt: {},
        },
      ),
    ).toEqual({ notices: [], errors: ["unsupported_schema"] })
  })

  it("treats missing, invalid, or non-array announcements as empty", () => {
    const feeds = [
      {
        schemaVersion: PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION,
        defaultLocale: "zh-CN",
      },
      {
        schemaVersion: PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION,
        defaultLocale: "zh-CN",
        announcements: null,
      },
      {
        schemaVersion: PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION,
        defaultLocale: "zh-CN",
        announcements: { id: "not-an-array" },
      },
    ]

    for (const feed of feeds) {
      expect(
        normalizeProductAnnouncementFeed(feed, {
          currentVersion: "3.44.0",
          locale: "zh-CN",
          now,
          dismissed: {},
          seenAt: {},
        }),
      ).toEqual({ notices: [], errors: [] })
    }
  })

  it("uses the built-in default locale when the feed default is blank", () => {
    const normalized = normalizeProductAnnouncementFeed(
      {
        ...baseFeed,
        defaultLocale: "   ",
      },
      {
        currentVersion: "3.44.0",
        locale: "zh-TW",
        now,
        dismissed: {},
        seenAt: {},
      },
    )

    expect(normalized.notices[0]).toMatchObject({
      id: "critical-risk",
      title: "关键风险",
    })
  })

  it("rejects announcements with invalid severity, version range, or content shape", () => {
    const feed = {
      ...baseFeed,
      announcements: [
        {
          id: "invalid-severity",
          revision: 1,
          severity: "notice",
          priority: 1,
          affectedVersions: "*",
          startsAt: "2026-06-01T00:00:00.000Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: {
            "zh-CN": {
              title: "无效级别",
              message: "不应展示。",
            },
          },
        },
        {
          id: "invalid-version-range",
          revision: 1,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Info,
          priority: 1,
          affectedVersions: 3,
          startsAt: "2026-06-01T00:00:00.000Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: {
            "zh-CN": {
              title: "无效版本范围",
              message: "不应展示。",
            },
          },
        },
        {
          id: "invalid-content",
          revision: 1,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Info,
          priority: 1,
          affectedVersions: "*",
          startsAt: "2026-06-01T00:00:00.000Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: "zh-CN",
        },
      ],
    }

    const normalized = normalizeProductAnnouncementFeed(feed, {
      currentVersion: "3.44.0",
      locale: "zh-CN",
      now,
      dismissed: {},
      seenAt: {},
    })

    expect(normalized).toEqual({ notices: [], errors: [] })
  })

  it("filters by version and resolves localized content with fallback", () => {
    const normalized = normalizeProductAnnouncementFeed(baseFeed, {
      currentVersion: "3.44.0",
      locale: "zh-TW",
      now,
      dismissed: {},
      seenAt: {},
    })

    expect(normalized.errors).toEqual([])
    expect(normalized.notices.map((notice) => notice.id)).toEqual([
      "critical-risk",
      "info-note",
    ])
    expect(normalized.notices.map((notice) => notice.id)).not.toContain(
      "future-risk",
    )
    expect(normalized.notices[0]).toMatchObject({
      title: "关键风险",
      message: "请升级到 3.44.1。",
      cta: {
        label: "查看修复说明",
        url: "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.44.1",
      },
      seen: false,
      dismissed: false,
    })
    expect(normalized.notices[1]).toMatchObject({
      title: "FYI",
      message: "Informational note.",
    })
  })

  it("excludes expired and not-yet-started notices", () => {
    const feed = {
      ...baseFeed,
      announcements: [
        {
          id: "active-window",
          revision: 1,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Info,
          priority: 1,
          affectedVersions: "*",
          startsAt: "2026-06-01T00:00:00.000Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: {
            "zh-CN": {
              title: "有效公告",
              message: "仍在展示窗口内。",
            },
          },
        },
        {
          id: "expired",
          revision: 1,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Critical,
          priority: 100,
          affectedVersions: "*",
          startsAt: "2026-06-01T00:00:00.000Z",
          expiresAt: "2026-06-06T12:00:00.000Z",
          content: {
            "zh-CN": {
              title: "已过期",
              message: "不应展示。",
            },
          },
        },
        {
          id: "not-yet-started",
          revision: 1,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Critical,
          priority: 100,
          affectedVersions: "*",
          startsAt: "2026-06-06T12:00:00.001Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: {
            "zh-CN": {
              title: "尚未开始",
              message: "不应展示。",
            },
          },
        },
      ],
    }

    const normalized = normalizeProductAnnouncementFeed(feed, {
      currentVersion: "3.44.0",
      locale: "zh-CN",
      now,
      dismissed: {},
      seenAt: {},
    })

    expect(normalized.notices.map((notice) => notice.id)).toEqual([
      "active-window",
    ])
  })

  it("excludes notices without valid localized content", () => {
    const feed = {
      ...baseFeed,
      announcements: [
        {
          id: "missing-title",
          revision: 1,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Info,
          priority: 1,
          affectedVersions: "*",
          startsAt: "2026-06-01T00:00:00.000Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: {
            "zh-CN": {
              title: "   ",
              message: "缺少有效标题。",
            },
          },
        },
        {
          id: "missing-message",
          revision: 1,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Info,
          priority: 1,
          affectedVersions: "*",
          startsAt: "2026-06-01T00:00:00.000Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: {
            "zh-CN": {
              title: "缺少有效内容",
              message: "",
            },
          },
        },
      ],
    }

    const normalized = normalizeProductAnnouncementFeed(feed, {
      currentVersion: "3.44.0",
      locale: "zh-CN",
      now,
      dismissed: {},
      seenAt: {},
    })

    expect(normalized).toMatchObject({ notices: [], errors: [] })
  })

  it("drops unsafe CTAs while keeping otherwise valid notices", () => {
    const feed = {
      ...baseFeed,
      announcements: [
        {
          id: "unsafe-cta",
          revision: 1,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Info,
          priority: 1,
          affectedVersions: "*",
          startsAt: "2026-06-01T00:00:00.000Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: {
            "zh-CN": {
              title: "链接公告",
              message: "正文有效。",
              cta: {
                label: "打开外部链接",
                url: "https://evil.example.test/path",
              },
            },
          },
        },
      ],
    }

    const normalized = normalizeProductAnnouncementFeed(feed, {
      currentVersion: "3.44.0",
      locale: "zh-CN",
      now,
      dismissed: {},
      seenAt: {},
    })

    expect(normalized.notices).toHaveLength(1)
    expect(normalized.notices[0]).toMatchObject({
      id: "unsafe-cta",
      title: "链接公告",
      message: "正文有效。",
    })
    expect(normalized.notices[0]?.cta).toBeUndefined()
  })

  it("keeps dismissed notices in the list while excluding them from active selectors", () => {
    const normalized = normalizeProductAnnouncementFeed(baseFeed, {
      currentVersion: "3.44.0",
      locale: "zh-CN",
      now,
      dismissed: { "critical-risk": 1 },
      seenAt: { "critical-risk": now - 1000 },
    })
    const view = selectProductAnnouncementView(normalized.notices)

    expect(
      normalized.notices.find((item) => item.id === "critical-risk"),
    ).toMatchObject({
      dismissed: true,
      seen: true,
    })
    expect(view.activeNotices.map((notice) => notice.id)).toEqual(["info-note"])
    expect(view.dismissedNotices.map((notice) => notice.id)).toEqual([
      "critical-risk",
    ])
    expect(view.activeRiskCount).toBe(0)
    expect(view.unseenActiveCount).toBe(1)
    expect(view.primaryRiskNotice).toBeNull()
  })

  it("resurfaces higher revisions and sorts active notices by severity and tie breakers", () => {
    const feed = {
      ...baseFeed,
      announcements: [
        ...(baseFeed.announcements as any[]),
        {
          id: "warning-priority-top",
          revision: 1,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Warning,
          priority: 300,
          affectedVersions: "*",
          startsAt: "2026-06-02T00:00:00.000Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: {
            "zh-CN": { title: "高优先级警告", message: "请优先处理。" },
          },
        },
        {
          id: "warning-newer-start",
          revision: 1,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Warning,
          priority: 200,
          affectedVersions: "*",
          startsAt: "2026-06-06T01:00:00.000Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: {
            "zh-CN": { title: "较新的警告", message: "请注意。" },
          },
        },
        {
          id: "warning",
          revision: 2,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Warning,
          priority: 200,
          affectedVersions: "*",
          startsAt: "2026-06-05T00:00:00.000Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: {
            "zh-CN": { title: "警告", message: "请注意。" },
          },
        },
        {
          id: "warning-alpha",
          revision: 1,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Warning,
          priority: 150,
          affectedVersions: "*",
          startsAt: "2026-06-04T00:00:00.000Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: {
            "zh-CN": { title: "A 警告", message: "请注意。" },
          },
        },
        {
          id: "warning-beta",
          revision: 1,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Warning,
          priority: 150,
          affectedVersions: "*",
          startsAt: "2026-06-04T00:00:00.000Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: {
            "zh-CN": { title: "B 警告", message: "请注意。" },
          },
        },
      ],
    }

    const normalized = normalizeProductAnnouncementFeed(feed, {
      currentVersion: "3.44.0",
      locale: "zh-CN",
      now,
      dismissed: { warning: 1 },
      seenAt: {},
    })
    const view = selectProductAnnouncementView(normalized.notices)

    expect(view.activeNotices.map((notice) => notice.id)).toEqual([
      "critical-risk",
      "warning-priority-top",
      "warning-newer-start",
      "warning",
      "warning-alpha",
      "warning-beta",
      "info-note",
    ])
    expect(view.primaryRiskNotice?.id).toBe("critical-risk")
    expect(view.activeRiskCount).toBe(6)
  })
})
