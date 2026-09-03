import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { ACCOUNT_SITE_MANUAL_ADD_GUIDE_ANCHORS } from "~/services/accountSiteDefinitions"
import { getChangelogAnchorId } from "~/utils/navigation/changelogAnchor"
import {
  getDocsAutoDetectUrl,
  getDocsChangelogIndexUrl,
  getDocsChangelogUrl,
  getDocsCommunityUrl,
  getDocsGetStartedUrl,
  getDocsHomepageUrl,
  getDocsManualAddGuideUrl,
  getDocsPageUrl,
  getDocsTaskNotificationsDingtalkUrl,
  getDocsTaskNotificationsNtfyUrl,
  getGitHubPagesRawChangelogIndexUrl,
  getGitHubRawChangelogMarkdownUrl,
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

  it("builds changelog source URLs", () => {
    expect(getDocsChangelogIndexUrl()).toBe(
      getDocsPageUrl("data/changelog-index.json"),
    )
    expect(getGitHubPagesRawChangelogIndexUrl()).toBe(
      "https://raw.githubusercontent.com/qixing-jk/all-api-hub/gh-pages/data/changelog-index.json",
    )
    expect(getGitHubRawChangelogMarkdownUrl()).toBe(
      "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/docs/docs/changelog.md",
    )
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

  it("builds locale-aware manual account guide urls", () => {
    expect(getDocsManualAddGuideUrl("manual-new-api", "en")).toContain(
      "/en/add-account#manual-new-api",
    )
    expect(getDocsManualAddGuideUrl("manual-openrouter", "zh-CN")).toContain(
      "/add-account#manual-openrouter",
    )
  })

  it("keeps every registered manual-add anchor in published docs sources", () => {
    const docsSources = [
      "docs/docs/add-account.md",
      "docs/docs/en/add-account.md",
      "docs/docs/ja/add-account.md",
    ].map((relativePath) =>
      readFileSync(resolve(process.cwd(), relativePath), "utf8"),
    )

    for (const anchor of Object.values(ACCOUNT_SITE_MANUAL_ADD_GUIDE_ANCHORS)) {
      for (const source of docsSources) {
        expect(source).toContain(`<a id="${anchor}"></a>`)
      }
    }
  })
})
