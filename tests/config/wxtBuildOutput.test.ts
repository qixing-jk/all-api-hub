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
  entrypoint?: string,
  codeSplitting = false,
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
    define: {
      ...config.define,
      ...(entrypoint
        ? { "import.meta.env.ENTRYPOINT": JSON.stringify(entrypoint) }
        : {}),
    },
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
        output: { codeSplitting },
      },
    },
  })
  if (Array.isArray(result) || !("output" in result))
    throw new Error("Expected one build output")
  const chunks = result.output.filter((output) => output.type === "chunk")
  const chunk = chunks.find((output) => output.isEntry)
  if (!chunk || chunk.type !== "chunk")
    throw new Error("Expected fixture chunk")
  return { chunk, chunks, id }
}

describe("WXT build output", () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    ["managed model filtering", "~/services/apiAdapters/registry"],
    [
      "account verification",
      "~/features/Verification/api/useVerifyApiDialogViewModel",
    ],
    [
      "profile verification",
      "~/features/ApiCredentialProfiles/verification/useProfileVerification",
    ],
  ])(
    "loads probe execution only when %s runs",
    async (_label, entry) => {
      vi.stubEnv("NODE_ENV", "production")
      const { chunk, chunks } = await buildFixture(
        "build",
        "production",
        `export * from "${entry}";`,
        "html",
        true,
      )
      const initial = new Set([chunk.fileName])
      for (const fileName of initial) {
        for (const imported of chunks.find(
          (candidate) => candidate.fileName === fileName,
        )?.imports ?? [])
          initial.add(imported)
      }
      const executesProbes = (id: string) =>
        /\/(?:aiApiVerification\/apiVerificationService|modelQuality\/(?:pelican|questionAnswer|contextCapacityRun))\.ts$/u.test(
          id.replaceAll("\\", "/"),
        )
      expect(
        chunks
          .filter((candidate) => initial.has(candidate.fileName))
          .flatMap((candidate) => candidate.moduleIds)
          .some(executesProbes),
      ).toBe(false)
      expect(
        chunks
          .filter((candidate) => !initial.has(candidate.fileName))
          .flatMap((candidate) => candidate.moduleIds)
          .some(executesProbes),
      ).toBe(true)
    },
    60_000,
  )

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

  it("keeps the guest JavaScript runtime out of delegated verification controls", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const { chunk } = await buildFixture(
      "build",
      "production",
      `export { useVerificationTools } from "~/features/Verification/api/useVerificationTools";`,
    )
    expect(chunk.moduleIds.some((id) => id.includes("quickjs"))).toBe(false)
  })

  it("keeps the analytics SDK out of content-side facts", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const { chunk } = await buildFixture(
      "build",
      "production",
      `export * from "~/services/productAnalytics/facts/shieldBypassSummary";
       export * from "~/services/productAnalytics/facts/sponsorRecommendationsSummary";`,
      "content",
    )
    expect(chunk.moduleIds.filter((id) => id.includes("posthog-js"))).toEqual(
      [],
    )
  })

  it.each([
    ["delegated controls", "~/features/Verification/api/useVerificationTools"],
    ["content entry", "~/entrypoints/content/index"],
    [
      "webpage controller",
      "~/features/WebAiApiCheck/content/modal/useApiCheckModalViewModel",
    ],
    ["webpage view", "~/features/WebAiApiCheck/content/modal/ApiCheckModal"],
  ])(
    "keeps provider execution out of %s",
    async (_label, entry) => {
      vi.stubEnv("NODE_ENV", "production")
      const { chunk } = await buildFixture(
        "build",
        "production",
        entry.endsWith("/content/index")
          ? `export { default } from "${entry}";`
          : `export * from "${entry}";`,
        "content",
      )
      expect(
        chunk.moduleIds.filter((id) =>
          /node_modules\/(?:ai|@ai-sdk\/(?:openai|anthropic|google))\/dist\//u.test(
            id.replaceAll("\\", "/"),
          ),
        ),
      ).toEqual([])
    },
    60_000,
  )
})
