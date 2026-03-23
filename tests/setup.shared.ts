import { init } from "i18next"

import "whatwg-fetch"

import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"
// Use WXT official fakeBrowser for WebExtension API mocking
import { fakeBrowser } from "wxt/testing/fake-browser"

import { server } from "./msw/server"

await init({
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

globalAny.IntersectionObserver =
  globalAny.IntersectionObserver ||
  class IntersectionObserver {
    disconnect() {}
    observe() {}
    takeRecords() {
      return []
    }
    unobserve() {}
  }

globalAny.ResizeObserver =
  globalAny.ResizeObserver ||
  class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  }

beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" })
})

beforeEach(async () => {
  fakeBrowser.reset()
  await fakeBrowser.windows.create({ focused: true })
})

afterEach(() => {
  server.resetHandlers()
  vi.clearAllMocks()
})

afterAll(() => {
  server.close()
})
