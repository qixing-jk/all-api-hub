import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getRuntimeMode,
  isDevBuild,
  isDevelopmentMode,
  isProdBuild,
  isTestMode,
} from "~/utils/core/environment"

describe("environment helpers", () => {
  it("defaults to production when imported by Node without Vite environment", () => {
    const moduleUrl = pathToFileURL(
      resolve("src/utils/core/environment.ts"),
    ).href
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { getRuntimeMode } from ${JSON.stringify(moduleUrl)}; console.log(getRuntimeMode())`,
      ],
      { encoding: "utf8" },
    )
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe("production")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("detects development mode", () => {
    vi.stubEnv("MODE", "development")

    expect(isDevelopmentMode()).toBe(true)
    expect(isTestMode()).toBe(false)
    expect(getRuntimeMode()).toBe("development")
  })

  it("returns false outside development mode", () => {
    vi.stubEnv("MODE", "test")

    expect(isDevelopmentMode()).toBe(false)
    expect(isTestMode()).toBe(true)
    expect(getRuntimeMode()).toBe("test")
  })

  it("detects production mode", () => {
    vi.stubEnv("MODE", "production")

    expect(isDevelopmentMode()).toBe(false)
    expect(isTestMode()).toBe(false)
    expect(getRuntimeMode()).toBe("production")
  })

  it("preserves custom runtime mode values", () => {
    vi.stubEnv("MODE", "staging")

    expect(isDevelopmentMode()).toBe(false)
    expect(isTestMode()).toBe(false)
    expect(getRuntimeMode()).toBe("staging")
  })

  it("treats custom production modes as prod builds, not production mode names", () => {
    vi.stubEnv("MODE", "staging")
    vi.stubEnv("DEV", false)
    vi.stubEnv("PROD", true)

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
