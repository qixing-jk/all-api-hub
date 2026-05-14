import { afterEach, describe, expect, it, vi } from "vitest"

import { isDevelopmentMode } from "~/utils/core/environment"

describe("environment helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("detects development mode", () => {
    vi.stubEnv("MODE", "development")

    expect(isDevelopmentMode()).toBe(true)
  })

  it("returns false outside development mode", () => {
    vi.stubEnv("MODE", "test")

    expect(isDevelopmentMode()).toBe(false)
  })
})
