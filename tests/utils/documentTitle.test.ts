import { describe, expect, it, vi } from "vitest"

import * as documentTitleModule from "~/utils/documentTitle"
import i18n from "~/utils/i18n"

vi.mock("~/utils/i18n", () => ({
  default: {
    t: vi.fn((key: string) => key),
    on: vi.fn(),
  },
}))

describe("documentTitle", () => {
  describe("setDocumentTitle", () => {
    it("sets title for options page", () => {
      documentTitleModule.setDocumentTitle("options")
      expect(document.title).toBe("ui:pageTitle.options")
    })

    it("sets title for popup page", () => {
      documentTitleModule.setDocumentTitle("popup")
      expect(document.title).toBe("ui:pageTitle.popup")
    })

    it("sets title for sidepanel page", () => {
      documentTitleModule.setDocumentTitle("sidepanel")
      expect(document.title).toBe("ui:pageTitle.sidepanel")
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

  describe("initializeDocumentTitle", () => {
    it("sets title initially and registers languageChanged listener", () => {
      const onSpy = vi.mocked(i18n.on)

      documentTitleModule.initializeDocumentTitle("options")

      expect(onSpy).toHaveBeenCalledWith(
        "languageChanged",
        expect.any(Function),
      )

      const handler = onSpy.mock.calls[0][1] as () => void

      // handler should be callable without throwing
      handler()
    })
  })
})
