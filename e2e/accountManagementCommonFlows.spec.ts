import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  createDefaultAccountStorageConfig,
  normalizeAccountStorageConfigForWrite,
} from "~/services/accounts/accountDefaults"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
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
    action: string
    accountIds: string[]
  }>
}

type RuntimeLike = {
  sendMessage?: (message: unknown) => Promise<unknown>
}

/**
 *
 */
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

/**
 *
 */
async function readStoredAccounts(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<SiteAccount[]> {
  const config = await readStoredAccountConfig(serviceWorker)
  return Array.isArray(config.accounts) ? config.accounts : []
}

/**
 *
 */
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

/**
 *
 */
function getAccountRow(page: Page, accountName: string) {
  return page
    .getByRole("button", { name: accountName })
    .locator("xpath=ancestor::div[contains(@class, 'group')][1]")
}

/**
 *
 */
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

/**
 *
 */
async function openAccountActionsMenu(page: Page, accountName: string) {
  const row = getAccountRow(page, accountName)
  await row.hover()
  await row.getByRole("button", { name: "More" }).click()
}

/**
 *
 */
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
        id: 11,
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
  await page.getByText("Disable account", { exact: true }).click()

  await expect(
    page.locator('[data-testid="account-list-view"] [data-disabled="true"]'),
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
  await page.getByText("Enable account", { exact: true }).click()

  await expect(
    page.locator('[data-testid="account-list-view"] [data-disabled="true"]'),
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
        id: 12,
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
  await page.getByText("Delete", { exact: true }).click()

  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("heading", { name: "Delete Account" }),
  ).toBeVisible()
  await dialog.getByRole("button", { name: "Confirm Delete" }).click()

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

test("filters accounts by search query and shows the no-results state", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "stored-account-1",
      site_name: "Needle Account",
      site_url: "https://needle.example.com",
      account_info: {
        id: 21,
        username: "needle-user",
        access_token: "needle-token",
      },
    }),
    createStoredAccount({
      id: "stored-account-2",
      site_name: "Haystack Account",
      site_url: "https://haystack.example.com",
      account_info: {
        id: 22,
        username: "haystack-user",
        access_token: "haystack-token",
      },
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const searchInput = page.getByPlaceholder(
    "Enter site information or account information to search",
  )
  await expect(searchInput).toBeVisible()

  await searchInput.fill("needle-user")
  await expect(
    page.getByRole("button", { name: "Needle Account" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Haystack Account" }),
  ).toHaveCount(0)

  await searchInput.fill("missing-account")
  await expect(page.getByText("No matching accounts found")).toBeVisible()

  await searchInput.fill("")
  await expect(
    page.getByRole("button", { name: "Needle Account" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Haystack Account" }),
  ).toBeVisible()
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
            const action =
              typeof message === "object" &&
              message !== null &&
              "action" in message
                ? String((message as { action?: unknown }).action ?? "unknown")
                : "unknown"

            if (action !== runNowAction && action !== getStatusAction) {
              return await originalSendMessage(message)
            }

            const accountIds =
              typeof message === "object" &&
              message !== null &&
              "accountIds" in message &&
              Array.isArray((message as { accountIds?: unknown }).accountIds)
                ? (message as { accountIds: string[] }).accountIds
                : []

            const nextState = {
              calls: [...readState().calls, { action, accountIds }],
            }

            writeState(nextState)

            if (action === runNowAction) {
              return { success: true }
            }

            return {
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
      getStatusAction: RuntimeActionIds.AutoCheckinGetStatus,
      runNowAction: RuntimeActionIds.AutoCheckinRunNow,
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
        id: 41,
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
  await page.getByText("Quick check-in", { exact: true }).click()

  await expect
    .poll(() => readAccountQuickCheckinRuntimeState(page))
    .toEqual({
      calls: [
        {
          action: RuntimeActionIds.AutoCheckinRunNow,
          accountIds: ["quick-checkin-account"],
        },
        {
          action: RuntimeActionIds.AutoCheckinGetStatus,
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
          id: 31,
          username: "alpha-user",
          access_token: "alpha-token",
        },
      }),
      createStoredAccount({
        id: "stored-account-2",
        site_name: "Pinned Candidate",
        site_url: "https://pinned.example.com",
        account_info: {
          id: 32,
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
  await page.getByText("Pin account", { exact: true }).click()

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
  await page.getByText("Unpin account", { exact: true }).click()

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
        id: 71,
        username: "unique-one-user",
        access_token: "unique-one-token",
      },
    }),
    createStoredAccount({
      id: "unique-account-2",
      site_name: "Unique Two",
      site_url: "https://unique-two.example.com",
      account_info: {
        id: 72,
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

  await page.getByRole("button", { name: "Scan duplicates" }).click()

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
          id: 55,
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
          id: 55,
          username: "delete-user",
          access_token: "delete-token",
        },
      }),
      createStoredAccount({
        id: "unique-account",
        site_name: "Unique Example",
        site_url: "https://unique.example.com",
        account_info: {
          id: 99,
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

  await page.getByRole("button", { name: "Scan duplicates" }).click()

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

  await dialog.getByRole("button", { name: "Preview deletion" }).click()

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
  await confirmDialog.getByRole("button", { name: "Delete" }).click()

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
