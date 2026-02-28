import type { BrowserContext, Page, Worker } from "@playwright/test"

import { expect, test } from "~/e2e/fixtures/extensionTest"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { CURRENT_PREFERENCES_VERSION } from "~/services/preferences/migrations/preferencesMigration"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

const logger = createLogger("e2e/changelogOnUpdate")

/**
 * get the service worker, waiting for it if it's not active yet (e.g. right after extension reload)
 */
async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  return (
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }))
  )
}

/**
 * close all pages in the context except the one provided, to ensure a clean slate for testing
 */
async function closeOtherPages(context: BrowserContext, keepPage: Page) {
  const pages = context.pages()
  await Promise.all(
    pages
      .filter((existingPage) => existingPage !== keepPage)
      .map(async (existingPage) => {
        try {
          await existingPage.close()
        } catch (err) {
          logger.error("Failed to close existingPage", getErrorMessage(err))
        }
      }),
  )
}

const UPDATE_LOG_DIALOG_SELECTOR = '[data-testid="update-log-dialog"]'

/**
 * search through open pages in the context to find one that has the update log dialog, which may be opened in either popup or options contexts, and return it for interaction in testing
 */
async function findPageWithUpdateLogDialog(
  context: BrowserContext,
): Promise<Page | null> {
  for (const page of context.pages()) {
    if (page.isClosed()) continue
    if (!page.url().includes("-extension://")) continue

    try {
      const count = await page.locator(UPDATE_LOG_DIALOG_SELECTOR).count()
      if (count > 0) return page
    } catch {
      // ignore pages that may be navigating/closed
    }
  }

  return null
}

/**
 * wait for a page with the update log dialog to appear in the context, which may be opened in either popup or options contexts, and return it for interaction in testing, throwing if it doesn't appear within the timeout
 */
async function waitForUpdateLogDialogPage(
  context: BrowserContext,
  timeoutMs = 60_000,
): Promise<Page> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const page = await findPageWithUpdateLogDialog(context)
    if (page) return page
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  const openPages = context
    .pages()
    .map((p) => p.url())
    .join("\n")

  throw new Error(
    `Timed out waiting for update-log dialog to appear. Open pages:\n${openPages}`,
  )
}

/**
 * remove a key from chrome.storage.local within the service worker context, to ensure clean state for testing
 */
async function removeStorageKey(serviceWorker: Worker, key: string) {
  await serviceWorker.evaluate(async (storageKey) => {
    const chromeApi = (globalThis as any).chrome
    await new Promise<void>((resolve, reject) => {
      chromeApi.storage.local.remove(storageKey, () => {
        const error = chromeApi.runtime?.lastError
        if (error) {
          reject(new Error(error.message))
          return
        }
        resolve()
      })
    })
  }, key)
}

/**
 * set a key-value pair in chrome.storage.local within the service worker context, serializing the value as JSON, to prepare state for testing
 */
async function setPlasmoStorageValue(
  serviceWorker: Worker,
  key: string,
  value: unknown,
) {
  const serialized = JSON.stringify(value)
  await serviceWorker.evaluate(
    async ({ storageKey, storageValue }) => {
      const chromeApi = (globalThis as any).chrome
      await new Promise<void>((resolve, reject) => {
        chromeApi.storage.local.set(
          {
            [storageKey]: storageValue,
          },
          () => {
            const error = chromeApi.runtime?.lastError
            if (error) {
              reject(new Error(error.message))
              return
            }
            resolve()
          },
        )
      })
    },
    { storageKey: key, storageValue: serialized },
  )
}

/**
 * get a raw value from chrome.storage.local within the service worker context without deserializing it, to verify correct storage state during testing
 */
async function getPlasmoStorageRawValue<T>(
  serviceWorker: Worker,
  key: string,
): Promise<T> {
  return await serviceWorker.evaluate(async (storageKey) => {
    const chromeApi = (globalThis as any).chrome
    return await new Promise<T>((resolve, reject) => {
      chromeApi.storage.local.get(storageKey, (stored: Record<string, T>) => {
        const error = chromeApi.runtime?.lastError
        if (error) {
          reject(new Error(error.message))
          return
        }
        resolve(stored[storageKey])
      })
    })
  }, key)
}

test.beforeEach(async ({ page, context }) => {
  page.on("pageerror", (error) => {
    throw error
  })

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      throw new Error(msg.text())
    }
  })

  await context.route(
    "https://llm-metadata.pages.dev/api/index.json",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [] }),
      }),
  )
})

