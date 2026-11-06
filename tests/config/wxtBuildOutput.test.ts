import path from "node:path"
import { build } from "vite"
import { describe, expect, it } from "vitest"
import type { ConfigEnv } from "wxt"

import wxtConfig from "~~/wxt.config"

async function buildFixture(command: ConfigEnv["command"]) {
  if (typeof wxtConfig.vite !== "function")
    throw new Error("Expected Vite factory")
  const config = await wxtConfig.vite({
    command,
    browser: "chrome",
    manifestVersion: 3,
    mode: "development",
  })
  const id = path.resolve("memory-fixture.js")
  const result = await build({
    configFile: false,
    logLevel: "silent",
    plugins: [
      {
        name: "fixture",
        resolveId: (source) => (source === id ? id : undefined),
        load: (source) =>
          source === id ? 'console.log("memory-fixture")' : undefined,
      },
      ...(config.plugins ?? []),
    ],
    build: {
      write: false,
      minify: false,
      sourcemap: true,
      rolldownOptions: { input: id },
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
})
