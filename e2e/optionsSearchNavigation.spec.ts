import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import { SHIELD_SETTINGS_TARGET_IDS } from "~/features/BasicSettings/components/tabs/Refresh/searchTargets"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import { WEBDAV_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { PROTECTION_BYPASS_AUTOMATIC_FEATURES } from "~/services/protectionBypass/contracts"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageJsonValue,
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

async function readRecentSearchItemIds(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<string[]> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.RECENT_ITEM_IDS,
  )

  if (typeof raw !== "string") {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

async function readProductAnalyticsPreferences(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<{ enabled?: boolean; updatedAt?: number } | null> {
  return await getPlasmoStorageJsonValue<{
    enabled?: boolean
    updatedAt?: number
  }>(serviceWorker, STORAGE_KEYS.PRODUCT_ANALYTICS_PREFERENCES)
}

test("opens a common options page from settings search", async ({
  extensionId,
  page,
}) => {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByRole("button", { name: "Open settings search" }).click()

  const dialog = page.getByRole("dialog", { name: "Search settings" })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder("Search settings...").fill("import")
  await dialog
    .getByRole("option", { name: /Import\/Export/ })
    .first()
    .click()

  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/options\.html#importExport$/)
  await expect(
    page.getByRole("heading", { name: "Import/Export" }),
  ).toBeVisible()
})

test("navigates between common options pages from the sidebar", async ({
  extensionId,
  page,
}) => {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page
      .getByTestId(BASIC_SETTINGS_TEST_IDS.page)
      .getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible()

  await page
    .getByRole("navigation", { name: "Settings Options" })
    .getByRole("button", { name: "Import/Export" })
    .click()

  await expect(page).toHaveURL(/options\.html#importExport$/)
  await expect(
    page.getByRole("heading", { name: "Import/Export" }),
  ).toBeVisible()
  await expect(page.getByText("Full Export")).toBeVisible()
})

test("opens a searched settings control and preserves its tab and anchor in the URL", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    autoRefresh: true,
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.keyboard.press("Control+K")

  const dialog = page.getByRole("dialog", { name: "Search settings" })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder("Search settings...").fill("refresh interval")
  await dialog
    .getByRole("option", { name: /Refresh Interval/ })
    .first()
    .click()

  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/options\.html\?.*#basic$/)

  await expect
    .poll(() => {
      const url = new URL(page.url())
      return {
        hash: url.hash,
        tab: url.searchParams.get("tab"),
        anchor: url.searchParams.get("anchor"),
      }
    })
    .toEqual({
      hash: "#basic",
      tab: "refresh",
      anchor: "refresh-interval",
    })

  await expect(
    page.getByRole("button", { name: "Data Refresh" }),
  ).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("Refresh Interval").first()).toBeVisible()
})

test("opens automatic check-in verification assistance from settings search and persists its feature control", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const initialAutomaticFeatureBypass = {
    ...DEFAULT_PREFERENCES.tempWindowFallback!.automaticFeatureBypass,
    [PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin]: false,
  }
  const persistedAutomaticFeatureBypass = {
    ...initialAutomaticFeatureBypass,
    [PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin]: true,
  }

  await seedUserPreferences(serviceWorker, {
    tempWindowFallback: {
      ...DEFAULT_PREFERENCES.tempWindowFallback!,
      enabled: false,
      automaticFeatureBypass: initialAutomaticFeatureBypass,
      tempContextMode: TEMP_CONTEXT_MODES.Tab,
    },
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByRole("button", { name: "Open settings search" }).click()

  const dialog = page.getByRole("dialog", { name: "Search settings" })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder("Search settings...").fill("check-in")
  await dialog
    .getByRole("option", {
      name: /^Check-in Settings \/ Data Refresh \/ Website verification assistance$/,
    })
    .click()

  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/options\.html\?.*#basic$/)
  await expect
    .poll(() => {
      const url = new URL(page.url())
      return {
        hash: url.hash,
        tab: url.searchParams.get("tab"),
        anchor: url.searchParams.get("anchor"),
        highlight: url.searchParams.get("highlight"),
      }
    })
    .toEqual({
      hash: "#basic",
      tab: "refresh",
      anchor:
        SHIELD_SETTINGS_TARGET_IDS.feature[
          PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin
        ],
      highlight: null,
    })

  await expect(
    page.locator(
      `#${
        SHIELD_SETTINGS_TARGET_IDS.feature[
          PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin
        ]
      }`,
    ),
  ).toBeInViewport()

  const masterToggle = page
    .locator(`#${SHIELD_SETTINGS_TARGET_IDS.enabled}`)
    .getByRole("switch", { name: "Toggle" })
  const checkinFeatureToggle = page.getByRole("checkbox", { name: "Check-in" })

  await expect(masterToggle).toHaveAttribute("aria-checked", "false")
  await expect(checkinFeatureToggle).toBeEnabled()
  await expect(checkinFeatureToggle).not.toBeChecked()

  await checkinFeatureToggle.click()
  await expect(checkinFeatureToggle).toBeChecked()
  await expect
    .poll(async () =>
      getPlasmoStorageJsonValue<{
        tempWindowFallback?: {
          enabled?: boolean
          automaticFeatureBypass?: Record<string, boolean>
          tempContextMode?: string
        }
      }>(serviceWorker, STORAGE_KEYS.USER_PREFERENCES),
    )
    .toMatchObject({
      tempWindowFallback: {
        enabled: false,
        automaticFeatureBypass: persistedAutomaticFeatureBypass,
        tempContextMode: TEMP_CONTEXT_MODES.Tab,
      },
    })

  await page.reload()
  await waitForExtensionRoot(page)

  await expect(masterToggle).toHaveAttribute("aria-checked", "false")
  await expect(checkinFeatureToggle).toBeChecked()
})

test("opens product analytics from settings search and persists opt-out", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByRole("button", { name: "Open settings search" }).click()

  const dialog = page.getByRole("dialog", { name: "Search settings" })
  await expect(dialog).toBeVisible()
  await dialog
    .getByPlaceholder("Search settings...")
    .fill("anonymous product analytics")
  await dialog
    .getByRole("option", { name: /Enable anonymous product analytics/ })
    .first()
    .click()

  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/options\.html\?.*#basic$/)
  await expect
    .poll(() => {
      const url = new URL(page.url())
      return {
        hash: url.hash,
        tab: url.searchParams.get("tab"),
        anchor: url.searchParams.get("anchor"),
      }
    })
    .toEqual({
      hash: "#basic",
      tab: "general",
      anchor: SETTINGS_ANCHORS.PRODUCT_ANALYTICS_ENABLED,
    })

  await expect(
    page.locator(`#${SETTINGS_ANCHORS.PRODUCT_ANALYTICS_ENABLED}`),
  ).toBeInViewport()
  const productAnalyticsSwitch = page
    .locator(`#${SETTINGS_ANCHORS.PRODUCT_ANALYTICS}`)
    .getByRole("switch", { name: "Toggle" })
  await expect(productAnalyticsSwitch).toHaveAttribute("aria-checked", "true")

  await productAnalyticsSwitch.click()

  await expect
    .poll(async () => {
      const preferences = await readProductAnalyticsPreferences(serviceWorker)

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

  await expect(
    page
      .locator(`#${SETTINGS_ANCHORS.PRODUCT_ANALYTICS}`)
      .getByRole("switch", { name: "Toggle" }),
  ).toHaveAttribute("aria-checked", "false")
})

test("opens an import export WebDAV control from settings search", async ({
  extensionId,
  page,
}) => {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByRole("button", { name: "Open settings search" }).click()

  const dialog = page.getByRole("dialog", { name: "Search settings" })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder("Search settings...").fill("webdav url")
  await dialog
    .getByRole("option", { name: /Webdav URL/ })
    .filter({ hasText: "Import/Export" })
    .click()

  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/options\.html\?.*#importExport$/)

  await expect
    .poll(() => {
      const url = new URL(page.url())
      return {
        hash: url.hash,
        anchor: url.searchParams.get("anchor"),
        highlight: url.searchParams.get("highlight"),
      }
    })
    .toEqual({
      hash: "#importExport",
      anchor: WEBDAV_TARGET_IDS.url,
      highlight: null,
    })

  await expect(page.locator(`#${WEBDAV_TARGET_IDS.url}`)).toBeInViewport()
})

test("persists selected settings search results as recent items across page reloads", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByRole("button", { name: "Open settings search" }).click()

  const dialog = page.getByRole("dialog", { name: "Search settings" })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder("Search settings...").fill("full export")
  await dialog
    .getByRole("option", { name: /Full Export/ })
    .first()
    .click()

  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/options\.html\?.*#importExport$/)

  await expect
    .poll(() => readRecentSearchItemIds(serviceWorker))
    .toEqual(["control:export-full-backup"])

  await page.reload()
  await waitForExtensionRoot(page)

  await page.getByRole("button", { name: "Open settings search" }).click()

  const reopenedDialog = page.getByRole("dialog", { name: "Search settings" })
  await expect(reopenedDialog).toBeVisible()
  await expect(
    reopenedDialog.getByRole("group", { name: "Recent" }),
  ).toBeVisible()
  await expect(
    reopenedDialog.getByRole("option", { name: /Full Export/ }),
  ).toBeVisible()
})
