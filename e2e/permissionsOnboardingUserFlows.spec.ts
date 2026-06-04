import type { Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getManifestOptionalPermissions,
  getPlasmoStorageRawValue,
  getServiceWorker,
  hasOptionalPermission,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const OPTIONAL_PERMISSIONS_STORAGE_KEY = "optional_permissions_state"
const COOKIE_PERMISSION = "cookies"

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
  await expect(dialog.getByText("What these permissions do")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Allow recommended permissions" }),
  ).toBeVisible()

  await page.getByRole("button", { name: "Maybe later" }).click()

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
  await expect(cookiesRow).toContainText("Cookies")

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
