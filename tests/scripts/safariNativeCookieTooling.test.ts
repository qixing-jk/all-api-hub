import { spawnSync } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"

// @ts-expect-error Native validation tooling is authored as executable JS.
import { startOwnedFixture } from "~~/e2e/safariNativeCookie/fixtureLifecycle.mjs"
// @ts-expect-error Native validation tooling is authored as executable JS.
import { prepareInstrumentedExtension } from "~~/e2e/safariNativeCookie/prepare.mjs"

const temporaryRoots: string[] = []
const temporaryRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "safari-cookie-tooling-"))
  temporaryRoots.push(root)
  return root
}
afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

it("instruments a run copy without contaminating the release build", () => {
  const root = temporaryRoot()
  const source = path.join(root, "release")
  fs.mkdirSync(source)
  const files = {
    "manifest.json": JSON.stringify({
      name: "All API Hub",
      permissions: ["nativeMessaging"],
      background: { scripts: ["background.js"] },
    }),
    "options.html": "<html><body>Options</body></html>",
    "background.js": "release background",
  }
  for (const [name, contents] of Object.entries(files))
    fs.writeFileSync(path.join(source, name), contents)
  const probe = path.join(root, "probe.js")
  fs.writeFileSync(probe, "validation probe")
  const output = path.join(root, "runs", "unique-run", "extension")
  prepareInstrumentedExtension({
    source,
    output,
    probe,
    appName: "Independent Safari trial",
  })

  expect(fs.readdirSync(source).sort()).toEqual(Object.keys(files).sort())
  for (const [name, contents] of Object.entries(files))
    expect(fs.readFileSync(path.join(source, name), "utf8")).toBe(contents)
  expect(
    JSON.parse(fs.readFileSync(path.join(output, "manifest.json"), "utf8")),
  ).toMatchObject({
    name: "Independent Safari trial",
    background: { scripts: ["background.js", "native-probe.js"] },
  })
  expect(fs.readFileSync(path.join(output, "options.html"), "utf8")).toContain(
    '<script src="native-probe.js"></script></body>',
  )
  expect(fs.readFileSync(path.join(output, "native-probe.js"), "utf8")).toBe(
    "validation probe",
  )
  expect(fs.readFileSync(path.join(output, "background.js"), "utf8")).toBe(
    files["background.js"],
  )
})

describe("owned fixture lifecycle", () => {
  it("leaves existing CLI evidence untouched when its port cannot be acquired", async () => {
    const occupied = http.createServer()
    await new Promise<void>((resolve, reject) => {
      occupied.once("error", (error: NodeJS.ErrnoException) =>
        error.code === "EADDRINUSE" ? resolve() : reject(error),
      )
      occupied.listen(41672, "127.0.0.1", resolve)
    })
    const output = path.join(temporaryRoot(), "observations.json")
    const previous = JSON.stringify({ priorEvidence: true })
    fs.writeFileSync(output, previous)
    try {
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(
            new URL("../../e2e/safariNativeCookie/server.mjs", import.meta.url),
          ),
        ],
        {
          env: {
            ...process.env,
            AAH_SAFARI_REAL_TOKEN: "",
            SAFARI_NATIVE_OBSERVATIONS: output,
          },
          encoding: "utf8",
          timeout: 5000,
        },
      )
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain("Fixture startup failed")
      expect(fs.readFileSync(output, "utf8")).toBe(previous)
    } finally {
      if (occupied.listening)
        await new Promise<void>((resolve) => occupied.close(() => resolve()))
    }
  })

  it("does not provision users when the local port is occupied", async () => {
    const occupied = http.createServer()
    await new Promise<void>((resolve) =>
      occupied.listen(0, "127.0.0.1", resolve),
    )
    const address = occupied.address() as { port: number }
    const prepare = vi.fn()
    const server = http.createServer()
    const lifecycle = startOwnedFixture(server, {
      port: address.port,
      prepare,
      onPrepared: vi.fn(),
      onCleanup: vi.fn(),
    })
    try {
      await expect(lifecycle.ready).rejects.toMatchObject({
        code: "EADDRINUSE",
      })
      expect(prepare).not.toHaveBeenCalled()
      expect(server.listening).toBe(false)
    } finally {
      await lifecycle.close()
      await new Promise<void>((resolve) => occupied.close(() => resolve()))
    }
  })

  it("waits for provisioning and cleans once when shutdown happens during setup", async () => {
    let finish!: (fixture: { cleanup: () => Promise<void> }) => void
    let began!: () => void
    const started = new Promise<void>((resolve) => {
      began = resolve
    })
    const prepared = new Promise((resolve) => {
      finish = resolve
    })
    const cleanup = vi.fn(async () => {})
    const onPrepared = vi.fn()
    const onCleanup = vi.fn()
    const server = http.createServer()
    const lifecycle = startOwnedFixture(server, {
      port: 0,
      prepare: () => {
        expect(server.listening).toBe(true)
        began()
        return prepared
      },
      onPrepared,
      onCleanup,
    })
    await started
    const closed = lifecycle.close()
    expect(lifecycle.close()).toBe(closed)
    expect(cleanup).not.toHaveBeenCalled()
    finish({ cleanup })
    await closed
    await lifecycle.ready
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(onPrepared).not.toHaveBeenCalled()
    expect(onCleanup).toHaveBeenCalledWith(true)
    expect(server.listening).toBe(false)
  })

  it("closes the listener on setup failure and does not claim confirmed cleanup", async () => {
    const onCleanup = vi.fn()
    const server = http.createServer()
    const lifecycle = startOwnedFixture(server, {
      port: 0,
      prepare: async () => {
        throw new Error("setup failed")
      },
      onPrepared: vi.fn(),
      onCleanup,
    })
    await expect(lifecycle.ready).rejects.toThrow("setup failed")
    expect(server.listening).toBe(false)
    expect(onCleanup).toHaveBeenCalledWith(false)
  })

  it("reports an unsuccessful cleanup instead of swallowing the failure", async () => {
    const cleanup = vi.fn(async () => {
      throw new Error("cleanup failed")
    })
    const onCleanup = vi.fn()
    const server = http.createServer()
    const lifecycle = startOwnedFixture(server, {
      port: 0,
      prepare: async () => ({ cleanup }),
      onPrepared: vi.fn(),
      onCleanup,
    })
    await lifecycle.ready
    await expect(lifecycle.close()).rejects.toThrow("cleanup failed")
    expect(server.listening).toBe(false)
    expect(onCleanup).toHaveBeenCalledWith(false)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})

