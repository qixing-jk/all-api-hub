import fs from "node:fs"
import path from "node:path"
import { defineConfig } from "@playwright/test"

loadPlaywrightEnvFiles()

const isCI = !!process.env.CI

export default defineConfig({
  testDir: "./e2e",
  projects: [
    {
      name: "chromium",
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
  workers: isCI ? 1 : undefined,
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

/**
 * Load local `.env` files for Playwright runs without introducing a new
 * dependency. Existing process env values still win over file values.
 */
function loadPlaywrightEnvFiles() {
  for (const fileName of [".env", ".env.local"]) {
    const filePath = path.resolve(process.cwd(), fileName)
    if (!fs.existsSync(filePath)) {
      continue
    }

    const fileContents = fs.readFileSync(filePath, "utf8")
    for (const line of fileContents.split(/\r?\n/u)) {
      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue
      }

      const separatorIndex = trimmedLine.indexOf("=")
      if (separatorIndex <= 0) {
        continue
      }

      const rawKey = trimmedLine.slice(0, separatorIndex).trim()
      if (!rawKey || rawKey in process.env) {
        continue
      }

      const rawValue = trimmedLine.slice(separatorIndex + 1).trim()
      process.env[rawKey] = stripWrappingQuotes(rawValue)
    }
  }
}

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}
