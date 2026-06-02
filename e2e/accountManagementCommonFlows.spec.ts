import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import {
  createDefaultAccountStorageConfig,
  normalizeAccountStorageConfigForWrite,
} from "~/services/accounts/accountDefaults"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { AccountStorageConfig, SiteAccount } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const ACCOUNT_QUICK_CHECKIN_E2E_STATE_KEY =
  "__aah_account_quick_checkin_e2e_state__"

type AccountQuickCheckinRuntimeState = {
  calls: Array<{
    type: string
    accountIds: string[]
  }>
}

type RuntimeLike = {
  sendMessage?: (message: unknown) => Promise<unknown>
}

async function readStoredAccountConfig(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<AccountStorageConfig> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
  )

  if (typeof raw !== "string") {
    return createDefaultAccountStorageConfig()
  }

  try {
    return JSON.parse(raw) as AccountStorageConfig
  } catch {
    return createDefaultAccountStorageConfig()
  }
}

async function readStoredAccounts(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<SiteAccount[]> {
  const config = await readStoredAccountConfig(serviceWorker)
  return Array.isArray(config.accounts) ? config.accounts : []
}

async function seedStoredAccountConfig(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  config: Partial<AccountStorageConfig>,
) {
  const now = Date.now()
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
    normalizeAccountStorageConfigForWrite(
      {
        ...createDefaultAccountStorageConfig(now),
        ...config,
      },
      now,
    ),
  )
}

function getAccountRow(page: Page, accountName: string) {
  return page
    .getByTestId(new RegExp(`^${getAccountManagementListItemTestId("")}`))
    .filter({ hasText: accountName })
}

async function getAccountButtonY(page: Page, accountName: string) {
  const box = await page
    .getByRole("button", { name: accountName })
    .first()
    .boundingBox()

  if (!box) {
    throw new Error(`Could not resolve account row for ${accountName}`)
  }

  return box.y
}

async function openAccountActionsMenu(page: Page, accountName: string) {
  const row = getAccountRow(page, accountName)
  await row.hover()
  await row
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
    .click()
}

async function readAccountQuickCheckinRuntimeState(
  page: Page,
): Promise<AccountQuickCheckinRuntimeState> {
  return await page.evaluate((stateKey) => {
    try {
      const raw = window.sessionStorage.getItem(stateKey)
      return raw
        ? (JSON.parse(raw) as AccountQuickCheckinRuntimeState)
        : { calls: [] }
    } catch {
      return { calls: [] }
    }
  }, ACCOUNT_QUICK_CHECKIN_E2E_STATE_KEY)
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("disables and re-enables a stored account from account management", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "stored-account-1",
      site_name: "Toggle Account",
      site_url: "https://toggle.example.com",
      account_info: {
        id: "11",
        username: "toggle-user",
        access_token: "toggle-token",
      },
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("button", { name: "Toggle Account" }),
  ).toBeVisible()

  await openAccountActionsMenu(page, "Toggle Account")
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowDisableToggleMenuItem)
    .click()

  await expect(
    page.locator(
      `[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.accountListView}"] [data-disabled="true"]`,
    ),
  ).toContainText("Toggle Account")

  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(serviceWorker)
      return accounts.find((account) => account.id === "stored-account-1")
        ?.disabled
    })
    .toBe(true)

  await openAccountActionsMenu(page, "Toggle Account")
  await expect(page.getByText("Enable account", { exact: true })).toBeVisible()
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowDisableToggleMenuItem)
    .click()

  await expect(
    page.locator(
      `[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.accountListView}"] [data-disabled="true"]`,
    ),
  ).toHaveCount(0)

  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(serviceWorker)
      return accounts.find((account) => account.id === "stored-account-1")
        ?.disabled
    })
    .toBe(false)
})

test("deletes a stored account from account management and removes it from storage", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "stored-account-1",
      site_name: "Delete Account",
      site_url: "https://delete.example.com",
      account_info: {
        id: "12",
        username: "delete-user",
        access_token: "delete-token",
      },
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("button", { name: "Delete Account" }),
  ).toBeVisible()

  await openAccountActionsMenu(page, "Delete Account")
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowDeleteMenuItem).click()

  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("heading", { name: "Delete Account" }),
  ).toBeVisible()
  await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.deleteConfirmButton)
    .click()

  await expect(
    page.getByRole("button", { name: "Delete Account" }),
  ).toHaveCount(0)

  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(serviceWorker)
      return accounts.some((account) => account.id === "stored-account-1")
    })
    .toBe(false)
})

