import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getRuntimeMode,
  isDevBuild,
  isDevelopmentMode,
  isProdBuild,
  isProductionMode,
  isTestMode,
} from "~/utils/core/environment"

describe("environment helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("detects development mode", () => {
    vi.stubEnv("MODE", "development")

    expect(isDevelopmentMode()).toBe(true)
    expect(isProductionMode()).toBe(false)
    expect(isTestMode()).toBe(false)
    expect(getRuntimeMode()).toBe("development")
  })

  it("returns false outside development mode", () => {
    vi.stubEnv("MODE", "test")

    expect(isDevelopmentMode()).toBe(false)
    expect(isProductionMode()).toBe(false)
    expect(isTestMode()).toBe(true)
    expect(getRuntimeMode()).toBe("test")
  })

  it("detects production mode", () => {
    vi.stubEnv("MODE", "production")

    expect(isDevelopmentMode()).toBe(false)
    expect(isProductionMode()).toBe(true)
    expect(isTestMode()).toBe(false)
    expect(getRuntimeMode()).toBe("production")
  })

  it("preserves custom runtime mode values", () => {
    vi.stubEnv("MODE", "staging")

    expect(isDevelopmentMode()).toBe(false)
    expect(isProductionMode()).toBe(false)
    expect(isTestMode()).toBe(false)
    expect(getRuntimeMode()).toBe("staging")
  })

  it("treats custom production modes as prod builds, not production mode names", () => {
    vi.stubEnv("MODE", "staging")
    vi.stubEnv("DEV", false)
    vi.stubEnv("PROD", true)

    expect(isProductionMode()).toBe(false)
    expect(isProdBuild()).toBe(true)
  })

  it("detects Vite dev and production build flags separately from mode names", () => {
    vi.stubEnv("MODE", "development")
    vi.stubEnv("DEV", false)
    vi.stubEnv("PROD", true)

    expect(isDevelopmentMode()).toBe(true)
    expect(isDevBuild()).toBe(false)
    expect(isProdBuild()).toBe(true)
  })
})
