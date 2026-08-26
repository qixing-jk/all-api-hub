import { defineConfig } from "@playwright/test"

import { loadPlaywrightEnvFiles } from "./e2e/utils/playwrightEnv"

loadPlaywrightEnvFiles()

const isCI = !!process.env.CI
const isRealSiteE2E = !!process.env.AAH_E2E_REAL_SITE_CATEGORY
const configuredWorkerCount = Number(process.env.AAH_E2E_WORKERS)
const workers =
  Number.isInteger(configuredWorkerCount) && configuredWorkerCount > 0
    ? configuredWorkerCount
    : isCI
      ? 1
      : 4

// The default smoke suite only covers specs that can actually run without
// per-target environment secrets or a dedicated manifest build variant:
// - e2e/realSite/** skips at runtime without real-site credentials and is run
//   by the scheduled Real-Site E2E workflow with its own matrix.
// - e2e/dnrRequired/** skips outside the dnr-required build variant and is run
//   by the e2e:dnr-required script in the same workflow.
// Excluding them keeps shard distribution even instead of assigning runners a
// block of guaranteed skips.
const smokeOnlyTestIgnore =
  process.env.AAH_E2E_SMOKE_ONLY === "1"
    ? [/e2e[\\/]realSite/u, /e2e[\\/]dnrRequired/u]
    : []

export default defineConfig({
  testDir: "./e2e",
  testIgnore: smokeOnlyTestIgnore,
  projects: [
    {
      name: "build",
      testMatch: /setup\/build\.setup\.ts/u,
    },
    {
      name: "chromium",
      dependencies: ["build"],
      use: {
        browserName: "chromium",
      },
    },
  ],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  retries: isCI ? 1 : 0,
  // Each E2E worker launches a persistent Chromium context with the extension.
  // Keeping local concurrency bounded avoids service-worker startup/teardown
  // timeouts on machines with many logical CPUs.
  workers,
  reporter:
    isCI && !isRealSiteE2E
      ? [
          ["github"],
          ["html", { open: "never", outputFolder: "playwright-report" }],
        ]
      : [["list"]],
  use: {
    headless: true,
    screenshot: "only-on-failure",
    // Real-site traces and videos can capture authenticated requests, cookies,
    // response bodies, and credentials rendered by the extension.
    trace: isRealSiteE2E ? "off" : "on-first-retry",
    video: isCI && !isRealSiteE2E ? "retain-on-failure" : "off",
  },
  outputDir: "test-results",
})
