import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { AccountStorageConfig, SiteAccount } from "~/types"
import { expect } from "~~/e2e/fixtures/extensionTest"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

function getAccountAddDialog(page: Page) {
  const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)

  return {
    dialog,
    siteUrlInput: dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput),
    autoDetectButton: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton,
    ),
    siteNameInput: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput,
    ),
    siteTypeTrigger: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger,
    ),
    usernameInput: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.usernameInput,
    ),
    userIdInput: dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput),
    accessTokenInput: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput,
    ),
    sub2apiRefreshTokenSwitch: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiRefreshTokenSwitch,
    ),
    sub2apiImportSessionButton: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiImportSessionButton,
    ),
    sub2apiRefreshTokenInput: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiRefreshTokenInput,
    ),
    confirmAddButton: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton,
    ),
  }
}

export async function openAccountManagementPage(params: {
  page: Page
  extensionId: string
}) {
  await params.page.goto(
    `chrome-extension://${params.extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(params.page)
  await expectPermissionOnboardingHidden(params.page)
}

async function openAccountAddDialog(page: Page) {
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()

  const dialog = getAccountAddDialog(page)
  await expect(dialog.dialog).toBeVisible()
  return dialog
}

export async function autoDetectAccountFromAddDialog(
  page: Page,
  baseUrl: string,
) {
  const dialog = await openAccountAddDialog(page)
  await dialog.siteUrlInput.fill(baseUrl)
  await dialog.autoDetectButton.click()
  return dialog
}

export async function waitForSavedAccount(params: {
  serviceWorker: ServiceWorker
  siteType: string
  baseUrl: string
  timeoutMs?: number
}) {
  let savedAccount: SiteAccount | null = null

  await expect
    .poll(
      async () => {
        savedAccount = await readSavedAccount(
          params.serviceWorker,
          params.siteType,
          params.baseUrl,
        )
        return savedAccount
      },
      {
        timeout: params.timeoutMs ?? 60_000,
      },
    )
    .not.toBeNull()

  return savedAccount!
}

export async function expectAccountListItemVisible(
  page: Page,
  accountId: string,
  timeoutMs = 60_000,
) {
  await expect(
    page.getByTestId(getAccountManagementListItemTestId(accountId)),
  ).toBeVisible({ timeout: timeoutMs })
}

async function readSavedAccount(
  serviceWorker: ServiceWorker,
  siteType: string,
  baseUrl: string,
): Promise<SiteAccount | null> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
  )

  if (typeof raw !== "string") {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as AccountStorageConfig
    const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : []
    return (
      accounts.find(
        (account) =>
          account.site_type === siteType && account.site_url === baseUrl,
      ) ?? null
    )
  } catch {
    return null
  }
}
