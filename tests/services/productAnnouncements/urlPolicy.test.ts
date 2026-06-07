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
      label: "View release",
      url: "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.44.1",
    })

    expect(
      sanitizeProductAnnouncementCta({
        label: "Read docs",
        url: "https://all-api-hub.qixing1217.top/changelog.html",
      }),
    ).toEqual({
      label: "Read docs",
      url: "https://all-api-hub.qixing1217.top/changelog.html",
    })
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
      label: "Read changelog",
      url: "https://all-api-hub.qixing1217.top/changelog.html?version=3.44.1#latest",
    })
  })
})
