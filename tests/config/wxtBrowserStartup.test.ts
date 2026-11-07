import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"

import { isUserDataDirInUse } from "~~/scripts/cdp/dev-browser-identity.mjs"

vi.mock("~~/scripts/cdp/dev-browser-identity.mjs", () => ({
  isUserDataDirInUse: vi.fn(() => false),
}))

describe("development browser startup", () => {
  afterEach(() => {
    vi.mocked(isUserDataDirInUse).mockReturnValue(false)
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it.each([
    ["chrome", undefined, true],
    ["firefox", undefined, false],
    ["firefox", true, true],
    ["chrome", false, false],
  ] as const)(
    "resolves %s persistence with explicit choice %s to %s",
    async (browser, keepProfileChanges, expected) => {
      const { default: config } = await import("~~/wxt.config")
      const root = mkdtempSync(path.join(os.tmpdir(), "aah-profile-policy-"))
      try {
        const webExt = { keepProfileChanges }
        const hook = (
          config.hooks as { "config:resolved": (wxt: unknown) => void }
        )["config:resolved"]
        hook({ config: { root, browser, webExt: { config: webExt } } })
        expect(webExt.keepProfileChanges).toBe(expected)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )

  it.each(["released", "active", "existing-destination"])(
    "preserves legacy profile data during %s migration",
    async (state) => {
      const { default: config } = await import("~~/wxt.config")
      const root = mkdtempSync(path.join(os.tmpdir(), "aah-profile-migration-"))
      const legacy = path.join(root, ".wxt", "chrome-data")
      const destination = path.join(root, ".browser-data", "chrome")
      try {
        mkdirSync(legacy, { recursive: true })
        writeFileSync(
          path.join(legacy, "Preferences"),
          "saved accounts and sessions",
        )
        if (state === "existing-destination") {
          mkdirSync(destination, { recursive: true })
          writeFileSync(
            path.join(destination, "Preferences"),
            "destination data",
          )
        }
        vi.mocked(isUserDataDirInUse).mockReturnValue(state === "active")
        const hook = (
          config.hooks as { "config:resolved": (wxt: unknown) => void }
        )["config:resolved"]
        const invoke = () =>
          hook({ config: { root, browser: "chrome", webExt: { config: {} } } })
        if (state === "released") {
          invoke()
          expect(existsSync(legacy)).toBe(false)
          expect(
            readFileSync(path.join(destination, "Preferences"), "utf8"),
          ).toBe("saved accounts and sessions")
          invoke()
          expect(
            readFileSync(path.join(destination, "Preferences"), "utf8"),
          ).toBe("saved accounts and sessions")
        } else {
          expect(invoke).toThrow("Cannot migrate")
          expect(readFileSync(path.join(legacy, "Preferences"), "utf8")).toBe(
            "saved accounts and sessions",
          )
          if (state === "existing-destination")
            expect(
              readFileSync(path.join(destination, "Preferences"), "utf8"),
            ).toBe("destination data")
        }
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )

  it("keeps development browser data in an absolute worktree-local profile", async () => {
    const { default: config } = await import("~~/wxt.config")

    expect(config.webExt?.chromiumProfile).toBe(
      fileURLToPath(new URL("../../.browser-data/chrome", import.meta.url)),
    )
    expect(config.webExt?.keepProfileChanges).toBeUndefined()
  })

  it.each([
    [undefined, false],
    ["0", true],
    ["1", false],
  ])(
    "WXT_OPEN_BROWSER=%s disables browser startup: %s",
    async (value, disabled) => {
      vi.stubEnv("WXT_OPEN_BROWSER", value)
      vi.resetModules()
      const { default: config } = await import("~~/wxt.config")

      expect(config.webExt?.disabled).toBe(disabled)
    },
  )
})
