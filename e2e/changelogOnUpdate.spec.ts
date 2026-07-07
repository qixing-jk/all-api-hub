import type { BrowserContext, Page } from "@playwright/test"

import { UPDATE_LOG_DIALOG_TEST_IDS } from "~/components/dialogs/UpdateLogDialog/testIds"
import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { CURRENT_PREFERENCES_VERSION } from "~/services/preferences/migrations/preferencesMigration"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  closeOtherPages,
  getPlasmoStorageRawValue,
  getServiceWorker,
  removePlasmoStorageKey,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"

const UPDATE_LOG_DIALOG_SELECTOR = `[data-testid="${UPDATE_LOG_DIALOG_TEST_IDS.root}"]`

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
  timeoutMs = 30_000,
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
  await removePlasmoStorageKey(serviceWorker, STORAGE_KEYS.USER_PREFERENCES)
  await setPlasmoStorageValue(serviceWorker, STORAGE_KEYS.USER_PREFERENCES, {
    openChangelogOnUpdate: true,
    preferencesVersion: CURRENT_PREFERENCES_VERSION,
  })
  await removePlasmoStorageKey(
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
  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)

  // Options is heavier than popup and can take a bit longer to mount providers
  // + run the UI-open handler on slower CI machines.
  await expect(page.locator("#root > *")).not.toHaveCount(0, {
    timeout: 30_000,
  })

  const dialogPage = await waitForUpdateLogDialogPage(context)
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

  await dialogPage
    .getByTestId(UPDATE_LOG_DIALOG_TEST_IDS.autoOpenToggle)
    .click()
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

  await dialogPage
    .getByTestId(UPDATE_LOG_DIALOG_TEST_IDS.autoOpenToggle)
    .click()
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

  await dialogPage.getByTestId(UPDATE_LOG_DIALOG_TEST_IDS.closeButton).click()
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
  await removePlasmoStorageKey(serviceWorker, STORAGE_KEYS.USER_PREFERENCES)
  await removePlasmoStorageKey(
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

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)

  const dialogPage = await waitForUpdateLogDialogPage(context)
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

  await dialogPage.getByTestId(UPDATE_LOG_DIALOG_TEST_IDS.closeButton).click()
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
  await removePlasmoStorageKey(
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

  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
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
