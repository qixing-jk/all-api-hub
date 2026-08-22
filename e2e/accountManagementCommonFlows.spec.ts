import type { Locator, Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { OPTIONS_TEST_IDS } from "~/entrypoints/options/testIds"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
  getAccountManagementSortButtonTestId,
} from "~/features/AccountManagement/testIds"
import {
  createDefaultAccountStorageConfig,
  normalizeAccountStorageConfigForWrite,
} from "~/services/accounts/accountDefaults"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
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
const DESKTOP_VIEWPORT_SIZE = { width: 1280, height: 720 }
const MOBILE_VIEWPORT_SIZE = { width: 320, height: 720 }

type AccountQuickCheckinRuntimeState = {
  calls: Array<{
    type: string
    accountIds: string[]
  }>
}

type RuntimeLike = {
  sendMessage?: (message: unknown) => Promise<unknown>
}

type ElementBounds = {
  bottom: number
  height: number
  right: number
  width: number
  x: number
  y: number
}

async function readElementBounds(locator: Locator): Promise<ElementBounds[]> {
  return locator.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect()
      return {
        bottom: box.bottom,
        height: box.height,
        right: box.right,
        width: box.width,
        x: box.x,
        y: box.y,
      }
    }),
  )
}

function elementBoundsOverlap(left: ElementBounds, right: ElementBounds) {
  return (
    left.x < right.right &&
    left.right > right.x &&
    left.y < right.bottom &&
    left.bottom > right.y
  )
}

function isHorizontallyContained(
  bounds: ElementBounds,
  container: { width: number; x: number },
) {
  return (
    bounds.x >= container.x && bounds.right <= container.x + container.width
  )
}

async function openAccountManagement(page: Page, extensionId: string) {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
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
  const accountButton = getAccountRow(page, accountName)
    .getByRole("button", { name: accountName })
    .first()
  await expect(accountButton).toBeVisible()

  let accountButtonY: number | undefined
  await expect
    .poll(
      async () => {
        accountButtonY = (await accountButton.boundingBox())?.y
        return accountButtonY
      },
      {
        message: `resolve account row position for ${accountName}`,
      },
    )
    .not.toBeUndefined()

  if (accountButtonY === undefined) {
    throw new Error(`Could not resolve account row for ${accountName}`)
  }

  return accountButtonY
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

test("keeps account management controls reachable across constrained widths", async ({
  context,
  extensionId,
  page,
}) => {
  const viewportSizes = [DESKTOP_VIEWPORT_SIZE, MOBILE_VIEWPORT_SIZE]
  await page.setViewportSize(viewportSizes[0])

  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "responsive-header-account",
      site_name: "Responsive Header Account",
      site_url: "https://account.example.invalid",
      disabled: true,
      checkIn: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.NEW_API,
        supported: true,
        automaticExecutionEnabled: true,
        customCheckIn: { url: "https://check-in.example.invalid" },
      }),
    }),
  ])

  await openAccountManagement(page, extensionId)

  const headerActionGroup = page.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.headerActions,
  )
  const requiredHeaderActions = [
    page.getByRole("button", { name: "Refresh", exact: true }),
    page.getByRole("button", {
      name: "Refresh disabled accounts",
      exact: true,
    }),
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.externalCheckInButton),
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportButton),
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.dedupeScanButton),
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton),
  ]
  for (const action of requiredHeaderActions) {
    await expect(action.first()).toBeVisible()
  }

  const headerActions = headerActionGroup.getByRole("button")
  const contentCard = page.getByTestId(OPTIONS_TEST_IDS.contentCard)
  await expect(contentCard).toBeVisible()

  async function expectHeaderActionsContained(viewportSize: {
    width: number
    height: number
  }) {
    await page.setViewportSize(viewportSize)

    await expect
      .poll(async () => {
        const contentCardBox = await contentCard.boundingBox()
        const headerActionGroupBox = await headerActionGroup.boundingBox()
        const boxes = await readElementBounds(headerActions)

        const rowRightEdges = new Map<number, number>()
        for (const box of boxes) {
          const rowCenter = Math.round(box.y + box.height / 2)
          rowRightEdges.set(
            rowCenter,
            Math.max(rowRightEdges.get(rowCenter) ?? 0, box.right),
          )
        }
        const actionGroupRight = headerActionGroupBox
          ? headerActionGroupBox.x + headerActionGroupBox.width
          : 0
        const rowAlignmentError = Math.max(
          ...Array.from(rowRightEdges.values()).map((rightEdge) =>
            Math.abs(rightEdge - actionGroupRight),
          ),
        )

        return {
          hasLayout: Boolean(contentCardBox && headerActionGroupBox),
          actionsContained: Boolean(
            contentCardBox &&
              boxes.every((box) =>
                isHorizontallyContained(box, contentCardBox),
              ),
          ),
          actionsWrapped: rowRightEdges.size > 1,
          rowsRightAligned: rowAlignmentError <= 1,
        }
      })
      .toEqual({
        hasLayout: true,
        actionsContained: true,
        actionsWrapped: true,
        rowsRightAligned: true,
      })

    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth ===
          document.documentElement.clientWidth,
      ),
    ).toBe(true)
  }

  for (const viewportSize of viewportSizes) {
    await expectHeaderActionsContained(viewportSize)
  }

  const accountList = page.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.accountListView,
  )
  const accountListHeader = page.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.accountListHeader,
  )
  const accountListSortControls = page.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.accountListSortControls,
  )
  const accountListUtilities = page.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.accountListUtilities,
  )
  const clearSortAction = page.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.accountListClearSortButton,
  )
  const requiredAccountListHeaderActions = [
    page.getByTestId(getAccountManagementSortButtonTestId("name")),
    page.getByTestId(getAccountManagementSortButtonTestId("created_at")),
    page.getByTestId(getAccountManagementSortButtonTestId("balance")),
    clearSortAction,
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountListBulkManageButton),
  ]
  for (const action of requiredAccountListHeaderActions) {
    await expect(action).toBeVisible()
  }

  async function expectAccountListHeaderLayout(
    viewportSize: { height: number; width: number },
    layout: "inline" | "stacked",
  ) {
    await page.setViewportSize(viewportSize)

    await expect
      .poll(async () => {
        const listBox = await accountList.boundingBox()
        const sortControlsBox = await accountListSortControls.boundingBox()
        const utilitiesBox = await accountListUtilities.boundingBox()
        const clearSortActionBox = await clearSortAction.boundingBox()
        const headerButtons = await readElementBounds(
          accountListHeader.getByRole("button"),
        )
        const hasOverlappingButtons = headerButtons.some((box, index) =>
          headerButtons
            .slice(index + 1)
            .some((other) => elementBoundsOverlap(box, other)),
        )
        const clearSortStaysWithinSortTier = Boolean(
          sortControlsBox &&
            clearSortActionBox &&
            clearSortActionBox.y >= sortControlsBox.y &&
            clearSortActionBox.y + clearSortActionBox.height <=
              sortControlsBox.y + sortControlsBox.height,
        )

        return {
          hasLayout: Boolean(
            listBox && sortControlsBox && utilitiesBox && clearSortActionBox,
          ),
          utilitiesPlacementMatches: Boolean(
            sortControlsBox &&
              utilitiesBox &&
              (layout === "stacked"
                ? utilitiesBox.y + utilitiesBox.height <= sortControlsBox.y
                : sortControlsBox.x + sortControlsBox.width <= utilitiesBox.x &&
                  Math.abs(
                    sortControlsBox.y +
                      sortControlsBox.height / 2 -
                      (utilitiesBox.y + utilitiesBox.height / 2),
                  ) <= 1),
          ),
          clearSortPlacementMatches:
            clearSortStaysWithinSortTier &&
            (layout === "inline" ||
              Boolean(
                sortControlsBox &&
                  clearSortActionBox &&
                  Math.abs(
                    clearSortActionBox.x +
                      clearSortActionBox.width -
                      (sortControlsBox.x + sortControlsBox.width),
                  ) <= 1,
              )),
          buttonsContained: Boolean(
            listBox &&
              headerButtons.every((box) =>
                isHorizontallyContained(box, listBox),
              ),
          ),
          hasOverlappingButtons,
        }
      })
      .toEqual({
        hasLayout: true,
        utilitiesPlacementMatches: true,
        clearSortPlacementMatches: true,
        buttonsContained: true,
        hasOverlappingButtons: false,
      })
  }

  await expectAccountListHeaderLayout(DESKTOP_VIEWPORT_SIZE, "inline")
  await expectAccountListHeaderLayout(MOBILE_VIEWPORT_SIZE, "stacked")

  const externalCheckInAction = page.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.externalCheckInButton,
  )
  const constrainedWidthStressLabel =
    "Open every available external check-in action in a separate page"
  await externalCheckInAction.evaluate((action, label) => {
    const textNode = Array.from(action.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
    )
    if (!textNode) {
      throw new Error("Could not resolve the external check-in action label")
    }
    textNode.textContent = label
  }, constrainedWidthStressLabel)
  await expect(
    page.getByRole("button", {
      name: constrainedWidthStressLabel,
      exact: true,
    }),
  ).toBeVisible()
  await expectHeaderActionsContained(MOBILE_VIEWPORT_SIZE)
})

