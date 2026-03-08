import { describe, expect, it } from "vitest"

import {
  detectExtensionStore,
  getDeviceTypeInfo,
  isEdgeByUA,
} from "~/utils/browser"

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

    it("classifies touch-first compact runtimes as tablet", () => {
      expect(
        getDeviceTypeInfo({
          userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
          userAgentDataMobile: false,
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
})
