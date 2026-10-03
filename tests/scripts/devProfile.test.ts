import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  applyIsolateFlag,
  resolveCdpPort,
  resolveDevProfileDir,
  WORKTREE_NAME,
} from "~~/scripts/cdp/dev-profile.mjs"

afterEach(() => vi.unstubAllEnvs())

describe("development browser profile", () => {
  it("uses the shared profile and port by default", () => {
    vi.stubEnv("AAH_DEV_PROFILE_PER_WORKTREE", "0")
    vi.stubEnv("AAH_DEV_PROFILE_DIR", "")
    vi.stubEnv("CDP_PORT", "")
    expect(path.basename(resolveDevProfileDir())).toBe("dev-browser")
    expect(resolveCdpPort()).toBe(9222)
  })

  it("uses matching isolated profile and stable port after the CLI flag", () => {
    vi.stubEnv("AAH_DEV_PROFILE_PER_WORKTREE", "0")
    vi.stubEnv("AAH_DEV_PROFILE_DIR", "")
    vi.stubEnv("CDP_PORT", "")
    applyIsolateFlag(["--isolate"])
    expect(path.basename(resolveDevProfileDir())).toBe(
      `dev-browser-${WORKTREE_NAME}`,
    )
    const port = resolveCdpPort()
    expect(port).toBeGreaterThan(9222)
    expect(resolveCdpPort()).toBe(port)
  })

  it("honors explicit profile and port overrides", () => {
    vi.stubEnv("AAH_DEV_PROFILE_PER_WORKTREE", "1")
    vi.stubEnv("AAH_DEV_PROFILE_DIR", "custom-profile")
    vi.stubEnv("CDP_PORT", "9444")
    expect(resolveDevProfileDir()).toBe(path.resolve("custom-profile"))
    expect(resolveCdpPort()).toBe(9444)
  })

  it.each(["invalid", "0", "65536", "1.5"])(
    "rejects invalid CDP port %s",
    (port) => {
      vi.stubEnv("CDP_PORT", port)
      expect(() => resolveCdpPort()).toThrow("CDP_PORT")
    },
  )
})
