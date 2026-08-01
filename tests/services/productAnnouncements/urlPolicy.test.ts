import { describe, expect, it } from "vitest"

import { sanitizeProductAnnouncementCta } from "~/services/productAnnouncements/urlPolicy"

describe("product announcement CTA URL policy", () => {
  it("keeps project-owned and GitHub release links", () => {
    expect(
      sanitizeProductAnnouncementCta({
        label: "View release",
        url: "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.44.1",
      }),
    ).toEqual({
      kind: "external",
      label: "View release",
      url: "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.44.1",
    })

    expect(
      sanitizeProductAnnouncementCta({
        kind: "external",
        label: "Read docs",
        url: "https://all-api-hub.qixing1217.top/changelog.html",
      }),
    ).toEqual({
      kind: "external",
      label: "Read docs",
      url: "https://all-api-hub.qixing1217.top/changelog.html",
    })
  })

  it("keeps extension-relative links without exposing a runtime-specific origin", () => {
    expect(
      sanitizeProductAnnouncementCta({
        kind: "extension",
        label: "Open settings",
        url: " /options.html?tab=refresh&anchor=shield-method#basic ",
      }),
    ).toEqual({
      kind: "extension",
      label: "Open settings",
      url: "options.html?tab=refresh&anchor=shield-method#basic",
    })
  })

  it("drops extension links that escape to another URL scheme or origin", () => {
    for (const url of [
      "https://all-api-hub.qixing1217.top/options.html",
      "javascript:alert(1)",
      "//example.invalid/options.html",
      "\\\\example.invalid/options.html",
      "/\\example.invalid/options.html",
      "/\\[",
    ]) {
      expect(
        sanitizeProductAnnouncementCta({
          kind: "extension",
          label: "Open extension page",
          url,
        }),
      ).toBeNull()
    }
  })

  it("drops CTAs with unknown explicit kinds", () => {
    expect(
      sanitizeProductAnnouncementCta({
        kind: "command",
        label: "Run",
        url: "https://github.com/qixing-jk/all-api-hub/releases",
      }),
    ).toBeNull()
  })

  it("drops unsafe or incomplete links", () => {
    expect(
      sanitizeProductAnnouncementCta({
        label: "Run",
        url: "javascript:alert(1)",
      }),
    ).toBeNull()
    expect(
      sanitizeProductAnnouncementCta({
        label: "External",
        url: "https://evil.example.test/path",
      }),
    ).toBeNull()
    expect(
      sanitizeProductAnnouncementCta({
        label: "",
        url: "https://github.com/qixing-jk/all-api-hub",
      }),
    ).toBeNull()
    expect(
      sanitizeProductAnnouncementCta({
        label: "Broken",
        url: "not a url",
      }),
    ).toBeNull()
    expect(
      sanitizeProductAnnouncementCta({
        label: "Other repo",
        url: "https://github.com/qixing-jk/other-project/issues/1",
      }),
    ).toBeNull()
  })

  it("trims labels and normalizes accepted URLs", () => {
    expect(
      sanitizeProductAnnouncementCta({
        label: "  Read changelog  ",
        url: "  https://all-api-hub.qixing1217.top/changelog.html?version=3.44.1#latest  ",
      }),
    ).toEqual({
      kind: "external",
      label: "Read changelog",
      url: "https://all-api-hub.qixing1217.top/changelog.html?version=3.44.1#latest",
    })
  })
})
