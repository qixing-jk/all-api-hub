import type { Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getManifestOptionalPermissions,
  getManifestRequiredPermissions,
  getPlasmoStorageJsonValue,
  getPlasmoStorageRawValue,
  getServiceWorker,
  hasOptionalPermission,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const OPTIONAL_PERMISSIONS_STORAGE_KEY = "optional_permissions_state"
const COOKIE_PERMISSION = "cookies"
const UNLIMITED_STORAGE_PERMISSION = "unlimitedStorage"

async function getLastSeenOptionalPermissions(serviceWorker: Worker) {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    OPTIONAL_PERMISSIONS_STORAGE_KEY,
  )

  if (typeof raw !== "string") return []

  try {
    const parsed = JSON.parse(raw) as { lastSeen?: string[] }
    return parsed.lastSeen ?? []
  } catch {
    return []
  }
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("lets first-use users defer recommended permissions and continue into overview", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?onboarding=permissions#${MENU_ITEM_IDS.OVERVIEW}`,
  )
  await waitForExtensionRoot(page)

  const dialog = page.getByTestId(
    OPTIONS_OVERVIEW_TEST_IDS.permissionOnboardingDialog,
  )
  await expect(dialog).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Welcome to All API Hub" }),
  ).toBeVisible()
  await expect(dialog.getByText("Choose optional permissions")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Allow all recommended permissions" }),
  ).toBeVisible()

  await page
    .getByTestId(OPTIONS_OVERVIEW_TEST_IDS.permissionOnboardingDeferButton)
    .click()

  await expectPermissionOnboardingHidden(page)
  await expect(page).toHaveURL(/options\.html#overview$/)
  await expect(page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.page)).toBeVisible()

  await expect
    .poll(() => getLastSeenOptionalPermissions(serviceWorker))
    .toEqual((await getManifestOptionalPermissions(page)).sort())
})

test("lets users grant and revoke the cookies permission from settings", async ({
  extensionId,
  page,
}) => {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=permissions#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)

  await expect(page.getByRole("heading", { name: "Permissions" })).toBeVisible()

  const cookiesRow = page.locator(`#${COOKIE_PERMISSION}`)
  await expect(cookiesRow).toContainText("Cookie access")

  await expect
    .poll(() => hasOptionalPermission(page, COOKIE_PERMISSION), {
      message: "Cookies permission should start ungranted",
    })
    .toBe(false)
  await expect(cookiesRow.getByText("Not granted")).toBeVisible()

  await cookiesRow.getByRole("button", { name: "Allow (recommended)" }).click()

  await expect
    .poll(() => hasOptionalPermission(page, COOKIE_PERMISSION), {
      message: "Cookies permission should be granted after Allow",
    })
    .toBe(true)
  await expect(cookiesRow.getByText("Granted")).toBeVisible()

  await cookiesRow.getByRole("button", { name: "Revoke" }).click()

  await expect
    .poll(() => hasOptionalPermission(page, COOKIE_PERMISSION), {
      message: "Cookies permission should be revoked after Revoke",
    })
    .toBe(false)
  await expect(cookiesRow.getByText("Not granted")).toBeVisible()
})

test("persists local storage beyond the default quota without another permission prompt", async ({
  extensionId,
  page,
}) => {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=permissions#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)
  expect(await getManifestRequiredPermissions(page)).toContain(
    UNLIMITED_STORAGE_PERMISSION,
  )
  expect(await getManifestOptionalPermissions(page)).not.toContain(
    UNLIMITED_STORAGE_PERMISSION,
  )
  await expect(page.locator(`#${UNLIMITED_STORAGE_PERMISSION}`)).toHaveCount(0)
  expect(
    await page.evaluate(() =>
      chrome.permissions.contains({ permissions: ["unlimitedStorage"] }),
    ),
  ).toBe(true)

  const warnings = await page.evaluate(async () => {
    const manifest = chrome.runtime.getManifest()
    const baseline = {
      ...manifest,
      permissions: manifest.permissions?.filter(
        (permission) => permission !== "unlimitedStorage",
      ),
    }
    return {
      before: await chrome.management.getPermissionWarningsByManifest(
        JSON.stringify(baseline),
      ),
      after: await chrome.management.getPermissionWarningsByManifest(
        JSON.stringify(manifest),
      ),
    }
  })
  expect(warnings.after).toEqual(warnings.before)
  const probeKey = "e2e_unlimited_storage_probe"
  const writeBeyondQuota = () =>
    page.evaluate(async (key) => {
      const chromeApi = (
        globalThis as typeof globalThis & { chrome: typeof chrome }
      ).chrome
      try {
        await chromeApi.storage.local.set({
          [key]: "x".repeat(12 * 1024 * 1024),
        })
        return { saved: true, error: "" }
      } catch (error) {
        return { saved: false, error: String(error) }
      }
    }, probeKey)

  expect(await writeBeyondQuota()).toEqual({ saved: true, error: "" })
  await page.reload()
  await waitForExtensionRoot(page)
  expect(
    await page.evaluate(async (key) => {
      const chromeApi = (
        globalThis as typeof globalThis & { chrome: typeof chrome }
      ).chrome
      const stored = await chromeApi.storage.local.get(key)
      return stored[key]?.length
    }, probeKey),
  ).toBe(12 * 1024 * 1024)

  await page.evaluate(async (key) => {
    const chromeApi = (
      globalThis as typeof globalThis & { chrome: typeof chrome }
    ).chrome
    await chromeApi.storage.local.remove(key)
  }, probeKey)
})

test("saves and reloads retention periods beyond the previous storage limits", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const settings = [
    {
      tab: "balanceHistory",
      section: "balance-history",
      preference: "balanceHistory",
      days: 7300,
    },
    {
      tab: "accountUsage",
      section: "usage-history-sync",
      preference: "usageHistory",
      days: 730,
    },
  ]

  for (const setting of settings) {
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=${setting.tab}&anchor=${setting.section}#${MENU_ITEM_IDS.BASIC}`,
    )
    await waitForExtensionRoot(page)
    const input = page
      .locator(`#${setting.section}-retention-days`)
      .getByRole("spinbutton")
    await expect(input).not.toHaveAttribute("max")
    await input.fill(String(setting.days))
    await page.locator(`#${setting.section}-apply-settings`).click()
    await expect
      .poll(async () => {
        const preferences = await getPlasmoStorageJsonValue<
          Record<string, { retentionDays?: number }>
        >(serviceWorker, STORAGE_KEYS.USER_PREFERENCES)
        return preferences?.[setting.preference]?.retentionDays
      })
      .toBe(setting.days)
    await page.reload()
    await waitForExtensionRoot(page)
    await expect(input).toHaveValue(String(setting.days))
  }
})
