import path from "node:path"
import { beforeAll, describe, expect, it, vi } from "vitest"
import type { ConfigEnv } from "wxt"

import { atIndex } from "~~/tests/test-utils/indexedAccess"
import wxtConfig from "~~/wxt.config"

/**
 * WXT loads this config through jiti, which cannot resolve the `~/` source
 * aliases. Vite imports are hoisted and evaluated for every command, so an
 * aliased import inside the config graph breaks release builds too; this suite
 * covers what the factories produce, not how they are loaded.
 */
const SERVE_ENV: ConfigEnv = {
  command: "serve",
  browser: "chrome",
  manifestVersion: 3,
  mode: "development",
}
const BUILD_ENV: ConfigEnv = {
  ...SERVE_ENV,
  command: "build",
  mode: "production",
}

async function resolveManifest(env: ConfigEnv) {
  const manifest = wxtConfig.manifest
  if (typeof manifest !== "function") {
    throw new Error("Expected a manifest factory in wxt.config.ts")
  }

  return await manifest(env)
}

async function resolveViteDefine(env: ConfigEnv) {
  const vite = wxtConfig.vite
  if (typeof vite !== "function") {
    throw new Error("Expected a vite factory in wxt.config.ts")
  }

  const resolved = await vite(env)

  return (resolved.define ?? {}) as Record<string, string>
}

describe("development build identity baking", () => {
  beforeAll(() => {
    // The vite factory logs the build mode on every resolution.
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  it("bakes the project and output paths for dev builds", async () => {
    const define = await resolveViteDefine(SERVE_ENV)
    const baked = JSON.parse(atIndex(define, "__AAH_DEV_IDENTITY__"))

    expect(baked.projectPath).toBe(path.resolve(process.cwd()))
    expect(baked.outputPath).toBe(
      path.resolve(process.cwd(), ".output", "chrome-mv3-dev"),
    )
    expect(baked.browserTarget).toBe("chrome")
    expect(Number.isNaN(Date.parse(baked.builtAt))).toBe(false)
  })

  it("names dev builds after their checkout so local builds differ", async () => {
    const manifest = await resolveManifest(SERVE_ENV)

    expect(manifest.name).toContain("(dev)")
    expect(manifest.name).toContain(path.basename(process.cwd()))
    expect(manifest.description).toContain(path.resolve(process.cwd()))
  })

  it("bakes no identity and keeps the localized name for release builds", async () => {
    const define = await resolveViteDefine(BUILD_ENV)
    const manifest = await resolveManifest(BUILD_ENV)

    expect(atIndex(define, "__AAH_DEV_IDENTITY__")).toBe("null")
    expect(manifest.name).toBe("__MSG_manifest_name__")
    expect(manifest.description).toBe("__MSG_manifest_description__")
  })
})
