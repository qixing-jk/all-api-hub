import { describe, expect, it } from "vitest"

import { detectExtensionStore, isEdgeByUA } from "~/utils/browser"

describe("browser", () => {
  describe("isEdgeByUA", () => {
    it("detects Edge desktop UA", () => {
      expect(isEdgeByUA("Mozilla/5.0 Edg/120.0.0.0")).toBe(true)
    })

    it("returns false for Chrome UA", () => {
      expect(isEdgeByUA("Mozilla/5.0 Chrome/120.0.0.0")).toBe(false)
    })
  })

  describe("detectExtensionStore", () => {
    it("prefers Firefox runtime URL", () => {
      expect(
        detectExtensionStore({
          runtimeUrl: "moz-extension://abc/",
          userAgent: "Mozilla/5.0 Edg/120.0.0.0",
        }),
      ).toBe("firefox")
    })

    it("detects Edge by UA when not Firefox", () => {
      expect(
        detectExtensionStore({
          runtimeUrl: "chrome-extension://abc/",
          userAgent: "Mozilla/5.0 Edg/120.0.0.0",
        }),
      ).toBe("edge")
    })

    it("defaults to Chrome otherwise", () => {
      expect(
        detectExtensionStore({
          runtimeUrl: "",
          userAgent: "Mozilla/5.0 Chrome/120.0.0.0",
        }),
      ).toBe("chrome")
    })
  })
})
