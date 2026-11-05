import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"

vi.mock("~~/e2e/utils/playwrightEnv", () => ({
  loadPlaywrightEnvFiles: vi.fn(),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

it("uses the compatibility Chrome for ordinary page fixtures with modern headless", async () => {
  vi.stubEnv("AAH_E2E_CHROME_EXECUTABLE_PATH", "compat/chrome")
  const { default: config } = await import("~~/playwright.config")
  expect(
    config.projects?.find((project) => project.name === "chromium")?.use
      ?.launchOptions,
  ).toMatchObject({
    executablePath: path.resolve("compat/chrome"),
    args: ["--headless=new"],
    ignoreDefaultArgs: ["--headless"],
  })
})

it("keeps Playwright browser selection when no compatibility binary is configured", async () => {
  vi.stubEnv("AAH_E2E_CHROME_EXECUTABLE_PATH", "")
  const { default: config } = await import("~~/playwright.config")
  expect(
    config.projects?.find((project) => project.name === "chromium")?.use
      ?.launchOptions,
  ).toBeUndefined()
})
