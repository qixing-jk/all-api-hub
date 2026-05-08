import { describe, expect, it, vi } from "vitest"

import {
  buildAnnouncementDisplayText,
  buildAnnouncementShortTitle,
  buildAnnouncementTitle,
  fingerprintAnnouncement,
  getAnnouncementPreviewText,
  summarizeAnnouncement,
} from "~/services/siteAnnouncements/text"

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string) => key),
}))

describe("site announcement text helpers", () => {
  it("uses explicit titles without removing the title text from content", () => {
    expect(
      buildAnnouncementDisplayText({
        title: "Maintenance",
        content: "Window starts at 01:00 UTC",
      }),
    ).toEqual({
      title: "Maintenance",
      body: "Window starts at 01:00 UTC",
      preview: "Window starts at 01:00 UTC",
    })
  })

  it("keeps display titles complete and shortens them only for short-title callers", () => {
    const longTitle = "A".repeat(120)

    expect(buildAnnouncementDisplayText({ title: longTitle }).title).toBe(
      longTitle,
    )
    expect(buildAnnouncementShortTitle({ title: longTitle }, 10)).toBe(
      "AAAAAAAAA…",
    )
  })

  it("derives a title from the first meaningful markdown line and previews the remaining body", () => {
    expect(
      buildAnnouncementDisplayText({
        content:
          "\n# Maintenance window\n\n- Starts at 01:00 UTC\n- Ends at 02:00 UTC",
      }),
    ).toEqual({
      title: "Maintenance window",
      body: "# Maintenance window\n\n- Starts at 01:00 UTC\n- Ends at 02:00 UTC",
      preview: "Maintenance window Starts at 01:00 UTC Ends at 02:00 UTC",
    })
  })

  it("ignores HTML tag attributes when deriving a title from styled content", () => {
    expect(
      buildAnnouncementDisplayText({
        content:
          '<center style="font-size: 18px; color: red;">Maintenance window</center><p>Starts at 01:00 UTC.</p>',
      }),
    ).toEqual({
      title: "Maintenance window",
      body: '<center style="font-size: 18px; color: red;">Maintenance window</center><p>Starts at 01:00 UTC.</p>',
      preview: "Maintenance window Starts at 01:00 UTC.",
    })
  })

  it("derives a plain text leading topic without removing it from the body", () => {
    expect(
      buildAnnouncementDisplayText({
        content:
          "维护通知：今晚 1 点开始维护，期间服务可能不可用。请提前保存数据。",
      }),
    ).toEqual({
      title: "维护通知",
      body: "维护通知：今晚 1 点开始维护，期间服务可能不可用。请提前保存数据。",
      preview:
        "维护通知：今晚 1 点开始维护，期间服务可能不可用。请提前保存数据。",
    })
  })

  it("uses sentence punctuation as a plain text title boundary", () => {
    expect(
      buildAnnouncementDisplayText({
        content:
          "Maintenance starts at 01:00 UTC. The API will be unavailable.",
      }),
    ).toEqual({
      title: "Maintenance starts at 01:00 UTC",
      body: "Maintenance starts at 01:00 UTC. The API will be unavailable.",
      preview: "Maintenance starts at 01:00 UTC. The API will be unavailable.",
    })
  })

  it("keeps single-line content as the title without duplicating it into preview", () => {
    expect(
      buildAnnouncementDisplayText({
        content: "Single line announcement",
      }),
    ).toEqual({
      title: "Single line announcement",
      body: "Single line announcement",
      preview: "Single line announcement",
    })
  })

  it("falls back to localized title when no readable title or body exists", () => {
    expect(buildAnnouncementTitle({ content: "   " })).toBe(
      "siteAnnouncements:title",
    )
  })

  it("summarizes formatted content as plain text", () => {
    expect(
      summarizeAnnouncement("## [Release](https://example.com) **ready**", 80),
    ).toBe("Release ready")
    expect(getAnnouncementPreviewText("<b>Hello&nbsp;world</b>", 80)).toBe(
      "Hello world",
    )
  })

  it("decodes supported html entities and truncates long plain-text summaries", () => {
    expect(summarizeAnnouncement("&amp; &lt; &gt; &quot;", 80)).toBe('& < > "')
    expect(summarizeAnnouncement("A".repeat(10), 5)).toBe("AAAA…")
  })

  it("does not split inferred titles on time or url colons before a real delimiter", () => {
    expect(
      buildAnnouncementDisplayText({
        content: "Maintenance starts at 01:00: API unavailable afterwards.",
      }).title,
    ).toBe("Maintenance starts at 01:00")
    expect(
      buildAnnouncementDisplayText({
        content: "Read https://example.com:8443: maintenance tonight.",
      }).title,
    ).toBe("Read https://example.com")
  })

  it("falls back cleanly when content only contains formatting and explicit titles have no body", () => {
    expect(
      buildAnnouncementDisplayText({
        title: "Title only",
      }),
    ).toEqual({
      title: "Title only",
      body: "Title only",
      preview: "",
    })
    expect(
      buildAnnouncementDisplayText({
        content: "\n\n***\n&nbsp;",
      }),
    ).toEqual({
      title: "siteAnnouncements:title",
      body: "***\n&nbsp;",
      preview: "",
    })
  })

  it("uses length-prefixed fingerprint parts to avoid delimiter collisions", () => {
    expect(fingerprintAnnouncement(["alpha|beta", "gamma"])).not.toBe(
      fingerprintAnnouncement(["alpha", "beta|gamma"]),
    )
  })
})