test("keeps the add account dialog open when text selection ends over its backdrop", async ({
  extensionId,
  page,
}) => {
  await openAccountManagement(page, extensionId)

  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()

  const panel = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
  const positioner = page.locator('[data-slot="modal-positioner"]')
  const heading = panel.getByRole("heading", { name: "Add Account" })
  await expect(panel).toBeVisible()
  await expect(positioner).toBeVisible()
  await expect(heading).toBeVisible()

  const [headingBox, panelBox, positionerBox] = await Promise.all([
    heading.boundingBox(),
    panel.boundingBox(),
    positioner.boundingBox(),
  ])
  if (!headingBox || !panelBox || !positionerBox) {
    throw new Error("Could not resolve add account dialog geometry")
  }

  await page.mouse.move(
    headingBox.x + headingBox.width / 2,
    headingBox.y + headingBox.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    Math.max(positionerBox.x + 1, panelBox.x - 8),
    headingBox.y + headingBox.height / 2,
    { steps: 10 },
  )
  await page.mouse.up()

  await expect(panel).toBeVisible()
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

  await openAccountManagement(page, extensionId)

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

  await openAccountManagement(page, extensionId)

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

      const readAccountIds = (message: unknown): string[] => {
        if (typeof message !== "object" || message === null) {
          return []
        }

        const data = (message as Record<string, unknown>).data
        if (typeof data !== "object" || data === null) {
          return []
        }

        const accountIds = (data as Record<string, unknown>).accountIds
        return Array.isArray(accountIds)
          ? accountIds.filter(
              (accountId): accountId is string => typeof accountId === "string",
            )
          : []
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

            const accountIds = readAccountIds(message)

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
      checkIn: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.NEW_API,
        supported: true,
        automaticExecutionEnabled: true,
      }),
    }),
  ])

  await openAccountManagement(page, extensionId)

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

  await openAccountManagement(page, extensionId)

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

  await openAccountManagement(page, extensionId)

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

  await openAccountManagement(page, extensionId)

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
