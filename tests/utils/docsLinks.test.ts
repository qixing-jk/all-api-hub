import { describe, expect, it } from "vitest"

import { getChangelogAnchorId } from "~/utils/navigation/changelogAnchor"
import {
  getDocsAutoDetectUrl,
  getDocsChangelogUrl,
  getDocsCommunityUrl,
  getDocsGetStartedUrl,
  getDocsHomepageUrl,
  getDocsPageUrl,
  getDocsTaskNotificationsDingtalkUrl,
  getDocsTaskNotificationsNtfyUrl,
} from "~/utils/navigation/docsLinks"
import { getDocsLocalePath } from "~/utils/navigation/docsLocale"
import { getHomepage } from "~/utils/navigation/packageMeta"

describe("docsLinks", () => {
  it("builds a stable changelog anchor id from version", () => {
    expect(getChangelogAnchorId("2.39.0")).toBe("_2-39-0")
    expect(getChangelogAnchorId("v2.39.0")).toBe("_2-39-0")
  })

  it("builds changelog url with version anchor", () => {
    const url = getDocsChangelogUrl("2.39.0")
    expect(url.startsWith(getHomepage())).toBe(true)
    expect(url).toContain("changelog.html#_2-39-0")
  })

  it("builds changelog url without an anchor when no version is provided", () => {
    expect(getDocsChangelogUrl()).toBe(getDocsPageUrl("changelog.html"))
  })

  it("maps extension language to docs locale path", () => {
    expect(getDocsLocalePath("en")).toBe("en/")
    expect(getDocsLocalePath("en-US")).toBe("en/")
    expect(getDocsLocalePath("ja")).toBe("ja/")
    expect(getDocsLocalePath("ja-JP")).toBe("ja/")
    expect(getDocsLocalePath("zh_CN")).toBe("")
    expect(getDocsLocalePath("zh-CN")).toBe("")
    expect(getDocsLocalePath("zh-SG")).toBe("")
    expect(getDocsLocalePath("zh-Hant-TW")).toBe("")
    expect(getDocsLocalePath("fr-FR")).toBe("en/")
  })

  it("builds locale-aware docs page urls", () => {
    expect(getDocsPageUrl("faq.html", "en")).toContain("/en/faq.html")
    expect(getDocsPageUrl("faq.html", "ja")).toContain("/ja/faq.html")
    expect(getDocsPageUrl("faq.html", "zh-CN")).toContain("/faq.html")
    expect(getDocsPageUrl("faq.html", "zh_CN")).toBe(
      getDocsPageUrl("faq.html", "zh-CN"),
    )
    expect(getDocsPageUrl("faq.html", "fr-FR")).toContain("/en/faq.html")
  })

  it("exposes semantic docs entrypoint helpers for homepage and getting started", () => {
    expect(getDocsHomepageUrl("en")).toBe(getHomepage("en"))
    expect(getDocsGetStartedUrl("ja")).toContain("/ja/get-started")
    expect(getDocsAutoDetectUrl("en")).toContain("/en/auto-detect")
  })

  it("builds a community url on the localized docs homepage", () => {
    const url = getDocsCommunityUrl("ja")

    expect(url).toContain("/ja/")
    expect(url.endsWith("#community")).toBe(true)
  })

  it("builds channel-specific task notification docs urls", () => {
    const url = getDocsTaskNotificationsDingtalkUrl("en")
    const ntfyUrl = getDocsTaskNotificationsNtfyUrl("en")

    expect(url).toContain("/en/task-notifications")
    expect(url.endsWith("#dingtalk")).toBe(true)
    expect(ntfyUrl).toContain("/en/task-notifications")
    expect(ntfyUrl.endsWith("#ntfy")).toBe(true)
  })
})
