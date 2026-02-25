import type { BrowserContext, Page, Worker } from "@playwright/test"

import { expect, test } from "~/e2e/fixtures/extensionTest"
import { STORAGE_KEYS } from "~/services/storageKeys"
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

/**
 * remove a key from chrome.storage.local within the service worker context, to ensure clean state for testing
 */
async function removeStorageKey(serviceWorker: Worker, key: string) {
  await serviceWorker.evaluate(async (storageKey) => {
    const chromeApi = (globalThis as any).chrome
    await chromeApi.storage.local.remove(storageKey)
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
      await chromeApi.storage.local.set({
        [storageKey]: storageValue,
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
    const stored = await chromeApi.storage.local.get(storageKey)
    return stored[storageKey]
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

  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await expect
    .poll(() => page.locator('[data-testid="update-log-dialog"]').count())
    .toBe(1)

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

  await page.getByTestId("update-log-dialog-auto-open-toggle").click()
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

  await page.getByTestId("update-log-dialog-auto-open-toggle").click()
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

  await page.getByLabel("Close").click()
  await expect(page.locator('[data-testid="update-log-dialog"]')).toHaveCount(0)

  await page.reload()
  await expect(page.locator('[data-testid="update-log-dialog"]')).toHaveCount(0)
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

  await expect
    .poll(() => page.locator('[data-testid="update-log-dialog"]').count())
    .toBe(1)

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

  await page.getByLabel("Close").click()
  await expect(page.locator('[data-testid="update-log-dialog"]')).toHaveCount(0)

  await page.reload()
  await expect(page.locator('[data-testid="update-log-dialog"]')).toHaveCount(0)
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

  await expect(page.locator('[data-testid="update-log-dialog"]')).toHaveCount(0)
  await expect
    .poll(
      () =>
        context.pages().filter((p) => p.url().includes("changelog.html"))
          .length,
    )
    .toBe(0)
})
