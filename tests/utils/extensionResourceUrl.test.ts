import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getExtensionResourceUrl } from "~/utils/browser/extensionResourceUrl"

describe("getExtensionResourceUrl", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uses the browser runtime when it is available", () => {
    const getURL = vi.fn((path: string) => `browser-extension://${path}`)
    vi.stubGlobal("browser", { runtime: { getURL } })

    expect(getExtensionResourceUrl("app-locales/en.json")).toBe(
      "browser-extension://app-locales/en.json",
    )
    expect(getURL).toHaveBeenCalledWith("app-locales/en.json")
  })

  it("falls back to the chrome runtime when browser runtime is incomplete", () => {
    const getURL = vi.fn((path: string) => `chrome-extension://${path}`)
    vi.stubGlobal("browser", { runtime: {} })
    vi.stubGlobal("chrome", { runtime: { getURL } })

    expect(getExtensionResourceUrl("app-locales/zh-CN.json")).toBe(
      "chrome-extension://app-locales/zh-CN.json",
    )
  })

  it("rejects asset resolution when no extension runtime is available", () => {
    vi.stubGlobal("browser", undefined)
    vi.stubGlobal("chrome", undefined)

    expect(() => getExtensionResourceUrl("app-locales/en.json")).toThrow(
      "Extension runtime.getURL is unavailable",
    )
  })
})
