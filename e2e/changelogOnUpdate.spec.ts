import type { BrowserContext, Page, Worker } from "@playwright/test"

import { expect, test } from "~/e2e/fixtures/extensionTest"
import { STORAGE_KEYS } from "~/services/storageKeys"
import { getChangelogAnchorId } from "~/utils/changelogAnchor"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

const logger = createLogger("e2e/changelogOnUpdate")

/**
 *
 */
async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  return (
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }))
  )
}

/**
 *
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
 *
 */
async function removeStorageKey(serviceWorker: Worker, key: string) {
  await serviceWorker.evaluate(async (storageKey) => {
    const chromeApi = (globalThis as any).chrome
    await chromeApi.storage.local.remove(storageKey)
  }, key)
}

/**
 *
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
 *
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

test.beforeEach(({ page }) => {
  page.on("pageerror", (error) => {
    throw error
  })

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      throw new Error(msg.text())
    }
  })
})

test("opens changelog once on first UI open after update", async ({
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
    .poll(
      () =>
        context.pages().filter((p) => p.url().includes("changelog.html"))
          .length,
    )
    .toBe(1)

  const changelogPage = context
    .pages()
    .find((p) => p.url().includes("changelog.html"))
  expect(changelogPage, "Expected changelog tab to be opened").toBeTruthy()

  const changelogTab = changelogPage!
  expect(changelogTab.url()).toContain(`#${getChangelogAnchorId(version)}`)

  await changelogTab.waitForLoadState("domcontentloaded")

  await changelogTab.close()

  await expect
    .poll(() =>
      getPlasmoStorageRawValue(
        serviceWorker,
        STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
      ),
    )
    .toBeUndefined()
  const unexpectedChangelogRequest = (async () => {
    try {
      return await context.waitForEvent("request", {
        timeout: 2_000,
        predicate: (request) => request.url().includes("changelog.html"),
      })
    } catch {
      return null
    }
  })()
  await page.reload()
  const secondChangelogRequest = await unexpectedChangelogRequest
  expect(secondChangelogRequest).toBeNull()
})

test("does not open changelog tab when disabled, but still consumes pending marker", async ({
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

  const changelogRequests: string[] = []
  await context.route("**/changelog.html*", async (route) => {
    changelogRequests.push(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Changelog</title><h1>Changelog</h1>",
    })
  })

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

  expect(changelogRequests.length).toBe(0)
})
