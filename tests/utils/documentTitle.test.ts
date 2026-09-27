import { beforeEach, describe, expect, it, vi } from "vitest"

import { EMPTY_DEV_IDENTITY } from "~/utils/core/devIdentity"
import i18n from "~/utils/i18n"
import * as documentTitleModule from "~/utils/navigation/documentTitle"
import {
  buildDevIdentity,
  DEV_IDENTITY_FIXTURE_PATH_TAIL,
} from "~~/tests/test-utils/devIdentityFixtures"

const { getDevIdentityMock } = vi.hoisted(() => ({
  getDevIdentityMock: vi.fn(),
}))

vi.mock("~/utils/browser/extensionIdentity", () => ({
  getDevIdentity: (...args: unknown[]) => getDevIdentityMock(...args),
}))

vi.mock("~/utils/i18n", () => ({
  default: {
    t: vi.fn((key: string, options?: { app?: string; page?: string }) => {
      if (key === "ui:pageTitle.template") {
        return `${options?.page} | ${options?.app}`
      }

      return key
    }),
  },
}))

describe("documentTitle", () => {
  beforeEach(() => {
    getDevIdentityMock.mockReturnValue(EMPTY_DEV_IDENTITY)
  })

  describe("setDocumentTitle", () => {
    it("sets title for options page", () => {
      documentTitleModule.setDocumentTitle("options")
      expect(document.title).toBe("ui:pageTitle.options | ui:pageTitle.app")
    })

    it("sets title for popup page", () => {
      documentTitleModule.setDocumentTitle("popup")
      expect(document.title).toBe("ui:pageTitle.popup | ui:pageTitle.app")
    })

    it("sets title for sidepanel page", () => {
      documentTitleModule.setDocumentTitle("sidepanel")
      expect(document.title).toBe("ui:pageTitle.sidepanel | ui:pageTitle.app")
    })

    it("appends the build's source path so tabs identify their checkout", () => {
      getDevIdentityMock.mockReturnValue(buildDevIdentity())

      documentTitleModule.setDocumentTitle("options")

      expect(document.title).toBe(
        `ui:pageTitle.options | ui:pageTitle.app · ${DEV_IDENTITY_FIXTURE_PATH_TAIL}`,
      )
    })

    it("catches errors from i18n.t without throwing", () => {
      const originalTitle = document.title
      const tSpy = vi.mocked(i18n.t as unknown as (key: string) => string)

      tSpy.mockImplementation(() => {
        throw new Error("boom")
      })

      // Should not throw and should fall back to the existing title (errors are handled internally).
      documentTitleModule.setDocumentTitle("options")

      expect(document.title).toBe(originalTitle)
    })
  })
})
