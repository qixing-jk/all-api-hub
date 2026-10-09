#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium, request } from "@playwright/test"

import { runScenarioWithCleanup } from "../e2e/utils/scenarioErrors.ts"
import {
  assertDevBrowserProfile,
  findInstalledDevExtension,
} from "./cdp/browser-runtime.mjs"
import { connectExtensionById, defaultCdpUrl } from "./cdp/client.mjs"
import { applyIsolateFlag, isIsolatedDevProfile } from "./cdp/dev-profile.mjs"
import { createMagpieNativeClient } from "./suites/magpie/native.mjs"
import { runMagpieUiScenario } from "./suites/magpie/ui.mjs"
import { resolveMagpieUpstream } from "./suites/magpie/upstream.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

const args = process.argv.slice(2).filter((arg) => arg !== "--")
const options = {
  suite: "probe",
  write: false,
  envFile: undefined,
  extensionDir: ".output/chrome-mv3",
  evidenceDir: undefined,
}
for (const arg of args) {
  if (arg.startsWith("--suite=")) options.suite = arg.slice(8)
  else if (arg.startsWith("--env-file=")) options.envFile = arg.slice(11)
  else if (arg.startsWith("--extension-dir="))
    options.extensionDir = arg.slice(16)
  else if (arg.startsWith("--evidence-dir="))
    options.evidenceDir = path.resolve(arg.slice(15))
  else if (arg === "--write") options.write = true
  else if (arg === "--isolate") continue
  else if (arg === "--help" || arg === "-h") {
    console.log(
      "Magpie: --suite=probe|ui|all|key-pool (default probe); --write required for UI; --isolate required for UI; --env-file=path; --extension-dir=path (default .output/chrome-mv3); --evidence-dir=path for local screenshots. Configuration: AAH_E2E_MAGPIE_BASE_URL, AAH_E2E_MAGPIE_WEB_KEY, shared AAH_E2E_UPSTREAM_BASE_URL and AAH_E2E_UPSTREAM_API_KEY for model sync. No management mutations in probe mode.",
    )
    process.exit(0)
  } else throw new Error(`Unknown argument: ${arg}`)
}
loadLocalEnv({ envFile: options.envFile })
applyIsolateFlag(args)
if (!["probe", "ui", "all", "key-pool"].includes(options.suite))
  throw new Error("Invalid suite")
if (options.suite !== "probe" && (!options.write || !isIsolatedDevProfile()))
  throw new Error(
    "UI mutations require --write and --isolate; launch pnpm browser:cdp:isolate -- --prod first",
  )
const config = {
  baseUrl: process.env.AAH_E2E_MAGPIE_BASE_URL?.trim(),
  webKey: process.env.AAH_E2E_MAGPIE_WEB_KEY?.trim(),
}
if (!config.baseUrl || !config.webKey)
  throw new Error(
    "Configure AAH_E2E_MAGPIE_BASE_URL and AAH_E2E_MAGPIE_WEB_KEY",
  )
const nativeRequest = await request.newContext()
let fixture
let dev
let page
await runScenarioWithCleanup({
  run: async () => {
    const native = await createMagpieNativeClient(nativeRequest, config)
    const inventory = await native.inventory()
    console.log(
      `PASS native authentication and inventory (${inventory.length} providers; no credentials printed)`,
    )
    if (options.suite === "probe") return
    const cdpUrl = process.env.CDP_URL || defaultCdpUrl()
    const raw = await chromium.connectOverCDP(cdpUrl)
    let extensionId
    try {
      await assertDevBrowserProfile(raw)
      extensionId = await findInstalledDevExtension(raw, options.extensionDir)
    } finally {
      await raw.close()
    }
    dev = await connectExtensionById({ cdpUrl, extensionId })
    page = await dev.context.newPage()
    page.setDefaultTimeout(15_000)
    const captures = []
    if (options.evidenceDir)
      await mkdir(options.evidenceDir, { recursive: true })
    fixture = await resolveMagpieUpstream(config.baseUrl)
    const scenarios =
      options.suite === "key-pool"
        ? ["key-pool"]
        : ["management", "imports", "model-sync", "key-pool"]
    for (const scenario of scenarios) {
      if (scenario === "model-sync" && !fixture.config) {
        console.log(
          "SKIP model sync: configure AAH_E2E_UPSTREAM_BASE_URL and AAH_E2E_UPSTREAM_API_KEY reachable by the remote backend",
        )
        continue
      }
      await runMagpieUiScenario({
        page,
        extensionId,
        native,
        config,
        upstream: fixture.config,
        scenario,
        onCheck: (name) => console.log(`PASS ${name}`),
        onCapture: options.evidenceDir
          ? async (name, locator) => {
              const filename = `${scenario}-${name}.png`
              await locator.screenshot({
                path: path.join(options.evidenceDir, filename),
                animations: "disabled",
              })
              captures.push({
                filename,
                capturedAt: new Date().toISOString(),
                scenario,
                viewport: page.viewportSize(),
                assertion: "passed",
              })
              await writeFile(
                path.join(options.evidenceDir, "index.json"),
                JSON.stringify(
                  {
                    commit: execFileSync("git", ["rev-parse", "HEAD"], {
                      encoding: "utf8",
                    }).trim(),
                    workingTreeChanges: execFileSync(
                      "git",
                      ["status", "--short"],
                      { encoding: "utf8" },
                    ).trim(),
                    extensionId,
                    extensionDir: path.resolve(options.extensionDir),
                    deployment: config.baseUrl,
                    captures,
                  },
                  null,
                  2,
                ),
              )
            }
          : undefined,
      })
      console.log(
        `PASS ${scenario} cleanup (gateway, credentials, preferences, cookies, language)`,
      )
    }
  },
  finalizers: [
    async () => page?.close(),
    async () => dev?.close(),
    async () => fixture?.close(),
    () => nativeRequest.dispose(),
  ],
  cleanupMessage: "Magpie CDP infrastructure cleanup failed",
  failureMessage: "Magpie CDP run failed",
})
