import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_SNIPPETS,
  evaluateJsSnippet,
  getRawExtensionApi,
  invokeBrowserApi,
  PRESET_PROBES,
} from "~/utils/browser/devApiExplorer"

vi.mock("~/utils/browser/browserApi", () => ({
  sendRuntimeMessage: vi.fn(),
}))

describe("devApiExplorer", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).chrome
    delete (globalThis as any).browser
  })

  describe("getRawExtensionApi", () => {
    it("returns chrome or browser from globalThis", () => {
      const mockChrome = { runtime: { id: "test-ext" } }
      ;(globalThis as any).chrome = mockChrome

      expect(getRawExtensionApi("chrome")).toBe(mockChrome)
      expect(getRawExtensionApi("browser")).toBe(mockChrome)
      expect(getRawExtensionApi()).toBe(mockChrome)
    })

    it("returns browser when preferred and available", () => {
      const mockBrowser = { runtime: { id: "browser-ext" } }
      ;(globalThis as any).browser = mockBrowser

      expect(getRawExtensionApi("browser")).toBe(mockBrowser)
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

    it("handles property access when target is not a function", async () => {
      ;(globalThis as any).chrome = {
        runtime: {
          id: "mock-id-123",
        },
      }

      const res = await invokeBrowserApi("runtime.id", [], "ui")

      expect(res.success).toBe(true)
      expect(res.data).toBe("mock-id-123")
    })

    it("handles errors when invoking non-existent API", async () => {
      ;(globalThis as any).chrome = {}

      const res = await invokeBrowserApi("chrome.nonExistent.method", [], "ui")

      expect(res.success).toBe(false)
      expect(res.error).toBeDefined()
    })

    it("invokes background API via sendRuntimeMessage", async () => {
      const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
      vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
        success: true,
        data: { os: "win" },
      } as any)

      const res = await invokeBrowserApi(
        "runtime.getPlatformInfo",
        [],
        "background",
      )

      expect(res.success).toBe(true)
      expect(res.data).toEqual({ os: "win" })
      expect(res.context).toBe("background")
    })

    it("handles background execution error from runtime message failure", async () => {
      const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
      vi.mocked(sendRuntimeMessage).mockRejectedValueOnce(
        new Error("Connection failed"),
      )

      const res = await invokeBrowserApi(
        "runtime.getPlatformInfo",
        [],
        "background",
      )

      expect(res.success).toBe(false)
      expect(res.error).toContain(
        "Background execution failed: Connection failed",
      )
    })
  })

  describe("evaluateJsSnippet", () => {
    it("returns error message when evaluating in background context without SW eval support", async () => {
      const res = await evaluateJsSnippet("1 + 1", "background")

      expect(res.success).toBe(false)
      expect(res.error).toContain("Background Service Worker does not support")
    })

    it("returns error message when sandbox is unavailable in non-browser environment", async () => {
      const res = await evaluateJsSnippet("1 + 1", "ui")

      expect(res.success).toBe(false)
      expect(res.error).toContain("Sandbox execution failed")
    })
  })

  describe("PRESET_PROBES", () => {
    it("reports absent API namespaces and denied cookie/DNR permissions", async () => {
      ;(globalThis as any).chrome = {}
      const probe = (id: string) => PRESET_PROBES.find((p) => p.id === id)!
      for (const id of ["tabs-active", "storage-engines", "runtime-env"]) {
        await expect(probe(id).run("ui")).rejects.toThrow()
      }
      for (const id of ["alarms-lifecycle", "sidepanel-check", "dnr-rules"]) {
        expect(await probe(id).run("ui")).toMatchObject({ supported: false })
      }
      ;(globalThis as any).chrome = {
        cookies: { getAll: vi.fn().mockRejectedValue(new Error("Denied")) },
        declarativeNetRequest: {
          getDynamicRules: vi.fn().mockRejectedValue(new Error("Denied")),
        },
        runtime: {
          getManifest: () => ({}),
          getPlatformInfo: vi.fn().mockRejectedValue(new Error("Unsupported")),
        },
      }
      expect(await probe("cookies-access").run("ui")).toMatchObject({
        permissionGranted: false,
        error: "Denied",
      })
      expect(await probe("dnr-rules").run("ui")).toMatchObject({
        supported: false,
        error: "Denied",
      })
      expect(await probe("runtime-env").run("ui")).toMatchObject({
        platformInfo: "getPlatformInfo unsupported",
      })
    })

    it("reports a supported empty current-window tab query and storage without local support", async () => {
      ;(globalThis as any).chrome = {
        tabs: { query: vi.fn().mockResolvedValue([]) },
        storage: { sync: {} },
      }
      expect(
        await PRESET_PROBES.find((p) => p.id === "tabs-active")!.run("ui"),
      ).toMatchObject({
        supportedCurrentWindow: true,
        tabCount: 0,
        firstTab: null,
      })
      expect(
        await PRESET_PROBES.find((p) => p.id === "storage-engines")!.run("ui"),
      ).toMatchObject({
        hasLocal: false,
        hasSync: true,
        localWriteVerified: false,
      })
    })

    it("runs tabs-active probe with currentWindow fallback", async () => {
      const probe = PRESET_PROBES.find((p) => p.id === "tabs-active")!
      const mockQuery = vi.fn().mockImplementation(async (query: any) => {
        if (query.currentWindow) {
          throw new Error("currentWindow unsupported")
        }
        return [{ id: 1, title: "Test Page", url: "https://example.com" }]
      })

      ;(globalThis as any).chrome = {
        tabs: {
          query: mockQuery,
        },
      }

      const result: any = await probe.run("ui")
      expect(result.supportedCurrentWindow).toBe(false)
      expect(result.tabCount).toBe(1)
      expect(result.firstTab.id).toBe(1)
    })

    it("runs storage-engines probe and validates local read/write", async () => {
      const probe = PRESET_PROBES.find((p) => p.id === "storage-engines")!
      const store: Record<string, any> = {}
      ;(globalThis as any).chrome = {
        storage: {
          local: {
            set: vi.fn(async (obj) => Object.assign(store, obj)),
            get: vi.fn(async (key) => ({ [key]: store[key] })),
            remove: vi.fn(async (key) => delete store[key]),
          },
          sync: {},
        },
      }

      const result: any = await probe.run("ui")
      expect(result.hasLocal).toBe(true)
      expect(result.hasSync).toBe(true)
      expect(result.hasSession).toBe(false)
      expect(result.localWriteVerified).toBe(true)
    })

    it("runs cookies-access probe with granted and ungranted states", async () => {
      const probe = PRESET_PROBES.find((p) => p.id === "cookies-access")!

      // Namespace unavailable
      ;(globalThis as any).chrome = {}
      const res1: any = await probe.run("ui")
      expect(res1.supported).toBe(false)

      // Namespace available
      ;(globalThis as any).chrome = {
        cookies: {
          getAll: vi.fn().mockResolvedValue([{ name: "test-cookie" }]),
        },
      }
      const res2: any = await probe.run("ui")
      expect(res2.supported).toBe(true)
      expect(res2.permissionGranted).toBe(true)
      expect(res2.sampleResultCount).toBe(1)
    })

    it("runs alarms-lifecycle probe creating and verifying test alarm", async () => {
      const probe = PRESET_PROBES.find((p) => p.id === "alarms-lifecycle")!
      const alarms: any[] = []
      ;(globalThis as any).chrome = {
        alarms: {
          create: vi.fn(async (name, opt) => {
            alarms.push({ name, ...opt })
          }),
          getAll: vi.fn(async () => alarms),
          clear: vi.fn(async (name) => {
            const idx = alarms.findIndex((a) => a.name === name)
            if (idx >= 0) alarms.splice(idx, 1)
          }),
        },
      }

      const result: any = await probe.run("ui")
      expect(result.supported).toBe(true)
      expect(result.createdAndVerified).toBe(true)
    })

    it("runs runtime-env probe", async () => {
      const probe = PRESET_PROBES.find((p) => p.id === "runtime-env")!
      ;(globalThis as any).chrome = {
        runtime: {
          id: "ext-123",
          getManifest: () => ({ manifest_version: 3, version: "4.2.0" }),
          getPlatformInfo: async () => ({ os: "win", arch: "x86-64" }),
        },
      }

      const result: any = await probe.run("ui")
      expect(result.extensionId).toBe("ext-123")
      expect(result.manifestVersion).toBe(3)
      expect(result.extensionVersion).toBe("4.2.0")
      expect(result.platformInfo.os).toBe("win")
    })

    it("runs sidepanel-check probe", async () => {
      const probe = PRESET_PROBES.find((p) => p.id === "sidepanel-check")!
      ;(globalThis as any).chrome = {
        sidePanel: {
          setOptions: vi.fn(),
          open: vi.fn(),
        },
      }

      const result: any = await probe.run("ui")
      expect(result.supported).toBe(true)
      expect(result.hasSetOptions).toBe(true)
      expect(result.hasOpen).toBe(true)
    })

    it("runs dnr-rules probe", async () => {
      const probe = PRESET_PROBES.find((p) => p.id === "dnr-rules")!
      ;(globalThis as any).chrome = {
        declarativeNetRequest: {
          getDynamicRules: vi.fn().mockResolvedValue([{ id: 1 }]),
        },
      }

      const result: any = await probe.run("ui")
      expect(result.supported).toBe(true)
      expect(result.dynamicRulesCount).toBe(1)
    })

    it("runs device-screen probe in browser environment", async () => {
      const probe = PRESET_PROBES.find((p) => p.id === "device-screen")!
      const result: any = await probe.run("ui")
      expect(result).toHaveProperty("userAgent")
      expect(result).toHaveProperty("screen")
    })
  })

  describe("DEFAULT_SNIPPETS", () => {
    it("contains valid default snippets with id, name, and non-empty code", () => {
      expect(DEFAULT_SNIPPETS.length).toBeGreaterThan(0)
      for (const snippet of DEFAULT_SNIPPETS) {
        expect(snippet.id).toBeTruthy()
        expect(snippet.name).toBeTruthy()
        expect(snippet.code.trim().length).toBeGreaterThan(0)
      }
    })
  })
})
