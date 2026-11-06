import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { optimizeDeps, resolveConfig } from "vite"
import { expect, it } from "vitest"

import wxtConfig from "~~/wxt.config"

it("scans extension entries without importing dependencies from nested checkouts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "aah-dependency-scan-"))
  if (!root.startsWith(path.join(tmpdir(), "aah-dependency-scan-")))
    throw new Error("Unexpected fixture path")
  try {
    for (const [entry, dependency] of [
      ["src/entrypoints/options/index.html", "app-runtime"],
      ["diagnostics-results/checkout/index.html", "foreign-runtime"],
    ] as const) {
      const html = path.join(root, entry)
      await mkdir(path.dirname(html), { recursive: true })
      await writeFile(
        html,
        `<script type="module">import "${dependency}"</script>`,
      )
      const packageDir = path.join(root, "node_modules", dependency)
      await mkdir(packageDir, { recursive: true })
      await writeFile(
        path.join(packageDir, "package.json"),
        JSON.stringify({ name: dependency, main: "index.js" }),
      )
      await writeFile(path.join(packageDir, "index.js"), "module.exports = {}")
    }
    if (typeof wxtConfig.vite !== "function")
      throw new Error("Expected Vite config factory")
    const config = await wxtConfig.vite({
      command: "serve",
      browser: "chrome",
      manifestVersion: 3,
      mode: "development",
    })
    const resolved = await resolveConfig(
      {
        root,
        cacheDir: path.join(root, ".vite"),
        configFile: false,
        logLevel: "silent",
        optimizeDeps: config.optimizeDeps,
      },
      "serve",
    )
    const metadata = await optimizeDeps(resolved, true)
    expect(metadata.optimized["app-runtime"]).toBeDefined()
    expect(metadata.optimized["foreign-runtime"]).toBeUndefined()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
