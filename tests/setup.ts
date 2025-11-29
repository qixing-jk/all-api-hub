import "@testing-library/jest-dom/vitest"

import { cleanup, configure } from "@testing-library/react"

import "whatwg-fetch"

import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"
// Use WXT official fakeBrowser for WebExtension API mocking
import { fakeBrowser } from "wxt/testing/fake-browser"

import { server } from "./msw/server"

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
    dispatchEvent: vi.fn()
  }))
})

const globalAny = globalThis as any

if (!globalAny.browser) {
  globalAny.browser = fakeBrowser
}
if (!globalAny.chrome) {
  globalAny.chrome = fakeBrowser
}

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

configure({ testIdAttribute: "data-testid" })

beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" })
})

beforeEach(() => {
  // Reset fakeBrowser state before each test
  fakeBrowser.reset()
})

afterEach(() => {
  server.resetHandlers()
  cleanup()
  vi.clearAllMocks()
})

afterAll(() => {
  server.close()
})