describe("converter project configuration", () => {
  const script = fileURLToPath(
    new URL(
      "../../scripts/configure-safari-native-cookie-project.py",
      import.meta.url,
    ),
  )
  const projectFixture = (contents: string) => {
    const root = temporaryRoot()
    const handler = path.join(root, "SafariWebExtensionHandler.swift")
    const project = path.join(root, "project.pbxproj")
    fs.writeFileSync(handler, "original converter handler")
    fs.writeFileSync(project, contents)
    return { root, handler, project }
  }

  it("configures both app identities and outbound network entitlements", () => {
    const fixture = projectFixture(
      '// 独立 Cookie 扩展 — 测试\nPRODUCT_BUNDLE_IDENTIFIER = old.app;\nPRODUCT_BUNDLE_IDENTIFIER = "old.app.Extension";\nENABLE_APP_SANDBOX = YES;\n',
    )
    const result = spawnSync(
      "python3",
      [script, fixture.root, "test.independent.safari"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          LC_ALL: "C",
          PYTHONUTF8: "0",
          PYTHONCOERCECLOCALE: "0",
        },
      },
    )
    expect(result.status, result.stderr).toBe(0)
    const configured = fs.readFileSync(fixture.project, "utf8")
    expect(configured).toContain("// 独立 Cookie 扩展 — 测试")
    expect(configured).toContain(
      'PRODUCT_BUNDLE_IDENTIFIER = "test.independent.safari";',
    )
    expect(configured).toContain(
      'PRODUCT_BUNDLE_IDENTIFIER = "test.independent.safari.Extension";',
    )
    expect(configured).toContain("ENABLE_OUTGOING_NETWORK_CONNECTIONS = YES;")
    expect(fs.readFileSync(fixture.handler, "utf8")).toContain("URLSession")
  })

  it("keeps the host and extension installable on supported macOS versions", () => {
    const fixture = projectFixture(
      [
        "PRODUCT_BUNDLE_IDENTIFIER = old.app;",
        "ENABLE_APP_SANDBOX = YES;",
        "MACOSX_DEPLOYMENT_TARGET = 26.6;",
        "MACOSX_DEPLOYMENT_TARGET = 12.0;",
        "IPHONEOS_DEPLOYMENT_TARGET = 18.0;",
      ].join("\n"),
    )
    const result = spawnSync(
      "python3",
      [script, fixture.root, "test.independent.safari"],
      { encoding: "utf8" },
    )
    expect(result.status, result.stderr).toBe(0)
    const configured = fs.readFileSync(fixture.project, "utf8")
    expect(configured.match(/MACOSX_DEPLOYMENT_TARGET = 12\.0;/g)).toHaveLength(
      2,
    )
    expect(configured).not.toContain("MACOSX_DEPLOYMENT_TARGET = 26.6;")
    expect(configured).toContain("IPHONEOS_DEPLOYMENT_TARGET = 18.0;")
  })

  it.each([
    "PRODUCT_BUNDLE_IDENTIFIER = old.app;",
    "ENABLE_APP_SANDBOX = YES;",
  ])(
    "rejects incomplete converter settings before changing either file (%s)",
    (contents) => {
      const fixture = projectFixture(contents)
      const result = spawnSync(
        "python3",
        [script, fixture.root, "test.independent.safari"],
        { encoding: "utf8" },
      )
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(
        "lacks expected bundle identifier or sandbox settings",
      )
      expect(fs.readFileSync(fixture.project, "utf8")).toBe(contents)
      expect(fs.readFileSync(fixture.handler, "utf8")).toBe(
        "original converter handler",
      )
    },
  )
})
