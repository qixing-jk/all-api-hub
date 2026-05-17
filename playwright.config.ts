import { defineConfig } from "@playwright/test"

import { loadPlaywrightEnvFiles } from "./e2e/utils/playwrightEnv"

loadPlaywrightEnvFiles()

const isCI = !!process.env.CI
const localWorkerCount = Number(process.env.AAH_E2E_WORKERS ?? 4)
const workers = isCI
  ? 1
  : Number.isFinite(localWorkerCount)
    ? localWorkerCount
    : 4

export default defineConfig({
  testDir: "./e2e",
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
  reporter: isCI
    ? [
        ["github"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : [["list"]],
  use: {
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: isCI ? "retain-on-failure" : "off",
  },
  outputDir: "test-results",
})