test("runs quick check-in for the selected eligible account from account management", async ({
  context,
  extensionId,
  page,
}) => {
  await page.addInitScript(
    ({ getStatusAction, runNowAction, stateKey }) => {
      const defaultState: AccountQuickCheckinRuntimeState = {
        calls: [],
      }

      const readState = (): AccountQuickCheckinRuntimeState => {
        try {
          const raw = window.sessionStorage.getItem(stateKey)
          return raw ? JSON.parse(raw) : { ...defaultState }
        } catch {
          return { ...defaultState }
        }
      }

      const writeState = (nextState: AccountQuickCheckinRuntimeState) => {
        window.sessionStorage.setItem(stateKey, JSON.stringify(nextState))
      }

      const patchRuntime = (runtime: RuntimeLike | undefined) => {
        if (!runtime || typeof runtime.sendMessage !== "function") {
          return
        }

        const originalSendMessage = runtime.sendMessage.bind(runtime)

        Object.defineProperty(runtime, "sendMessage", {
          configurable: true,
          writable: true,
          value: async (message: unknown) => {
            const type =
              typeof message === "object" &&
              message !== null &&
              "type" in message
                ? String((message as { type?: unknown }).type ?? "unknown")
                : "unknown"

            if (type !== runNowAction && type !== getStatusAction) {
              return await originalSendMessage(message)
            }

            const accountIds =
              typeof message === "object" &&
              message !== null &&
              "data" in message &&
              typeof (message as { data?: unknown }).data === "object" &&
              (message as { data?: unknown }).data !== null &&
              "accountIds" in (message as { data: any }).data &&
              Array.isArray((message as { data: any }).data.accountIds)
                ? (message as { data: { accountIds: string[] } }).data
                    .accountIds
                : []

            const nextState = {
              calls: [...readState().calls, { type, accountIds }],
            }

            writeState(nextState)

            if (type === runNowAction) {
              return { res: { success: true } }
            }

            return {
              res: {
                success: true,
                data: {
                  perAccount: {
                    "quick-checkin-account": {
                      accountId: "quick-checkin-account",
                      accountName: "Quick Check-in Account",
                      status: "success",
                      message: "check-in completed",
                      timestamp: Date.parse("2026-03-29T12:00:00.000Z"),
                    },
                  },
                },
              },
            }
          },
        })
      }

      patchRuntime(globalThis.chrome?.runtime)

      const browserRuntime = globalThis.browser?.runtime as
        | RuntimeLike
        | undefined

      if (browserRuntime && browserRuntime !== globalThis.chrome?.runtime) {
        patchRuntime(browserRuntime)
      }
    },
    {
      getStatusAction: AutoCheckinMessageTypes.GetStatus,
      runNowAction: AutoCheckinMessageTypes.RunNow,
      stateKey: ACCOUNT_QUICK_CHECKIN_E2E_STATE_KEY,
    },
  )

  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "quick-checkin-account",
      site_name: "Quick Check-in Account",
      site_url: "https://checkin.example.com",
      account_info: {
        id: "41",
        username: "checkin-user",
        access_token: "checkin-token",
      },
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
      },
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await openAccountActionsMenu(page, "Quick Check-in Account")
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowQuickCheckinMenuItem)
    .click()

  await expect
    .poll(() => readAccountQuickCheckinRuntimeState(page))
    .toEqual({
      calls: [
        {
          type: AutoCheckinMessageTypes.RunNow,
          accountIds: ["quick-checkin-account"],
        },
        {
          type: AutoCheckinMessageTypes.GetStatus,
          accountIds: [],
        },
      ],
    })

  await expect(
    page.getByText("Quick Check-in Account: check-in completed"),
  ).toBeVisible()
})

test("pins and unpins an account from account management while persisting pinned order", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccountConfig(serviceWorker, {
    accounts: [
      createStoredAccount({
        id: "stored-account-1",
        site_name: "Alpha Account",
        site_url: "https://alpha.example.com",
        account_info: {
          id: "31",
          username: "alpha-user",
          access_token: "alpha-token",
        },
      }),
      createStoredAccount({
        id: "stored-account-2",
        site_name: "Pinned Candidate",
        site_url: "https://pinned.example.com",
        account_info: {
          id: "32",
          username: "pinned-user",
          access_token: "pinned-token",
        },
      }),
    ],
    orderedAccountIds: ["stored-account-1", "stored-account-2"],
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("button", { name: "Alpha Account" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Pinned Candidate" }),
  ).toBeVisible()

  expect(await getAccountButtonY(page, "Alpha Account")).toBeLessThan(
    await getAccountButtonY(page, "Pinned Candidate"),
  )

  await openAccountActionsMenu(page, "Pinned Candidate")
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowPinToggleMenuItem)
    .click()

  await expect
    .poll(async () => {
      const config = await readStoredAccountConfig(serviceWorker)
      return [...(config.pinnedAccountIds ?? [])]
    })
    .toEqual(["stored-account-2"])

  await expect(
    getAccountRow(page, "Pinned Candidate").getByRole("button", {
      name: "Unpin account",
    }),
  ).toBeVisible()

  expect(await getAccountButtonY(page, "Pinned Candidate")).toBeLessThan(
    await getAccountButtonY(page, "Alpha Account"),
  )

  await openAccountActionsMenu(page, "Pinned Candidate")
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowPinToggleMenuItem)
    .click()

  await expect
    .poll(async () => {
      const config = await readStoredAccountConfig(serviceWorker)
      return [...(config.pinnedAccountIds ?? [])]
    })
    .toEqual([])

  expect(await getAccountButtonY(page, "Alpha Account")).toBeLessThan(
    await getAccountButtonY(page, "Pinned Candidate"),
  )
})

