import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test as base, expect as baseExpect, chromium } from "@playwright/test"

import {
  assertBuiltExtensionExists,
  getExtensionIdFromServiceWorker,
} from "../utils/extension"

type ExtensionFixtures = {
  extensionId: string
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({ browserName }, run, testInfo) => {
    if (browserName !== "chromium") {
      throw new Error(`E2E smoke only supports Chromium, got '${browserName}'.`)
    }

    const extensionDir = path.resolve(process.cwd(), ".output", "chrome-mv3")
    await assertBuiltExtensionExists(extensionDir)

    const headless = testInfo.project.use.headless ?? true
    const userDataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), `all-api-hub-e2e-${testInfo.workerIndex}-`),
    )

    const args = [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      "--no-default-browser-check",
      "--no-first-run",
    ]

    const launchOptions = {
      headless,
      args,
      ignoreDefaultArgs: ["--disable-extensions"],
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
      ...launchOptions,
      ...(headless ? { channel: "chromium" } : {}),
    })

    await run(context)
    await context.close()
  },
  extensionId: async ({ context }, run) => {
    const extensionId = await getExtensionIdFromServiceWorker(context)
    await run(extensionId)
  },
})

export const expect = baseExpect
