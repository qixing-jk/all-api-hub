import { describe, expect, it } from "vitest"

import { getChangelogAnchorId, getDocsChangelogUrl } from "~/utils/docsLinks"
import { getHomepage } from "~/utils/packageMeta"

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
})
