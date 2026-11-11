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
import {
  createServer,
  type ExtensionRunner,
  type Wxt,
  type WxtDevServer,
  type WxtHooks,
} from "wxt"

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
    [undefined, true],
    ["0", false],
    ["1", true],
  ])(
    "WXT_OPEN_BROWSER=%s automatically opens the browser: %s, while allowing manual opening",
    async (value, automaticallyOpened) => {
      vi.stubEnv("WXT_OPEN_BROWSER", value)
      vi.resetModules()
      const { default: config } = await import("~~/wxt.config")

      let browserOpen = false
      const runner: ExtensionRunner = {
        async openBrowser() {
          browserOpen = true
        },
      }
      const wxt = { runner } as Wxt
      await (config.hooks as Partial<WxtHooks>)["server:started"]?.(
        wxt,
        {} as WxtDevServer,
      )
      await runner.openBrowser()
      expect(browserOpen).toBe(automaticallyOpened)

      // WXT's `o + Enter` handler calls the runner again after startup.
      expect(config.webExt?.disabled).not.toBe(true)
      await runner.openBrowser()
      expect(browserOpen).toBe(true)
    },
  )

  it.each(["chrome", "firefox"])(
    "allows manual %s opening after startup and server restarts",
    async (browser) => {
      vi.stubEnv("WXT_OPEN_BROWSER", "0")
      const { default: config } = await import("~~/wxt.config")
      const root = mkdtempSync(path.join(os.tmpdir(), "aah-browser-startup-"))
      mkdirSync(path.join(root, "entrypoints"))
      writeFileSync(
        path.join(root, "entrypoints", "popup.html"),
        "<!doctype html><html><head><title>Startup fixture</title></head><body>Ready</body></html>",
      )
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ name: "startup-fixture", version: "0.0.0" }),
      )
      const browserConfigPath = path.join(root, "web-ext.config.ts")
      writeFileSync(browserConfigPath, "export default { startUrls: [] }")

      // Replace only the external browser boundary; exercise WXT's real
      // startup, manual-open API (used by `o + Enter`) and config reloads.
      const runner = {
        browserOpen: false,
        canOpen: async () => true,
        async openBrowser() {
          this.browserOpen = true
        },
        async closeBrowser() {
          this.browserOpen = false
        },
      }
      let configuredWxt: Wxt
      let server: WxtDevServer | undefined
      try {
        server = await createServer({
          root,
          configFile: false,
          srcDir: ".",
          browser,
          watchOptions: config.watchOptions,
          dev: { server: { host: "127.0.0.1", port: 0 } },
          hooks: {
            ready: (wxt) => {
              wxt.runner = runner
              configuredWxt = wxt
            },
            "server:started": (config.hooks as Partial<WxtHooks>)[
              "server:started"
            ],
          },
        })
        await server.start()
        expect(runner.browserOpen).toBe(false)

        // Observe real filesystem changes long enough for WXT's debounce:
        // browser config edits must wait for a manual open, while source
        // files remain watched.
        const changedFiles: string[] = []
        server.watcher.on("all", (_event, file) => changedFiles.push(file))
        writeFileSync(
          browserConfigPath,
          "export default { startUrls: ['about:blank'] }",
        )
        const sourcePath = path.join(root, "watcher-probe.txt")
        writeFileSync(sourcePath, "The filesystem watcher remains active")
        await vi.waitFor(() => {
          expect(changedFiles.map(path.normalize)).toContain(sourcePath)
        })
        await new Promise((resolve) => setTimeout(resolve, 750))
        expect(changedFiles.map(path.normalize)).not.toContain(
          browserConfigPath,
        )
        expect(runner.browserOpen).toBe(false)

        await server.restartBrowser()
        expect(runner.browserOpen).toBe(true)
        expect(configuredWxt!.config.webExt.config.startUrls).toEqual([
          "about:blank",
        ])
        await server.restartBrowser()
        expect(runner.browserOpen).toBe(true)

        await server.restart()
        expect(runner.browserOpen).toBe(false)
        await server.restartBrowser()
        expect(runner.browserOpen).toBe(true)
      } finally {
        await server?.stop()
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
