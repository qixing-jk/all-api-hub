import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "vite"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ConfigEnv } from "wxt"

import wxtConfig from "~~/wxt.config"

/** Build an in-memory module through the application's effective Vite settings. */
async function buildFixture(
  command: ConfigEnv["command"],
  mode = "development",
  source = 'console.log("memory-fixture")',
) {
  if (typeof wxtConfig.vite !== "function")
    throw new Error("Expected Vite factory")
  const config = await wxtConfig.vite({
    command,
    browser: "chrome",
    manifestVersion: 3,
    mode,
  })
  const id = path.resolve("memory-fixture.js")
  const result = await build({
    ...config,
    mode,
    configFile: false,
    logLevel: "silent",
    resolve: {
      alias: { "~": path.resolve("src") },
    },
    plugins: [
      {
        name: "fixture",
        resolveId: (source) => (source === id ? id : undefined),
        load: (moduleId) => (moduleId === id ? source : undefined),
      },
      ...(config.plugins ?? []),
    ],
    build: {
      ...config.build,
      write: false,
      rolldownOptions: {
        input: id,
        preserveEntrySignatures: "strict",
        output: { codeSplitting: false },
      },
    },
  })
  if (Array.isArray(result) || !("output" in result))
    throw new Error("Expected one build output")
  const chunk = result.output.find((output) => output.type === "chunk")
  if (!chunk || chunk.type !== "chunk")
    throw new Error("Expected fixture chunk")
  return { chunk, id }
}

describe("WXT build output", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("preserves the existing browser baseline when Vite defaults change", async () => {
    if (typeof wxtConfig.vite !== "function")
      throw new Error("Expected Vite factory")
    const config = await wxtConfig.vite({
      command: "build",
      browser: "firefox",
      manifestVersion: 3,
      mode: "production",
    })
    expect(config.build?.target).toEqual([
      "chrome107",
      "edge107",
      "firefox104",
      "safari16",
    ])
  })

  it("preserves native module metadata, executable output, maps and rebuild dependencies in development", async () => {
    const { chunk, id } = await buildFixture("serve")
    expect(chunk.modules[id]?.code).toContain('console.log("memory-fixture")')
    expect(chunk.code).toContain('console.log("memory-fixture")')
    expect(chunk.map?.sources).toHaveLength(1)
    expect(chunk.moduleIds).toContain(id)
    expect(chunk.modules[id]?.renderedLength).toBeGreaterThan(0)
  })

  it("preserves per-module rendered code for standalone builds", async () => {
    const { chunk, id } = await buildFixture("build")
    expect(chunk.modules[id]?.code).toContain('console.log("memory-fixture")')
  })

  it.each([false, true])(
    "preserves release module metadata with requested source maps %s",
    async (sourcemap) => {
      vi.stubEnv("NODE_ENV", "production")
      vi.stubEnv("AAH_BUILD_SOURCEMAP", sourcemap ? "1" : "0")
      const { chunk, id } = await buildFixture("build", "production")
      expect(chunk.code).toContain("memory-fixture")
      expect(chunk.code.trim().split("\n")).toHaveLength(sourcemap ? 2 : 1)
      expect(chunk.moduleIds).toContain(id)
      expect(chunk.modules[id]?.renderedLength).toBeGreaterThan(0)
      expect(chunk.modules[id]?.code).toContain("memory-fixture")
      if (sourcemap) {
        expect(chunk.map?.sources).toHaveLength(1)
      } else {
        expect(chunk.map).toBeNull()
      }
    },
  )

  it("renders animated statistics from the minified release bundle", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const { chunk } = await buildFixture(
      "build",
      "production",
      `import { createElement } from "react";
       import { renderToStaticMarkup } from "react-dom/server";
       import { AnimatedStatValue } from "~/entrypoints/popup/components/AnimatedStatValue";
       export const markup = renderToStaticMarkup(createElement(AnimatedStatValue, {
         value: 123, size: "md", isInitialLoad: false,
       }));`,
    )
    const directory = await mkdtemp(path.join(tmpdir(), "wxt-build-output-"))
    try {
      const modulePath = path.join(directory, "fixture.mjs")
      await writeFile(modulePath, chunk.code)
      const { markup } = await import(pathToFileURL(modulePath).href)
      expect(markup).toContain("<span>0</span>")
      expect(markup).toContain("text-2xl")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
