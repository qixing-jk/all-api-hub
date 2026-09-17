import { describe, expect, it, vi } from "vitest"

import i18n from "~/utils/i18n"
import * as documentTitleModule from "~/utils/navigation/documentTitle"

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
