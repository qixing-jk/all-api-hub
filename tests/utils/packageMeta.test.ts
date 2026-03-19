import { describe, expect, it } from "vitest"

import { getFeedbackDestinationUrls } from "~/utils/navigation/feedbackLinks"
import {
  getDocsBaseUrl,
  getHomepage,
  getPkgVersion,
  getRepository,
} from "~/utils/navigation/packageMeta"

describe("packageMeta", () => {
  describe("getHomepage", () => {
    it("returns homepage from package.json", () => {
      const homepage = getHomepage()
      expect(homepage).toBeTruthy()
      expect(typeof homepage).toBe("string")
    })

    it("builds locale-aware homepage urls", () => {
      expect(getHomepage("en")).toMatch(/\/en\/$/)
      expect(getHomepage("ja")).toMatch(/\/ja\/$/)
      expect(getHomepage("zh-CN")).not.toMatch(/\/(en|ja)\/$/)
      expect(getHomepage("zh-SG")).not.toMatch(/\/(en|ja)\/$/)
      expect(getHomepage("fr-FR")).toMatch(/\/en\/$/)
      expect(getHomepage("zh-CN")).toBe(
        `${getDocsBaseUrl().replace(/\/+$/, "")}/`,
      )
      expect(getHomepage("zh_CN")).toBe(getHomepage("zh-CN"))
    })
  })

  describe("getRepository", () => {
    it("returns repository URL", () => {
      const repo = getRepository()
      expect(repo).toBeTruthy()
      expect(typeof repo).toBe("string")
    })
  })

  describe("getPkgVersion", () => {
    it("returns version for existing dependency", () => {
      const version = getPkgVersion("react")
      expect(version).not.toBe("—")
      expect(version).toBeTruthy()
    })

    it("returns dash for non-existent dependency", () => {
      const version = getPkgVersion("non-existent-package-xyz")
      expect(version).toBe("—")
    })

    it("strips version prefixes", () => {
      const version = getPkgVersion("react")
      expect(version).not.toMatch(/^[~^><= ]/)
    })
  })

  describe("getFeedbackDestinationUrls", () => {
    it("builds the repository feedback destinations from the repository url", () => {
      expect(getFeedbackDestinationUrls()).toEqual({
        repository: "https://github.com/qixing-jk/all-api-hub",
        bugReport:
          "https://github.com/qixing-jk/all-api-hub/issues/new?template=bug_report.yml",
        featureRequest:
          "https://github.com/qixing-jk/all-api-hub/issues/new?template=feature_request.yml",
        discussions: "https://github.com/qixing-jk/all-api-hub/discussions",
      })
    })
  })
})
