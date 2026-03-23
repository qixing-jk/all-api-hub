import "@testing-library/jest-dom/vitest"

import { cleanup, configure } from "@testing-library/react"
import { afterEach, vi } from "vitest"

import "./setup.shared"

const globalAny = globalThis as any

// Polyfill APIs used in the app that are not present in jsdom.
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

// cmdk/shadcn Command components rely on Element.scrollIntoView, which is not
// implemented by jsdom by default.
if (!globalAny.HTMLElement?.prototype?.scrollIntoView) {
  globalAny.HTMLElement.prototype.scrollIntoView = vi.fn()
}

// Headless UI checks the Web Animations API and warns when it has to install a
// fallback `getAnimations` polyfill itself. Providing a no-op implementation in
// the shared test setup keeps affected suites quiet and deterministic.
if (!globalAny.Element?.prototype?.getAnimations) {
  globalAny.Element.prototype.getAnimations = vi.fn(() => [])
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

afterEach(() => {
  cleanup()
})
