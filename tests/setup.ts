import "@testing-library/jest-dom/vitest"

import { cleanup, configure } from "@testing-library/react"
import i18next from "i18next"

import "whatwg-fetch"

import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"
// Use WXT official fakeBrowser for WebExtension API mocking
import { fakeBrowser } from "wxt/testing/fake-browser"

import { server } from "./msw/server"

await i18next.init({
  lng: "en",
  fallbackLng: "en",
  appendNamespaceToMissingKey: true,
  initImmediate: false,
  parseMissingKeyHandler: (key: string) => key,
  interpolation: {
    escapeValue: false,
  },
})

vi.mock("@lobehub/icons", () => {
  const createIcon = () => () => null
  const createCompoundedIcon = () => {
    const icon = createIcon() as any
    icon.Color = createIcon()
    icon.Text = createIcon()
    icon.Combine = createIcon()
    icon.Avatar = createIcon()
    icon.colorPrimary = "#000000"
    icon.title = "mock"
    return icon
  }
  return {
    Azure: createCompoundedIcon(),
    Baichuan: createCompoundedIcon(),
    Baidu: createCompoundedIcon(),
    Claude: createCompoundedIcon(),
    Cohere: createCompoundedIcon(),
    DeepMind: createCompoundedIcon(),
    DeepSeek: createCompoundedIcon(),
    Gemini: createCompoundedIcon(),
    Grok: createCompoundedIcon(),
    Mistral: createCompoundedIcon(),
    Moonshot: createCompoundedIcon(),
    NewAPI: createCompoundedIcon(),
    Ollama: createCompoundedIcon(),
    OpenAI: createCompoundedIcon(),
    Qwen: createCompoundedIcon(),
    Tencent: createCompoundedIcon(),
    Yi: createCompoundedIcon(),
    Zhipu: createCompoundedIcon(),
  }
})

// No need to manually mock @plasmohq/storage - WxtVitest handles browser.storage
// No need to manually mock webextension-polyfill - WxtVitest provides it
// No need to manually mock chrome API - fakeBrowser provides complete implementation

// Polyfill APIs used in the app that are not present in jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

const globalAny = globalThis as any

if (!globalAny.browser) {
  globalAny.browser = fakeBrowser
}
if (!globalAny.chrome) {
  globalAny.chrome = fakeBrowser
}

if (!globalAny.browser.runtime) {
  globalAny.browser.runtime = {}
}

// fakeBrowser ships with a getManifest stub that throws "not implemented".
// Override it unconditionally so modules can safely read optional permissions.
globalAny.browser.runtime.getManifest = vi.fn(() => ({
  manifest_version: 3,
  optional_permissions: ["cookies", "declarativeNetRequestWithHostAccess"],
}))

globalAny.IntersectionObserver = class IntersectionObserver {
  disconnect() {}
  observe() {}
  takeRecords() {
    return []
  }
  unobserve() {}
}

globalAny.ResizeObserver = class ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

// cmdk/shadcn Command components rely on Element.scrollIntoView, which is not
// implemented by jsdom by default.
if (!globalAny.HTMLElement?.prototype?.scrollIntoView) {
  globalAny.HTMLElement.prototype.scrollIntoView = vi.fn()
}

// Radix UI components rely on pointer capture APIs that are not implemented by
// jsdom by default.
if (!globalAny.HTMLElement?.prototype?.setPointerCapture) {
  globalAny.HTMLElement.prototype.setPointerCapture = vi.fn()
}
if (!globalAny.HTMLElement?.prototype?.releasePointerCapture) {
  globalAny.HTMLElement.prototype.releasePointerCapture = vi.fn()
}
if (!globalAny.HTMLElement?.prototype?.hasPointerCapture) {
  globalAny.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
}

configure({ testIdAttribute: "data-testid" })

beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" })
})

beforeEach(async () => {
  fakeBrowser.reset()
  await fakeBrowser.windows.create({ focused: true })
})

afterEach(() => {
  server.resetHandlers()
  cleanup()
  vi.clearAllMocks()
})

afterAll(() => {
  server.close()
})
