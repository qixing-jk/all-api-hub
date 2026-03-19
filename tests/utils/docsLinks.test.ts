import { describe, expect, it } from "vitest"

import { getChangelogAnchorId } from "~/utils/navigation/changelogAnchor"
import {
  getDocsChangelogUrl,
  getDocsPageUrl,
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
})
