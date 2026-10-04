import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  evaluateJsSnippet,
  getRawExtensionApi,
  invokeBrowserApi,
} from "~/utils/browser/devApiExplorer"

describe("devApiExplorer", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe("getRawExtensionApi", () => {
    it("returns chrome or browser from globalThis", () => {
      const mockChrome = { runtime: { id: "test-ext" } }
      ;(globalThis as any).chrome = mockChrome

      expect(getRawExtensionApi("chrome")).toBe(mockChrome)
    })
  })

  describe("invokeBrowserApi", () => {
    it("successfully invokes nested chrome method with arguments in UI context", async () => {
      const mockGet = vi.fn().mockResolvedValue({ foo: "bar" })
      ;(globalThis as any).chrome = {
        storage: {
          local: {
            get: mockGet,
          },
        },
      }

      const res = await invokeBrowserApi(
        "chrome.storage.local.get",
        ["foo"],
        "ui",
      )

      expect(res.success).toBe(true)
      expect(res.data).toEqual({ foo: "bar" })
      expect(mockGet).toHaveBeenCalledWith("foo")
    })

    it("handles errors when invoking non-existent API", async () => {
      ;(globalThis as any).chrome = {}

      const res = await invokeBrowserApi("chrome.nonExistent.method", [], "ui")

      expect(res.success).toBe(false)
      expect(res.error).toBeDefined()
    })

    it("returns error message when evaluating in background context without SW eval support", async () => {
      const res = await evaluateJsSnippet("1 + 1", "background")

      expect(res.success).toBe(false)
      expect(res.error).toContain("Background Service Worker does not support")
    })

    it("evaluates JS snippet with return value in fallback mode", async () => {
      const res = await evaluateJsSnippet("return 1 + 2", "ui")

      expect(res.success).toBe(true)
      expect(res.data).toBe(3)
    })
  })
})
