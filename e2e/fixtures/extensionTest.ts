import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test as base, expect as baseExpect, chromium } from "@playwright/test"

import { stubSponsorRemoteCatalog } from "~~/e2e/utils/commonUserFlows"
import { getE2eExtensionDirName } from "~~/e2e/utils/e2eBuildVariants"
import {
  assertBuiltExtensionExists,
  getExtensionIdFromServiceWorker,
} from "~~/e2e/utils/extension"
import { buildExtensionLaunchOptions } from "~~/e2e/utils/extensionLaunch"

type ExtensionFixtures = {
  extensionId: string
  extensionDir: string
}

export const test = base.extend<ExtensionFixtures>({
  extensionDir: async ({ browserName }, run) => {
    void browserName
    const extensionDir = process.env.AAH_EXTENSION_DIR
      ? path.resolve(process.cwd(), process.env.AAH_EXTENSION_DIR)
      : path.resolve(process.cwd(), ".output", getE2eExtensionDirName())
    await assertBuiltExtensionExists(extensionDir)
    await run(extensionDir)
  },

  context: async (
    {
      contextOptions,
      deviceScaleFactor,
      extensionDir,
      locale,
      timezoneId,
      viewport,
    },
    run,
    testInfo,
  ) => {
    const headless = testInfo.project.use.headless ?? true
    const reusableUserDataDir = process.env.AAH_E2E_USER_DATA_DIR
      ? path.resolve(process.cwd(), process.env.AAH_E2E_USER_DATA_DIR)
      : null
    const userDataDir =
      reusableUserDataDir ??
      (await fs.mkdtemp(
        path.join(os.tmpdir(), `all-api-hub-e2e-${testInfo.workerIndex}-`),
      ))

    const chromeExecutablePath = process.env.AAH_E2E_CHROME_EXECUTABLE_PATH
      ? path.resolve(process.cwd(), process.env.AAH_E2E_CHROME_EXECUTABLE_PATH)
      : null
    const launchOptions = buildExtensionLaunchOptions({
      extensionDir,
      headless,
      chromeExecutablePath,
    })

    let context:
      | Awaited<ReturnType<typeof chromium.launchPersistentContext>>
      | undefined

    try {
      context = await chromium.launchPersistentContext(userDataDir, {
        ...contextOptions,
        ...launchOptions,
        deviceScaleFactor,
        locale,
        timezoneId,
        viewport,
      })
      await stubSponsorRemoteCatalog(context)

      await run(context)
    } finally {
      try {
        await context?.close()
      } catch (error) {
        console.warn("Failed to close persistent context", error)
      }

      try {
        if (!reusableUserDataDir) {
          await fs.rm(userDataDir, { recursive: true, force: true })
        }
      } catch (error) {
        console.warn(`Failed to remove userDataDir '${userDataDir}'`, error)
      }
    }
  },
  extensionId: async ({ context }, run) => {
    const extensionId = await getExtensionIdFromServiceWorker(context)
    await run(extensionId)
  },
})

export const expect = baseExpect
