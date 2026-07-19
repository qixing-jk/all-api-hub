import { afterEach, describe, expect, it, vi } from "vitest"

import { DOCS_BASE_URL, REPO_URL } from "~/constants/about"
import { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"
import {
  getFeedbackDestinationUrls,
  getSiteSupportRequestUrl,
} from "~/utils/navigation/feedbackLinks"
import {
  getDocsBaseUrl,
  getHomepage,
  getPkgVersion,
  getRepository,
} from "~/utils/navigation/packageMeta"

describe("packageMeta", () => {
  afterEach(() => {
    vi.doUnmock("~/utils/navigation/packageMeta")
    vi.doUnmock("~/utils/navigation/docsLinks")
    vi.doUnmock("~~/package.json")
    vi.resetModules()
    vi.restoreAllMocks()
  })

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

    it("falls back to the docs base url when package metadata omits homepage", async () => {
      vi.resetModules()
      vi.doMock("~~/package.json", () => ({
        default: {},
      }))

      const {
        getDocsBaseUrl: getFreshDocsBaseUrl,
        getHomepage: getFreshHomepage,
      } = await import("~/utils/navigation/packageMeta")

      expect(getFreshDocsBaseUrl()).toBe(DOCS_BASE_URL)
      expect(getFreshHomepage("en")).toContain("/en/")
    })
  })

  describe("getRepository", () => {
    it("returns repository URL", () => {
      const repo = getRepository()
      expect(repo).toBeTruthy()
      expect(typeof repo).toBe("string")
    })

    it("falls back to the default repository url when package metadata omits repository", async () => {
      vi.resetModules()
      vi.doMock("~~/package.json", () => ({
        default: {},
      }))

      const { getRepository: getFreshRepository } = await import(
        "~/utils/navigation/packageMeta"
      )

      expect(getFreshRepository()).toBe(REPO_URL)
    })

    it("falls back to the default repository url when repository metadata has no url", async () => {
      vi.resetModules()
      vi.doMock("~~/package.json", () => ({
        default: {
          repository: {},
        },
      }))

      const { getRepository: getFreshRepository } = await import(
        "~/utils/navigation/packageMeta"
      )

      expect(getFreshRepository()).toBe(REPO_URL)
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

    it("returns version for existing dev dependency", () => {
      const version = getPkgVersion("vitest")
      expect(version).toBe("4.0.3")
    })
  })

  describe("getFeedbackDestinationUrls", () => {
    it("builds the repository feedback destinations from the repository url", () => {
      const homepage = new URL(getHomepage())
      homepage.hash = "community"

      expect(getFeedbackDestinationUrls()).toEqual({
        repository: "https://github.com/qixing-jk/all-api-hub",
        bugReport:
          "https://github.com/qixing-jk/all-api-hub/issues/new?template=bug_report.yml",
        featureRequest:
          "https://github.com/qixing-jk/all-api-hub/issues/new?template=feature_request.yml",
        languageRequest:
          "https://github.com/qixing-jk/all-api-hub/issues/new?template=language_request.yml",
        siteSupportRequest:
          "https://github.com/qixing-jk/all-api-hub/issues/new?template=site_support_request.yml",
        discussions: "https://github.com/qixing-jk/all-api-hub/discussions",
        community: homepage.toString(),
      })
    })

    it("builds locale-aware community destinations", () => {
      expect(getFeedbackDestinationUrls("en").community).toBe(
        "https://all-api-hub.qixing1217.top/en/#community",
      )
      expect(getFeedbackDestinationUrls("ja").community).toBe(
        "https://all-api-hub.qixing1217.top/ja/#community",
      )
      expect(getFeedbackDestinationUrls("zh-CN").community).toBe(
        "https://all-api-hub.qixing1217.top/#community",
      )
    })

    it("normalizes git+ repository urls before building destinations", async () => {
      vi.resetModules()
      vi.doMock("~/utils/navigation/packageMeta", () => ({
        getRepository: () => "git+https://github.com/example/project.git",
      }))
      vi.doMock("~/utils/navigation/docsLinks", () => ({
        getDocsCommunityUrl: () => "https://docs.example.test/#community",
      }))

      const { getFeedbackDestinationUrls: getFreshFeedbackDestinationUrls } =
        await import("~/utils/navigation/feedbackLinks")

      expect(getFreshFeedbackDestinationUrls()).toEqual({
        repository: "https://github.com/example/project",
        bugReport:
          "https://github.com/example/project/issues/new?template=bug_report.yml",
        featureRequest:
          "https://github.com/example/project/issues/new?template=feature_request.yml",
        languageRequest:
          "https://github.com/example/project/issues/new?template=language_request.yml",
        siteSupportRequest:
          "https://github.com/example/project/issues/new?template=site_support_request.yml",
        discussions: "https://github.com/example/project/discussions",
        community: "https://docs.example.test/#community",
      })
    })

    it("prefills site-support request destinations with site context", () => {
      vi.spyOn(
        (globalThis as any).browser.runtime,
        "getManifest",
      ).mockReturnValue({
        manifest_version: 3,
        version: "3.49.1",
        optional_permissions: [],
      })

      const destination = getSiteSupportRequestUrl({
        siteUrl: "https://relay.example.com/console?token=redacted",
        errorType: AutoDetectErrorType.NOT_FOUND,
        errorMessage: "Auto-detect failed",
      })
      const url = new URL(destination)

      expect(`${url.origin}${url.pathname}`).toBe(
        "https://github.com/qixing-jk/all-api-hub/issues/new",
      )
      expect(url.searchParams.get("template")).toBe("site_support_request.yml")
      expect(url.searchParams.get("title")).toBe(
        "[Site Support]: relay.example.com",
      )
      expect(url.searchParams.get("labels")).toBe("site-support")
      expect(url.searchParams.get("site-url")).toBe(
        "https://relay.example.com/console?token=redacted",
      )
      expect(url.searchParams.get("failure-type")).toBe("notFound")
      expect(url.searchParams.get("failure-message")).toBe("Auto-detect failed")
      expect(url.searchParams.get("extension-version")).toBe("3.49.1")
    })
  })
})
