import { defineConfig } from "@playwright/test"

import { loadPlaywrightEnvFiles } from "./e2e/utils/playwrightEnv"

loadPlaywrightEnvFiles()

// Playwright supplies the runner/assertions; Selenium launches real Firefox
// with the MV2 extension and the existing RDP adapter inspects its popup.
export default defineConfig({
  testDir: "./e2e/firefox",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/firefox/globalSetup.ts",
  projects: [{ name: "firefox-extension" }],
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never", outputFolder: "playwright-report/firefox" }],
      ]
    : [["list"]],
  outputDir: "test-results/firefox",
})
