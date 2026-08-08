import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test as base, expect as baseExpect, chromium } from "@playwright/test"

import { stubSponsorRemoteCatalog } from "~~/e2e/utils/commonUserFlows"
import { getE2eExtensionDirName } from "~~/e2e/utils/e2eBuildVariants"
import {
  assertBuiltExtensionExists,
  getExtensionIdFromServiceWorker,
  getExtensionServiceWorker,
  resolveExtensionServiceWorkerTimeoutMs,
} from "~~/e2e/utils/extension"
import {
  buildExtensionLaunchOptions,
  launchExtensionContextWithStartupRetry,
} from "~~/e2e/utils/extensionLaunch"

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
    const temporaryUserDataDirs: string[] = []

    const chromeExecutablePath = process.env.AAH_E2E_CHROME_EXECUTABLE_PATH
      ? path.resolve(process.cwd(), process.env.AAH_E2E_CHROME_EXECUTABLE_PATH)
      : null
    const extensionServiceWorkerTimeoutMs =
      resolveExtensionServiceWorkerTimeoutMs(
        process.env.AAH_E2E_EXTENSION_STARTUP_TIMEOUT_MS,
      )
    const launchOptions = buildExtensionLaunchOptions({
      extensionDir,
      headless,
      chromeExecutablePath,
    })
    const originalTestTimeoutMs = testInfo.timeout

    // Preserve unlimited timeouts while extending finite test-body budgets for
    // one bounded fresh-context retry during extension startup.
    if (originalTestTimeoutMs > 0) {
      testInfo.setTimeout(
        originalTestTimeoutMs + extensionServiceWorkerTimeoutMs * 2,
      )
    }

    let context:
      | Awaited<ReturnType<typeof chromium.launchPersistentContext>>
      | undefined

    try {
      const startupStartedAt = Date.now()

      context = await launchExtensionContextWithStartupRetry({
        launch: async (attempt) => {
          const userDataDir =
            reusableUserDataDir ??
            (await fs.mkdtemp(
              path.join(
                os.tmpdir(),
                `all-api-hub-e2e-${testInfo.workerIndex}-${attempt}-`,
              ),
            ))

          if (!reusableUserDataDir) {
            temporaryUserDataDirs.push(userDataDir)
          }

          return await chromium.launchPersistentContext(userDataDir, {
            ...contextOptions,
            ...launchOptions,
            deviceScaleFactor,
            locale,
            timezoneId,
            viewport,
          })
        },
        waitForReady: async (candidateContext) => {
          await Promise.all([
            stubSponsorRemoteCatalog(candidateContext),
            getExtensionServiceWorker(candidateContext, {
              timeoutMs: extensionServiceWorkerTimeoutMs,
            }),
          ])
        },
        onRetry: (error, attempt) => {
          console.warn(
            `Extension service worker startup failed on attempt ${attempt}; retrying with a fresh context`,
            error,
          )
        },
      })

      if (originalTestTimeoutMs > 0) {
        testInfo.setTimeout(
          originalTestTimeoutMs + (Date.now() - startupStartedAt),
        )
      }

      await run(context)
    } finally {
      try {
        await context?.close()
      } catch (error) {
        console.warn("Failed to close persistent context", error)
      }

      for (const userDataDir of temporaryUserDataDirs) {
        try {
          await fs.rm(userDataDir, { recursive: true, force: true })
        } catch (error) {
          console.warn(`Failed to remove userDataDir '${userDataDir}'`, error)
        }
      }
    }
  },
  extensionId: async ({ context }, run) => {
    const extensionId = await getExtensionIdFromServiceWorker(context)
    await run(extensionId)
  },
})

export const expect = baseExpect
