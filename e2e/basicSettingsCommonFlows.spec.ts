import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

async function readStoredPreferences(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<Record<string, unknown>> {
  return (
    (await getPlasmoStorageJsonValue<Record<string, unknown>>(
      serviceWorker,
      STORAGE_KEYS.USER_PREFERENCES,
    )) ?? {}
  )
}

async function expectStoredPreference(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  key: string,
  value: unknown,
) {
  await expect
    .poll(async () => {
      const preferences = await readStoredPreferences(serviceWorker)
      return preferences[key]
    })
    .toEqual(value)
}

function normalizeActionPopupPath(popup: string): string {
  if (!popup) return ""

  try {
    const url = new URL(popup)
    return url.protocol === "chrome-extension:"
      ? url.pathname.replace(/^\//, "")
      : popup
  } catch {
    return popup
  }
}

async function getConfiguredActionPopupPath(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<string> {
  const popup = await serviceWorker.evaluate(async () => {
    const chromeApi = (globalThis as any).chrome

    return await new Promise<string>((resolve, reject) => {
      chromeApi.action.getPopup({}, (popup: string) => {
        const error = chromeApi.runtime?.lastError
        if (error) {
          reject(new Error(error.message))
          return
        }
        resolve(popup)
      })
    })
  })

  return normalizeActionPopupPath(popup)
}

async function expectConfiguredActionPopup(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  expectedPopup: string,
) {
  await expect
    .poll(async () => getConfiguredActionPopupPath(serviceWorker))
    .toBe(expectedPopup)
}

async function hasSidePanelOpenSupport(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<boolean> {
  return await serviceWorker.evaluate(() => {
    const chromeApi = (globalThis as any).chrome
    return typeof chromeApi?.sidePanel?.open === "function"
  })
}

async function hasActionClickListeners(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<boolean> {
  return await serviceWorker.evaluate(() => {
    const chromeApi = (globalThis as any).chrome
    return Boolean(chromeApi.action?.onClicked?.hasListeners?.())
  })
}

async function expectActionClickListenerState(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  expectedHasListeners: boolean,
) {
  await expect
    .poll(async () => hasActionClickListeners(serviceWorker))
    .toBe(expectedHasListeners)
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("persists an options setting through extension storage and reload", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    currencyType: "USD",
    activeTab: "cashflow",
    showTodayCashflow: true,
    themeMode: "system",
    actionClickBehavior: "popup",
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)

  await page.getByRole("button", { name: "CNY (¥)" }).click()
  await expectStoredPreference(serviceWorker, "currencyType", "CNY")
  await expect(page.getByRole("button", { name: "CNY (¥)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  await page.reload()
  await waitForExtensionRoot(page)

  await expect(page.getByRole("button", { name: "CNY (¥)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
})

test("persists product analytics opt-out through dedicated storage and reload", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)

  const productAnalyticsSection = page.locator("#product-analytics")
  await expect(productAnalyticsSection).toBeVisible()

  const productAnalyticsSwitch = productAnalyticsSection.getByRole("switch", {
    name: "Toggle",
  })
  await expect(productAnalyticsSwitch).toBeEnabled()
  await expect(productAnalyticsSwitch).toHaveAttribute("aria-checked", "true")

  await productAnalyticsSwitch.click()

  await expect
    .poll(async () => {
      const preferences = await getPlasmoStorageJsonValue<{
        enabled?: boolean
        updatedAt?: number
      }>(serviceWorker, STORAGE_KEYS.PRODUCT_ANALYTICS_PREFERENCES)

      return {
        enabled: preferences?.enabled,
        hasUpdatedAt: typeof preferences?.updatedAt === "number",
      }
    })
    .toEqual({
      enabled: false,
      hasUpdatedAt: true,
    })
  await expect(productAnalyticsSwitch).toHaveAttribute("aria-checked", "false")

  await page.reload()
  await waitForExtensionRoot(page)

  const reloadedProductAnalyticsSwitch = page
    .locator("#product-analytics")
    .getByRole("switch", { name: "Toggle" })
  await expect(reloadedProductAnalyticsSwitch).toBeEnabled()
  await expect(reloadedProductAnalyticsSwitch).toHaveAttribute(
    "aria-checked",
    "false",
  )
})

test("updates toolbar action behavior from settings into the live extension action", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    actionClickBehavior: "popup",
  })

  await expectConfiguredActionPopup(serviceWorker, POPUP_PAGE_PATH)
  await expectActionClickListenerState(serviceWorker, false)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)

  await page.getByRole("button", { name: "Side panel" }).click()

  await expectStoredPreference(
    serviceWorker,
    "actionClickBehavior",
    "sidepanel",
  )
  const sidePanelOpenSupported = await hasSidePanelOpenSupport(serviceWorker)
  await expectConfiguredActionPopup(
    serviceWorker,
    sidePanelOpenSupported ? "" : POPUP_PAGE_PATH,
  )
  await expectActionClickListenerState(serviceWorker, sidePanelOpenSupported)

  await page.getByRole("button", { name: "Popup" }).click()

  await expectStoredPreference(serviceWorker, "actionClickBehavior", "popup")
  await expectConfiguredActionPopup(serviceWorker, POPUP_PAGE_PATH)
  await expectActionClickListenerState(serviceWorker, false)
})
