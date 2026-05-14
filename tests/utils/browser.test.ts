import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  detectBrowserFamily,
  detectExtensionStore,
  getDeviceTypeInfo,
  isEdgeByUA,
  isExtensionBackground,
  isExtensionPopup,
  isExtensionSidePanel,
  isFirefoxByUA,
} from "~/utils/browser"

describe("browser", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe("detectBrowserFamily", () => {
    it("classifies common browser families from explicit user agents", () => {
      expect(detectBrowserFamily("Mozilla/5.0 Firefox/123.0")).toBe("firefox")
      expect(detectBrowserFamily("Mozilla/5.0 Edg/120.0.0.0")).toBe("edge")
      expect(detectBrowserFamily("Mozilla/5.0 Chrome/120.0.0.0")).toBe(
        "chromium",
      )
      expect(
        detectBrowserFamily("Mozilla/5.0 Version/17.0 Safari/605.1.15"),
      ).toBe("safari")
      expect(detectBrowserFamily("Mozilla/5.0 UnknownBrowser/1.0")).toBe(
        "unknown",
      )
    })

    it("falls back to navigator.userAgent when no UA override is provided", () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 Chromium/120.0.0.0",
      })

      expect(detectBrowserFamily()).toBe("chromium")
    })
  })

  describe("isFirefoxByUA", () => {
    it("detects Firefox-like user agents from the global navigator", () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 Firefox/123.0",
      })
      expect(isFirefoxByUA()).toBe(true)

      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 Gecko/20100101",
      })
      expect(isFirefoxByUA()).toBe(true)

      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 Chrome/123.0.0.0",
      })
      expect(isFirefoxByUA()).toBe(false)
    })
  })

  describe("isEdgeByUA", () => {
    it("detects Edge desktop UA", () => {
      expect(isEdgeByUA("Mozilla/5.0 Edg/120.0.0.0")).toBe(true)
    })

    it("returns false for Chrome UA", () => {
      expect(isEdgeByUA("Mozilla/5.0 Chrome/120.0.0.0")).toBe(false)
    })

    it("falls back to navigator.userAgent when no UA override is provided", () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 EdgiOS/120.0.0.0",
      })

      expect(isEdgeByUA()).toBe(true)
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

  describe("getDeviceTypeInfo", () => {
    it("prefers userAgentData mobile when available", () => {
      expect(
        getDeviceTypeInfo({
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          userAgentDataMobile: true,
          maxTouchPoints: 0,
          screenWidth: 1440,
          screenHeight: 900,
          matchMedia: () => ({ matches: false }),
        }),
      ).toMatchObject({
        type: "mobile",
        isMobile: true,
        isTablet: false,
        isDesktop: false,
      })
    })

    it("keeps touch-enabled Windows Chromium classified as desktop when userAgentData says non-mobile", () => {
      expect(
        getDeviceTypeInfo({
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          userAgentDataMobile: false,
          maxTouchPoints: 10,
          screenWidth: 1220,
          screenHeight: 686,
          matchMedia: () => ({ matches: true }),
        }),
      ).toMatchObject({
        type: "desktop",
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isTouchDevice: true,
      })
    })

    it("falls back to touch heuristics for tablet classification when userAgentData is unavailable", () => {
      expect(
        getDeviceTypeInfo({
          userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
          userAgentDataMobile: null,
          maxTouchPoints: 5,
          screenWidth: 800,
          screenHeight: 1280,
          matchMedia: () => ({ matches: true }),
        }),
      ).toMatchObject({
        type: "tablet",
        isMobile: false,
        isTablet: true,
        isDesktop: false,
        isTouchDevice: true,
      })
    })

    it("still allows an explicit non-mobile hint to classify known tablet UAs as tablet", () => {
      expect(
        getDeviceTypeInfo({
          userAgent:
            "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          userAgentDataMobile: false,
          maxTouchPoints: 5,
          screenWidth: 1024,
          screenHeight: 768,
          matchMedia: () => ({ matches: true }),
        }),
      ).toMatchObject({
        type: "tablet",
        isMobile: false,
        isTablet: true,
        isDesktop: false,
      })
    })

    it("falls back to UA parsing when richer signals are unavailable", () => {
      expect(
        getDeviceTypeInfo({
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
          userAgentDataMobile: null,
          maxTouchPoints: 0,
          screenWidth: 1440,
          screenHeight: 900,
          matchMedia: () => ({ matches: false }),
        }),
      ).toMatchObject({
        type: "mobile",
        isMobile: true,
      })
    })

    it("keeps desktop runtimes classified as desktop", () => {
      expect(
        getDeviceTypeInfo({
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          userAgentDataMobile: false,
          maxTouchPoints: 0,
          screenWidth: 1440,
          screenHeight: 900,
          matchMedia: () => ({ matches: false }),
        }),
      ).toMatchObject({
        type: "desktop",
        isDesktop: true,
        isMobile: false,
        isTablet: false,
      })
    })
  })

  describe("extension page detection", () => {
    it("detects popup and sidepanel extension URLs from window.location", () => {
      vi.stubGlobal("window", {
        location: {
          href: "moz-extension://abc/popup.html",
        },
      })
      expect(isExtensionPopup()).toBe(true)
      expect(isExtensionSidePanel()).toBe(false)

      vi.stubGlobal("window", {
        location: {
          href: "moz-extension://abc/sidepanel.html",
        },
      })
      expect(isExtensionPopup()).toBe(false)
      expect(isExtensionSidePanel()).toBe(true)
    })

    it("returns false when the current page is not an extension page", () => {
      vi.stubGlobal("window", {
        location: {
          href: "https://example.com/dashboard",
        },
      })
      expect(isExtensionPopup()).toBe(false)
      expect(isExtensionSidePanel()).toBe(false)
    })
  })

  describe("isExtensionBackground", () => {
    it("detects a service-worker background context", () => {
      class FakeServiceWorkerGlobalScope {}

      vi.stubGlobal("ServiceWorkerGlobalScope", FakeServiceWorkerGlobalScope)
      vi.stubGlobal("self", new FakeServiceWorkerGlobalScope())

      expect(isExtensionBackground()).toBe(true)
    })

    it("detects legacy background pages by pathname and returns false otherwise", () => {
      vi.stubGlobal("location", {
        pathname: "/_generated_background_page.html",
      })
      expect(isExtensionBackground()).toBe(true)

      vi.stubGlobal("window", {
        location: {
          href: "https://example.com/options.html",
        },
      })
      vi.stubGlobal("location", {
        pathname: "/options.html",
      })
      expect(isExtensionBackground()).toBe(false)
    })
  })
})