test("shows update log inline once on first UI open after update", async ({
  page,
  context,
  extensionId,
}) => {
  await closeOtherPages(context, page)

  const serviceWorker = await getServiceWorker(context)
  const version = await serviceWorker.evaluate(() => {
    const chromeApi = (globalThis as any).chrome
    return chromeApi.runtime.getManifest().version as string
  })

  await closeOtherPages(context, page)
  await removeStorageKey(serviceWorker, STORAGE_KEYS.USER_PREFERENCES)
  await setPlasmoStorageValue(serviceWorker, STORAGE_KEYS.USER_PREFERENCES, {
    openChangelogOnUpdate: true,
    preferencesVersion: CURRENT_PREFERENCES_VERSION,
  })
  await removeStorageKey(
    serviceWorker,
    STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
  )
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
    version,
  )

  await context.route("**/changelog.html*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Changelog</title><h1>Changelog</h1>",
    })
  })

  // Use a lightweight options route to reduce flakiness from the heavier
  // BasicSettings page mounting all tab panels by default.
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  // Options is heavier than popup and can take a bit longer to mount providers
  // + run the UI-open handler on slower CI machines.
  await expect(page.locator("#root > *")).not.toHaveCount(0, {
    timeout: 30_000,
  })

  const dialogPage = await waitForUpdateLogDialogPage(context, 60_000)
  await expect(dialogPage.locator(UPDATE_LOG_DIALOG_SELECTOR)).toBeVisible()

  await expect
    .poll(() =>
      getPlasmoStorageRawValue(
        serviceWorker,
        STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
      ),
    )
    .toBeUndefined()

  await expect
    .poll(
      () =>
        context.pages().filter((p) => p.url().includes("changelog.html"))
          .length,
    )
    .toBe(0)

  await dialogPage.getByTestId("update-log-dialog-auto-open-toggle").click()
  await expect
    .poll(async () => {
      const raw = await getPlasmoStorageRawValue<unknown>(
        serviceWorker,
        STORAGE_KEYS.USER_PREFERENCES,
      )

      if (typeof raw !== "string") return undefined

      try {
        const prefs = JSON.parse(raw)
        return prefs?.openChangelogOnUpdate
      } catch {
        return undefined
      }
    })
    .toBe(false)

  await dialogPage.getByTestId("update-log-dialog-auto-open-toggle").click()
  await expect
    .poll(async () => {
      const raw = await getPlasmoStorageRawValue<unknown>(
        serviceWorker,
        STORAGE_KEYS.USER_PREFERENCES,
      )

      if (typeof raw !== "string") return undefined

      try {
        const prefs = JSON.parse(raw)
        return prefs?.openChangelogOnUpdate
      } catch {
        return undefined
      }
    })
    .toBe(true)

  await dialogPage.getByTestId("update-log-dialog-close").click()
  await expect(dialogPage.locator(UPDATE_LOG_DIALOG_SELECTOR)).toHaveCount(0)

  await dialogPage.reload()
  await expect(dialogPage.locator(UPDATE_LOG_DIALOG_SELECTOR)).toHaveCount(0)
})

test("shows update log inline in popup once on first UI open after update", async ({
  page,
  context,
  extensionId,
}) => {
  await closeOtherPages(context, page)

  const serviceWorker = await getServiceWorker(context)
  const version = await serviceWorker.evaluate(() => {
    const chromeApi = (globalThis as any).chrome
    return chromeApi.runtime.getManifest().version as string
  })

  await closeOtherPages(context, page)
  await removeStorageKey(serviceWorker, STORAGE_KEYS.USER_PREFERENCES)
  await removeStorageKey(
    serviceWorker,
    STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
  )
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
    version,
  )

  await context.route("**/changelog.html*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Changelog</title><h1>Changelog</h1>",
    })
  })

  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  const dialogPage = await waitForUpdateLogDialogPage(context, 60_000)
  await expect(dialogPage.locator(UPDATE_LOG_DIALOG_SELECTOR)).toBeVisible()

  await expect
    .poll(() =>
      getPlasmoStorageRawValue(
        serviceWorker,
        STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
      ),
    )
    .toBeUndefined()

  await expect
    .poll(
      () =>
        context.pages().filter((p) => p.url().includes("changelog.html"))
          .length,
    )
    .toBe(0)

  await dialogPage.getByTestId("update-log-dialog-close").click()
  await expect(dialogPage.locator(UPDATE_LOG_DIALOG_SELECTOR)).toHaveCount(0)

  await dialogPage.reload()
  await expect(dialogPage.locator(UPDATE_LOG_DIALOG_SELECTOR)).toHaveCount(0)
})

test("does not show update log when disabled, but still consumes pending marker", async ({
  page,
  context,
  extensionId,
}) => {
  await closeOtherPages(context, page)

  const serviceWorker = await getServiceWorker(context)
  const version = await serviceWorker.evaluate(() => {
    const chromeApi = (globalThis as any).chrome
    return chromeApi.runtime.getManifest().version as string
  })

  await closeOtherPages(context, page)
  await removeStorageKey(
    serviceWorker,
    STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
  )
  await setPlasmoStorageValue(serviceWorker, STORAGE_KEYS.USER_PREFERENCES, {
    openChangelogOnUpdate: false,
    preferencesVersion: CURRENT_PREFERENCES_VERSION,
  })
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
    version,
  )

  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(page.locator("#root > *")).not.toHaveCount(0)

  await expect
    .poll(() =>
      getPlasmoStorageRawValue(
        serviceWorker,
        STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
      ),
    )
    .toBeUndefined()

  await expect(page.locator(UPDATE_LOG_DIALOG_SELECTOR)).toHaveCount(0)
  await expect
    .poll(
      () =>
        context.pages().filter((p) => p.url().includes("changelog.html"))
          .length,
    )
    .toBe(0)
})
