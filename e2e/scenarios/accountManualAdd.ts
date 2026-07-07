import type { Locator, Page, Worker } from "@playwright/test"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  AuthTypeEnum,
  type AccountStorageConfig,
  type SiteAccount,
} from "~/types"
import { extractSessionCookieHeader } from "~/utils/browser/cookieString"
import { expect } from "~~/e2e/fixtures/extensionTest"
import { getPlasmoStorageRawValue } from "~~/e2e/utils/extensionState"
import {
  expectAccountListItemVisible,
  openAccountManagementPage,
} from "~~/e2e/utils/realSite/accountAdd"

type ManualAccountInput = {
  siteName: string
  username: string
  userId: string
  exchangeRate?: string
}

type AccessTokenManualAccountInput = ManualAccountInput & {
  authType: AuthTypeEnum.AccessToken
  accessToken: string
}

type CookieManualAccountInput = ManualAccountInput & {
  authType: AuthTypeEnum.Cookie
  cookieAuthSessionCookie: string
}

type ManualAccountAddInput =
  | AccessTokenManualAccountInput
  | CookieManualAccountInput

export async function readStoredAccounts(
  serviceWorker: Worker,
): Promise<SiteAccount[]> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
  )

  if (typeof raw !== "string") return []

  try {
    const parsed = JSON.parse(raw) as AccountStorageConfig
    return Array.isArray(parsed.accounts) ? parsed.accounts : []
  } catch {
    return []
  }
}

export async function saveManualAccountFromApp(params: {
  page: Page
  extensionId: string
  serviceWorker: Worker
  baseUrl: string
  siteType?: AccountSiteType
  account: ManualAccountAddInput
}): Promise<SiteAccount> {
  const siteType = params.siteType ?? SITE_TYPES.NEW_API

  await openAccountManagementPage({
    page: params.page,
    extensionId: params.extensionId,
  })

  await params.page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton)
    .click()
  const dialog = getManualAccountDialog(params.page)
  await expect(dialog.dialog).toBeVisible()

  await dialog.siteUrlInput.fill(params.baseUrl)
  await selectDialogAuthType(params.page, params.account.authType)
  await params.page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.manualAddButton)
    .click()

  await fillManualAccountForm(dialog, {
    siteType,
    account: params.account,
  })

  await expect(dialog.confirmAddButton).toBeEnabled({ timeout: 30_000 })
  await dialog.confirmAddButton.click()
  await expect(dialog.dialog).toBeHidden({ timeout: 30_000 })

  const savedAccount = await waitForManualSavedAccount({
    serviceWorker: params.serviceWorker,
    siteType,
    baseUrl: params.baseUrl,
    account: params.account,
  })
  await expectAccountListItemVisible(params.page, savedAccount.id)
  return savedAccount
}

export async function refreshAccountRowsAndReadStorage(params: {
  page: Page
  serviceWorker: Worker
  accountIds: string[]
  expectedQuotas: number[]
}) {
  expect(params.accountIds.length).toBe(params.expectedQuotas.length)

  for (const [index, accountId] of params.accountIds.entries()) {
    const row = params.page.getByTestId(
      getAccountManagementListItemTestId(accountId),
    )
    await openAccountRowActionsMenu(row)
    await params.page
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowRefreshMenuItem)
      .click()

    await waitForStoredAccountQuota({
      serviceWorker: params.serviceWorker,
      accountId,
      expectedQuota: params.expectedQuotas[index],
    })
  }

  const accounts = await readStoredAccounts(params.serviceWorker)
  return params.accountIds.map((id) => {
    const account = accounts.find((candidate) => candidate.id === id)
    if (!account) {
      throw new Error(`Refreshed account ${id} was not found`)
    }
    return account
  })
}

async function waitForStoredAccountQuota(params: {
  serviceWorker: Worker
  accountId: string
  expectedQuota: number
}) {
  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(params.serviceWorker)
      const account = accounts.find(
        (candidate) => candidate.id === params.accountId,
      )
      return account?.account_info.quota ?? null
    })
    .toEqual(params.expectedQuota)
}

async function openAccountRowActionsMenu(row: Locator) {
  await row.hover()
  const moreActionsButton = row.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton,
  )
  await expect(moreActionsButton).toBeVisible()
  await moreActionsButton.focus()
  await moreActionsButton.press("Enter")
}

async function waitForManualSavedAccount(params: {
  serviceWorker: Worker
  siteType: AccountSiteType
  baseUrl: string
  account: ManualAccountAddInput
}): Promise<SiteAccount> {
  let savedAccount: SiteAccount | null = null

  await expect
    .poll(
      async () => {
        savedAccount =
          (await readStoredAccounts(params.serviceWorker)).find((account) => {
            if (
              account.site_type !== params.siteType ||
              account.site_url !== params.baseUrl ||
              account.authType !== params.account.authType
            ) {
              return false
            }

            if (params.account.authType === AuthTypeEnum.AccessToken) {
              return (
                account.account_info.id === params.account.userId &&
                account.account_info.access_token === params.account.accessToken
              )
            }

            return (
              account.cookieAuth?.sessionCookie ===
              extractSessionCookieHeader(params.account.cookieAuthSessionCookie)
            )
          }) ?? null

        return savedAccount
      },
      { timeout: 30_000 },
    )
    .not.toBeNull()

  return savedAccount!
}

function getManualAccountDialog(page: Page) {
  const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)

  return {
    dialog,
    siteUrlInput: dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput),
    siteNameInput: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput,
    ),
    siteTypeTrigger: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger,
    ),
    authTypeTrigger: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.authTypeTrigger,
    ),
    usernameInput: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.usernameInput,
    ),
    userIdInput: dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput),
    accessTokenInput: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput,
    ),
    confirmAddButton: dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton,
    ),
  }
}

async function fillManualAccountForm(
  dialog: ReturnType<typeof getManualAccountDialog>,
  params: {
    siteType: AccountSiteType
    account: ManualAccountAddInput
  },
) {
  await selectByTriggerDataAttribute({
    trigger: dialog.siteTypeTrigger,
    expectedAttribute: "data-site-type",
    value: params.siteType,
  })
  await dialog.siteNameInput.fill(params.account.siteName)
  await dialog.usernameInput.fill(params.account.username)
  await dialog.userIdInput.fill(params.account.userId)
  await dialog.dialog
    .getByPlaceholder("Please enter exchange rate")
    .fill(params.account.exchangeRate ?? "7")

  if (params.account.authType === AuthTypeEnum.AccessToken) {
    await dialog.accessTokenInput.fill(params.account.accessToken)
    return
  }

  await dialog.dialog
    .getByPlaceholder("Paste Cookie header value")
    .fill(params.account.cookieAuthSessionCookie)
}

async function selectDialogAuthType(page: Page, authType: AuthTypeEnum) {
  const trigger = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.authTypeTrigger)
  await selectByTriggerDataAttribute({
    trigger,
    expectedAttribute: "data-auth-type",
    value: authType,
    optionName:
      authType === AuthTypeEnum.Cookie
        ? "Cookie Authentication"
        : "Access Token Authentication",
  })
}

async function selectByTriggerDataAttribute(params: {
  trigger: Locator
  expectedAttribute: string
  value: string
  optionName?: string
}) {
  if (
    (await params.trigger.getAttribute(params.expectedAttribute)) ===
    params.value
  ) {
    return
  }

  await params.trigger.click()
  await params.trigger
    .page()
    .getByRole("option", { name: params.optionName ?? params.value })
    .click()
  await expect(params.trigger).toHaveAttribute(
    params.expectedAttribute,
    params.value,
  )
}