test("shows the empty duplicate-cleanup state when no duplicate accounts are found", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "unique-account-1",
      site_name: "Unique One",
      site_url: "https://unique-one.example.com",
      account_info: {
        id: "71",
        username: "unique-one-user",
        access_token: "unique-one-token",
      },
    }),
    createStoredAccount({
      id: "unique-account-2",
      site_name: "Unique Two",
      site_url: "https://unique-two.example.com",
      account_info: {
        id: "72",
        username: "unique-two-user",
        access_token: "unique-two-token",
      },
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.dedupeScanButton).click()

  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("heading", { name: "Duplicate account cleanup" }),
  ).toBeVisible()
  await expect(
    dialog.getByText("0 duplicate set(s) · 0 account(s) to delete"),
  ).toBeVisible()
  await expect(dialog.getByText("No duplicate accounts found.")).toBeVisible()
  await expect(
    dialog.getByRole("button", { name: "Preview deletion" }),
  ).toBeDisabled()
})

test("cleans duplicate accounts after preview confirmation and prunes stale references", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccountConfig(serviceWorker, {
    accounts: [
      createStoredAccount({
        id: "dup-keep",
        site_name: "Duplicate Example",
        site_url: "https://duplicate.example.com/panel",
        updated_at: 200,
        created_at: 200,
        account_info: {
          id: "55",
          username: "keep-user",
          access_token: "keep-token",
        },
      }),
      createStoredAccount({
        id: "dup-delete",
        site_name: "Duplicate Example",
        site_url: "https://duplicate.example.com/v1",
        updated_at: 100,
        created_at: 100,
        account_info: {
          id: "55",
          username: "delete-user",
          access_token: "delete-token",
        },
      }),
      createStoredAccount({
        id: "unique-account",
        site_name: "Unique Example",
        site_url: "https://unique.example.com",
        account_info: {
          id: "99",
          username: "unique-user",
          access_token: "unique-token",
        },
      }),
    ],
    pinnedAccountIds: ["dup-keep"],
    orderedAccountIds: ["dup-keep", "dup-delete", "unique-account"],
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.dedupeScanButton).click()

  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("heading", { name: "Duplicate account cleanup" }),
  ).toBeVisible()
  await expect(
    dialog.getByText("1 duplicate set(s) · 1 account(s) to delete"),
  ).toBeVisible()

  const duplicateGroup = dialog
    .locator("fieldset")
    .filter({ hasText: "https://duplicate.example.com" })
  await expect(duplicateGroup).toHaveCount(1)

  const radios = duplicateGroup.getByRole("radio")
  await expect(radios).toHaveCount(2)
  await radios.nth(1).click()

  await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.dedupePreviewDeleteButton)
    .click()

  const confirmDialog = page.getByRole("dialog", {
    name: "Delete duplicate accounts",
  })
  await expect(
    confirmDialog.getByText("1 pinned account will be deleted."),
  ).toBeVisible()
  await expect(
    confirmDialog.getByText("Keep: Duplicate Example · delete-user"),
  ).toBeVisible()
  await expect(
    confirmDialog.getByText("Delete: Duplicate Example · keep-user"),
  ).toBeVisible()
  await confirmDialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.dedupeConfirmDeleteButton)
    .click()

  await expect(
    page.getByRole("button", { name: "Scan duplicates" }),
  ).toBeVisible()

  await expect
    .poll(async () => {
      const config = await readStoredAccountConfig(serviceWorker)
      return {
        accountIds: (config.accounts ?? []).map((account) => account.id).sort(),
        pinnedAccountIds: [...(config.pinnedAccountIds ?? [])],
        orderedAccountIds: [...(config.orderedAccountIds ?? [])],
      }
    })
    .toEqual({
      accountIds: ["dup-delete", "unique-account"],
      pinnedAccountIds: [],
      orderedAccountIds: ["dup-delete", "unique-account"],
    })
})
