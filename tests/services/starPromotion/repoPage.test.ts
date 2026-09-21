import { describe, expect, it } from "vitest"

import {
  ALL_API_HUB_REPO_PAGE_KINDS,
  classifyAllApiHubRepoPageUrl,
} from "~/services/starPromotion/repoPage"

describe("classifyAllApiHubRepoPageUrl", () => {
  it("classifies the repository root page", () => {
    expect(
      classifyAllApiHubRepoPageUrl("https://github.com/qixing-jk/all-api-hub"),
    ).toBe(ALL_API_HUB_REPO_PAGE_KINDS.Root)
  })

  it("classifies repository subpages separately from the root", () => {
    expect(
      classifyAllApiHubRepoPageUrl(
        "https://github.com/qixing-jk/all-api-hub/issues/1495",
      ),
    ).toBe(ALL_API_HUB_REPO_PAGE_KINDS.Subpage)
  })

  it("rejects other repositories, hosts, and lookalike paths", () => {
    expect(
      classifyAllApiHubRepoPageUrl("https://github.com/other/all-api-hub"),
    ).toBeNull()
    expect(
      classifyAllApiHubRepoPageUrl("https://github.com/qixing-jk/other"),
    ).toBeNull()
    expect(
      classifyAllApiHubRepoPageUrl(
        "https://github.com/qixing-jk/all-api-hub-fork",
      ),
    ).toBeNull()
    expect(
      classifyAllApiHubRepoPageUrl("https://example.com/qixing-jk/all-api-hub"),
    ).toBeNull()
  })

  it("returns null for missing or unparsable URLs", () => {
    expect(classifyAllApiHubRepoPageUrl(undefined)).toBeNull()
    expect(classifyAllApiHubRepoPageUrl("not a url")).toBeNull()
  })
})
