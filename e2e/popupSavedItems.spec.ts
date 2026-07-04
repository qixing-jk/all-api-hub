import fs from "node:fs/promises"
import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { getPopupViewTestId, POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import {
  getSiteBookmarkListItemTestId,
  SITE_BOOKMARKS_TEST_IDS,
} from "~/features/SiteBookmarks/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { SiteAccount, SiteBookmark } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createStoredApiCredentialProfile,
  createStoredBookmark,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedApiCredentialProfiles,
  seedStoredAccounts,
  seedStoredBookmarks,
  seedUserPreferences,
  stubLlmMetadataIndex,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const SHARE_SNAPSHOT_CAPTION_WRITES_KEY =
  "__aah_e2e_share_snapshot_caption_writes__"

async function readStoredBookmarks(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<SiteBookmark[]> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
  )

  if (typeof raw !== "string") return []

  try {
    const parsed = JSON.parse(raw) as { bookmarks?: SiteBookmark[] }
    return Array.isArray(parsed.bookmarks) ? parsed.bookmarks : []
  } catch {
    return []
  }
}

async function readStoredAccounts(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<SiteAccount[]> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
  )

  if (typeof raw !== "string") return []

  try {
    const parsed = JSON.parse(raw) as { accounts?: SiteAccount[] }
    return Array.isArray(parsed.accounts) ? parsed.accounts : []
  } catch {
    return []
  }
}

async function installShareSnapshotDownloadFallback(page: Page) {
  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, JSON.stringify([]))

    let writeTextCalls = 0
    const readWrites = (): string[] => {
      try {
        const raw = window.sessionStorage.getItem(storageKey)
        return raw ? (JSON.parse(raw) as string[]) : []
      } catch {
        return []
      }
    }

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          writeTextCalls += 1
          if (writeTextCalls === 1) {
            throw new Error("caption clipboard unavailable during export")
          }

          window.sessionStorage.setItem(
            storageKey,
            JSON.stringify([...readWrites(), text]),
          )
        },
      },
    })
  }, SHARE_SNAPSHOT_CAPTION_WRITES_KEY)
}

async function readShareSnapshotCaptionWrites(page: Page): Promise<string[]> {
  return await page.evaluate((storageKey) => {
    try {
      const raw = window.sessionStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  }, SHARE_SNAPSHOT_CAPTION_WRITES_KEY)
}

async function expectBrowserTabOpened(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  url: string,
) {
  await expect
    .poll(async () => {
      return await serviceWorker.evaluate(async (targetUrl) => {
        const chromeApi = (globalThis as any).chrome
        const tabs = await chromeApi.tabs.query({})
        return tabs.some((tab: { url?: string }) => tab.url === targetUrl)
      }, url)
    })
    .toBe(true)
}

async function expectBrowserTabNotOpened(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  url: string,
) {
  await expect
    .poll(async () => {
      return await serviceWorker.evaluate(async (targetUrl) => {
        const chromeApi = (globalThis as any).chrome
        const tabs = await chromeApi.tabs.query({})
        return tabs.some((tab: { url?: string }) => tab.url === targetUrl)
      }, url)
    })
    .toBe(false)
}

async function expectBrowserTabsOpenedInSameWindow(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  urls: string[],
) {
  await expect
    .poll(async () => {
      return await serviceWorker.evaluate(async (targetUrls) => {
        const chromeApi = (globalThis as any).chrome
        const tabs = await chromeApi.tabs.query({})
        const matchedTabs = targetUrls
          .map((targetUrl: string) =>
            tabs.find(
              (tab: { url?: string; windowId?: number }) =>
                tab.url === targetUrl,
            ),
          )
          .filter(Boolean) as Array<{ url?: string; windowId?: number }>

        if (matchedTabs.length !== targetUrls.length) {
          return { opened: false, sameWindow: false }
        }

        const windowIds = new Set(
          matchedTabs.map((tab) => tab.windowId).filter(Number.isFinite),
        )

        return {
          opened: true,
          sameWindow: windowIds.size === 1,
        }
      }, urls)
    })
    .toEqual({ opened: true, sameWindow: true })
}

function getAccountRowByName(page: Page, name: string) {
  return page
    .getByTestId(new RegExp(`^${getAccountManagementListItemTestId("")}`))
    .filter({ hasText: name })
}

function getBookmarkRow(page: Page, name: string) {
  return page
    .getByTestId(new RegExp(`^${getSiteBookmarkListItemTestId("")}`))
    .filter({ hasText: name })
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("opens the full management page for the active popup tab", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredBookmarks(serviceWorker, [
    createStoredBookmark({
      id: "popup-bookmark-1",
      name: "Popup Bookmark",
      url: "https://bookmark.example.com/docs",
    }),
  ])
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "popup-profile-1",
      name: "Popup Profile",
      baseUrl: "https://api.example.com",
      apiKey: "sk-popup-profile",
    }),
  ])

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
  await expect(page.getByTestId(getPopupViewTestId("bookmarks"))).toBeVisible()

  const bookmarkPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: "options.html",
    hash: "#bookmark",
  })
  await page.getByTestId(POPUP_TEST_IDS.openBookmarkManagementButton).click()
  const bookmarkPage = await bookmarkPagePromise
  installExtensionPageGuards(bookmarkPage)
  await waitForExtensionRoot(bookmarkPage)
  await expect(bookmarkPage).toHaveURL(/options\.html#bookmark$/)
  await bookmarkPage.close()

  const apiPopupPage = await context.newPage()
  installExtensionPageGuards(apiPopupPage)
  await forceExtensionLanguage(apiPopupPage, "en")
  await apiPopupPage.goto(
    `chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`,
  )
  await waitForExtensionRoot(apiPopupPage)
  await apiPopupPage
    .getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab)
    .click()
  await expect(
    apiPopupPage.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()

  const profilesPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: "options.html",
    hash: "#apiCredentialProfiles",
  })
  await apiPopupPage
    .getByTestId(POPUP_TEST_IDS.openApiCredentialProfilesButton)
    .click()
  const profilesPage = await profilesPagePromise
  installExtensionPageGuards(profilesPage)
  await waitForExtensionRoot(profilesPage)
  await expect(profilesPage).toHaveURL(/options\.html#apiCredentialProfiles$/)
})

test("opens the account manager from the default popup accounts tab", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "popup-account-1",
      site_name: "Popup Account",
      site_url: "https://popup-account.example.com",
      account_info: {
        id: "501",
        username: "popup-account-user",
        access_token: "popup-account-token",
      },
    }),
  ])

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await expect(page.getByTestId(getPopupViewTestId("accounts"))).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Popup Account" }),
  ).toBeVisible()

  const accountPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.ACCOUNT}`,
  })
  await page.getByTestId(POPUP_TEST_IDS.openAccountManagementButton).click()

  const accountPage = await accountPagePromise
  installExtensionPageGuards(accountPage)
  await waitForExtensionRoot(accountPage)

  await expect(accountPage).toHaveURL(/options\.html#account$/)
  await expect(
    accountPage.getByRole("button", { name: "Popup Account" }),
  ).toBeVisible()
})

test("updates popup account totals after disabling an account from management", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    currencyType: "USD",
    showTodayCashflow: false,
  })
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "popup-active-account",
      site_name: "Popup Active Account",
      site_url: "https://popup-active.example.com",
      exchange_rate: 7,
      account_info: {
        id: "701",
        username: "popup-active-user",
        access_token: "popup-active-token",
        quota: 500000,
      },
    }),
    createStoredAccount({
      id: "popup-disable-account",
      site_name: "Popup Disable Account",
      site_url: "https://popup-disable.example.com",
      exchange_rate: 7,
      account_info: {
        id: "702",
        username: "popup-disable-user",
        access_token: "popup-disable-token",
        quota: 1000000,
      },
    }),
  ])

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await expect(page.getByTestId(getPopupViewTestId("accounts"))).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Popup Active Account" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Popup Disable Account" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Click to switch to CNY" }),
  ).toContainText("$3.00")

  const accountPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.ACCOUNT}`,
  })
  await page.getByTestId(POPUP_TEST_IDS.openAccountManagementButton).click()

  const accountPage = await accountPagePromise
  installExtensionPageGuards(accountPage)
  await waitForExtensionRoot(accountPage)
  await expect(
    accountPage.getByRole("button", { name: "Popup Disable Account" }),
  ).toBeVisible()

  const accountRow = getAccountRowByName(accountPage, "Popup Disable Account")
  await accountRow.hover()
  await accountRow
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
    .click()
  await accountPage
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowDisableToggleMenuItem)
    .click()

  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(serviceWorker)
      return accounts.find((account) => account.id === "popup-disable-account")
        ?.disabled
    })
    .toBe(true)

  const refreshedPopupPage = await context.newPage()
  installExtensionPageGuards(refreshedPopupPage)
  await forceExtensionLanguage(refreshedPopupPage, "en")
  await refreshedPopupPage.goto(
    `chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`,
  )
  await waitForExtensionRoot(refreshedPopupPage)

  await expect(
    refreshedPopupPage.getByTestId(getPopupViewTestId("accounts")),
  ).toBeVisible()
  await expect(
    refreshedPopupPage.getByRole("button", { name: "Click to switch to CNY" }),
  ).toContainText("$1.00")
  await expect(
    refreshedPopupPage.getByTestId(
      getAccountManagementListItemTestId("popup-disable-account"),
    ),
  ).toHaveAttribute("data-disabled", "true")
  await expect(
    refreshedPopupPage.getByTestId(
      getAccountManagementListItemTestId("popup-disable-account"),
    ),
  ).toContainText("Disabled")
})

test("downloads an overview share snapshot from the popup and copies the fallback caption", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    currencyType: "USD",
    showTodayCashflow: true,
  })
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "popup-share-included",
      site_name: "Popup Share Included",
      site_url: "https://share-included.example.com",
      last_sync_time: 1_765_000_000_000,
      account_info: {
        id: "731",
        username: "share-included-user",
        access_token: "share-included-token",
        quota: 500000,
        today_income: 200000,
        today_quota_consumption: 100000,
      },
    }),
    createStoredAccount({
      id: "popup-share-excluded",
      site_name: "Popup Share Excluded",
      site_url: "https://share-excluded.example.com",
      excludeFromTotalBalance: true,
      excludeFromTodayIncome: true,
      last_sync_time: 1_765_000_100_000,
      account_info: {
        id: "732",
        username: "share-excluded-user",
        access_token: "share-excluded-token",
        quota: 700000,
        today_income: 300000,
        today_quota_consumption: 200000,
      },
    }),
    createStoredAccount({
      id: "popup-share-disabled",
      site_name: "Popup Share Disabled",
      site_url: "https://share-disabled.example.com",
      disabled: true,
      last_sync_time: 1_765_000_200_000,
      account_info: {
        id: "733",
        username: "share-disabled-user",
        access_token: "share-disabled-token",
        quota: 900000,
        today_income: 400000,
        today_quota_consumption: 300000,
      },
    }),
  ])

  await installShareSnapshotDownloadFallback(page)
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await expect(page.getByTestId(getPopupViewTestId("accounts"))).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Popup Share Included" }),
  ).toBeVisible()

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Share overview snapshot" }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(
    /^all-api-hub-snapshot-overview-\d{4}-\d{2}-\d{2}\.png$/,
  )
  const downloadPath = await download.path()
  if (!downloadPath) {
    throw new Error("Share snapshot download did not produce a readable file")
  }
  const pngBytes = await fs.readFile(downloadPath)
  expect([...pngBytes.subarray(0, 8)]).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])

  await expect(page.getByText("Snapshot downloaded")).toBeVisible()
  await expect(
    page.getByText("Caption wasn't copied automatically."),
  ).toBeVisible()

  const captionTextArea = page.locator("textarea").first()
  await expect(captionTextArea).toHaveValue(/All API Hub.*Overview/s)
  await expect(captionTextArea).toHaveValue(/Total balance: \$1\.00/)
  await expect(captionTextArea).toHaveValue(/Accounts: 2/)
  await expect(captionTextArea).not.toHaveValue(/Popup Share Included/)
  await expect(captionTextArea).not.toHaveValue(/share-included\.example/)

  await page.getByRole("button", { name: "Copy caption" }).click()
  await expect(page.getByText("Caption copied")).toBeVisible()
  await expect
    .poll(() => readShareSnapshotCaptionWrites(page))
    .toEqual([await captionTextArea.inputValue()])
})

test("opens a saved account site from the popup accounts tab", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "popup-open-account",
      site_name: "Open Account",
      site_url: "https://account-open.example.com",
      account_info: {
        id: "601",
        username: "open-account-user",
        access_token: "open-account-token",
      },
    }),
  ])

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await expect(page.getByTestId(getPopupViewTestId("accounts"))).toBeVisible()
  await getAccountRowByName(page, "Open Account")
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowOpenButton)
    .click()

  await expectBrowserTabOpened(
    serviceWorker,
    "https://account-open.example.com/",
  )
})

test("opens pending external check-ins from the popup and marks them checked in", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const today = new Date().toISOString().split("T")[0]
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "popup-pending-external-checkin",
      site_name: "Pending External Check-in",
      site_url: "https://pending-external.example.com",
      account_info: {
        id: "611",
        username: "pending-external-user",
        access_token: "pending-external-token",
      },
      checkIn: {
        enableDetection: false,
        customCheckIn: {
          url: "https://benefits.example.com/pending/checkin",
          redeemUrl: "https://benefits.example.com/pending/redeem",
          isCheckedInToday: false,
          openRedeemWithCheckIn: true,
        },
      },
    }),
    createStoredAccount({
      id: "popup-done-external-checkin",
      site_name: "Done External Check-in",
      site_url: "https://done-external.example.com",
      account_info: {
        id: "612",
        username: "done-external-user",
        access_token: "done-external-token",
      },
      checkIn: {
        enableDetection: false,
        customCheckIn: {
          url: "https://benefits.example.com/done/checkin",
          redeemUrl: "https://benefits.example.com/done/redeem",
          isCheckedInToday: true,
          lastCheckInDate: today,
          openRedeemWithCheckIn: true,
        },
      },
    }),
  ])

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page
    .getByRole("button", { name: "Open all external check-ins" })
    .click()

  await expectBrowserTabOpened(
    serviceWorker,
    "https://benefits.example.com/pending/redeem",
  )
  await expectBrowserTabOpened(
    serviceWorker,
    "https://benefits.example.com/pending/checkin",
  )
  await expectBrowserTabNotOpened(
    serviceWorker,
    "https://benefits.example.com/done/redeem",
  )
  await expectBrowserTabNotOpened(
    serviceWorker,
    "https://benefits.example.com/done/checkin",
  )

  await expect(
    page.getByText("Opened external check-in for 1 account (unchecked only)."),
  ).toBeVisible()

  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(serviceWorker)
      return accounts.find(
        (account) => account.id === "popup-pending-external-checkin",
      )?.checkIn.customCheckIn?.isCheckedInToday
    })
    .toBe(true)
})

test("ctrl-clicking popup external check-ins opens already checked accounts too", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const today = new Date().toISOString().split("T")[0]
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "popup-pending-external-checkin",
      site_name: "Pending External Check-in",
      site_url: "https://pending-external.example.com",
      account_info: {
        id: "621",
        username: "pending-external-user",
        access_token: "pending-external-token",
      },
      checkIn: {
        enableDetection: false,
        customCheckIn: {
          url: "https://benefits.example.com/ctrl-pending/checkin",
          redeemUrl: "https://benefits.example.com/ctrl-pending/redeem",
          isCheckedInToday: false,
          openRedeemWithCheckIn: true,
        },
      },
    }),
    createStoredAccount({
      id: "popup-done-external-checkin",
      site_name: "Done External Check-in",
      site_url: "https://done-external.example.com",
      account_info: {
        id: "622",
        username: "done-external-user",
        access_token: "done-external-token",
      },
      checkIn: {
        enableDetection: false,
        customCheckIn: {
          url: "https://benefits.example.com/ctrl-done/checkin",
          redeemUrl: "https://benefits.example.com/ctrl-done/redeem",
          isCheckedInToday: true,
          lastCheckInDate: today,
          openRedeemWithCheckIn: true,
        },
      },
    }),
  ])

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page
    .getByRole("button", { name: "Open all external check-ins" })
    .click({ modifiers: ["Control"] })

  for (const targetUrl of [
    "https://benefits.example.com/ctrl-pending/redeem",
    "https://benefits.example.com/ctrl-pending/checkin",
    "https://benefits.example.com/ctrl-done/redeem",
    "https://benefits.example.com/ctrl-done/checkin",
  ]) {
    await expectBrowserTabOpened(serviceWorker, targetUrl)
  }

  await expect(
    page.getByText("Opened external check-ins for 2 accounts (all)."),
  ).toBeVisible()

  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(serviceWorker)
      return accounts.map((account) => ({
        id: account.id,
        checked: account.checkIn.customCheckIn?.isCheckedInToday,
      }))
    })
    .toEqual([
      { id: "popup-pending-external-checkin", checked: true },
      { id: "popup-done-external-checkin", checked: true },
    ])
})

test("shift-clicking popup external check-ins groups opened pages into one browser window", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const hasWindowsApi = await serviceWorker.evaluate(() => {
    return Boolean((globalThis as any).chrome?.windows)
  })
  test.skip(!hasWindowsApi, "Browser windows API is unavailable")

  const today = new Date().toISOString().split("T")[0]
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "popup-shift-pending-external-checkin",
      site_name: "Shift Pending External Check-in",
      site_url: "https://shift-pending-external.example.com",
      account_info: {
        id: "631",
        username: "shift-pending-external-user",
        access_token: "shift-pending-external-token",
      },
      checkIn: {
        enableDetection: false,
        customCheckIn: {
          url: "https://benefits.example.com/shift-pending/checkin",
          redeemUrl: "https://benefits.example.com/shift-pending/redeem",
          isCheckedInToday: false,
          openRedeemWithCheckIn: true,
        },
      },
    }),
    createStoredAccount({
      id: "popup-shift-done-external-checkin",
      site_name: "Shift Done External Check-in",
      site_url: "https://shift-done-external.example.com",
      account_info: {
        id: "632",
        username: "shift-done-external-user",
        access_token: "shift-done-external-token",
      },
      checkIn: {
        enableDetection: false,
        customCheckIn: {
          url: "https://benefits.example.com/shift-done/checkin",
          redeemUrl: "https://benefits.example.com/shift-done/redeem",
          isCheckedInToday: true,
          lastCheckInDate: today,
          openRedeemWithCheckIn: true,
        },
      },
    }),
  ])

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page
    .getByRole("button", { name: "Open all external check-ins" })
    .click({ modifiers: ["Shift"] })

  await expectBrowserTabsOpenedInSameWindow(serviceWorker, [
    "https://benefits.example.com/shift-pending/redeem",
    "https://benefits.example.com/shift-pending/checkin",
  ])
  await expectBrowserTabNotOpened(
    serviceWorker,
    "https://benefits.example.com/shift-done/redeem",
  )
  await expectBrowserTabNotOpened(
    serviceWorker,
    "https://benefits.example.com/shift-done/checkin",
  )

  await expect(
    page.getByText("Opened external check-in for 1 account (unchecked only)."),
  ).toBeVisible()

  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(serviceWorker)
      return accounts.find(
        (account) => account.id === "popup-shift-pending-external-checkin",
      )?.checkIn.customCheckIn?.isCheckedInToday
    })
    .toBe(true)
})

test("adds a bookmark from the popup bookmarks tab and keeps it in storage", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
  await expect(page.getByTestId(SITE_BOOKMARKS_TEST_IDS.listView)).toBeVisible()
  await expect(page.getByText("No bookmarks yet")).toBeVisible()

  await page.getByTestId(POPUP_TEST_IDS.bookmarksPrimaryAction).click()

  const dialog = page.getByTestId(SITE_BOOKMARKS_TEST_IDS.dialog)
  await expect(dialog.getByPlaceholder("e.g. Admin Console")).toBeVisible()
  await dialog.getByPlaceholder("e.g. Admin Console").fill("Popup Docs")
  await dialog
    .getByPlaceholder("https://example.com/...")
    .fill("https://docs.example.com/popup")
  await dialog
    .getByPlaceholder("Optional notes...")
    .fill("Added from the popup")
  await dialog.getByTestId(SITE_BOOKMARKS_TEST_IDS.dialogSaveButton).click()

  await expect(page.getByRole("button", { name: "Popup Docs" })).toBeVisible()
  await expect(page.getByText("No bookmarks yet")).toHaveCount(0)

  await expect
    .poll(async () => {
      const bookmarks = await readStoredBookmarks(serviceWorker)
      return (
        bookmarks.find((bookmark) => bookmark.name === "Popup Docs") ?? null
      )
    })
    .toMatchObject({
      name: "Popup Docs",
      url: "https://docs.example.com/popup",
      notes: "Added from the popup",
    })
})

test("adds a bookmark from the popup, edits it in management, and opens the updated target", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await context.route("https://docs.example.com/updated", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Updated Docs</title><h1>Updated Docs</h1>",
    }),
  )

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
  await expect(page.getByTestId(SITE_BOOKMARKS_TEST_IDS.listView)).toBeVisible()

  await page.getByTestId(POPUP_TEST_IDS.bookmarksPrimaryAction).click()

  const addDialog = page.getByTestId(SITE_BOOKMARKS_TEST_IDS.dialog)
  await addDialog.getByPlaceholder("e.g. Admin Console").fill("Journey Docs")
  await addDialog
    .getByPlaceholder("https://example.com/...")
    .fill("https://docs.example.com/start")
  await addDialog
    .getByPlaceholder("Optional notes...")
    .fill("Created from the popup journey")
  await addDialog.getByTestId(SITE_BOOKMARKS_TEST_IDS.dialogSaveButton).click()

  await expect(page.getByRole("button", { name: "Journey Docs" })).toBeVisible()

  const bookmarkPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.BOOKMARK}`,
  })
  await page.getByTestId(POPUP_TEST_IDS.openBookmarkManagementButton).click()

  const bookmarkPage = await bookmarkPagePromise
  installExtensionPageGuards(bookmarkPage)
  await waitForExtensionRoot(bookmarkPage)
  await expect(
    bookmarkPage.getByRole("button", { name: "Journey Docs" }),
  ).toBeVisible()

  const bookmarkRow = getBookmarkRow(bookmarkPage, "Journey Docs")
  await bookmarkRow.hover()
  await bookmarkRow.getByTestId(SITE_BOOKMARKS_TEST_IDS.rowEditButton).click()

  const editDialog = bookmarkPage.getByTestId(SITE_BOOKMARKS_TEST_IDS.dialog)
  await expect(editDialog.getByPlaceholder("e.g. Admin Console")).toBeVisible()
  await editDialog
    .getByPlaceholder("e.g. Admin Console")
    .fill("Journey Docs Updated")
  await editDialog
    .getByPlaceholder("https://example.com/...")
    .fill("https://docs.example.com/updated")
  await editDialog
    .getByPlaceholder("Optional notes...")
    .fill("Edited from bookmark management")
  await editDialog.getByTestId(SITE_BOOKMARKS_TEST_IDS.dialogSaveButton).click()

  await expect(
    bookmarkPage.getByRole("button", { name: "Journey Docs Updated" }),
  ).toBeVisible()

  await expect
    .poll(async () => {
      const bookmarks = await readStoredBookmarks(serviceWorker)
      return (
        bookmarks.find(
          (bookmark) => bookmark.name === "Journey Docs Updated",
        ) ?? null
      )
    })
    .toMatchObject({
      name: "Journey Docs Updated",
      url: "https://docs.example.com/updated",
      notes: "Edited from bookmark management",
    })

  const popupPage = await context.newPage()
  installExtensionPageGuards(popupPage)
  await forceExtensionLanguage(popupPage, "en")
  await popupPage.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(popupPage)

  await popupPage.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
  await expect(
    popupPage.getByTestId(SITE_BOOKMARKS_TEST_IDS.listView),
  ).toBeVisible()
  await expect(
    popupPage.getByRole("button", { name: "Journey Docs Updated" }),
  ).toBeVisible()
  await expect(
    popupPage.getByRole("button", { name: "Journey Docs", exact: true }),
  ).toHaveCount(0)

  const updatedBookmarkRow = getBookmarkRow(popupPage, "Journey Docs Updated")
  await updatedBookmarkRow.hover()
  await updatedBookmarkRow
    .getByTestId(SITE_BOOKMARKS_TEST_IDS.rowOpenButton)
    .click()
  await expectBrowserTabOpened(
    serviceWorker,
    "https://docs.example.com/updated",
  )
})

test("opens a saved bookmark from the popup bookmarks tab", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredBookmarks(serviceWorker, [
    createStoredBookmark({
      id: "popup-open-bookmark",
      name: "Open Bookmark",
      url: "https://bookmark-open.example.com/docs",
    }),
  ])
  await context.route("https://bookmark-open.example.com/docs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Opened Bookmark</title><h1>Opened Bookmark</h1>",
    }),
  )

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
  await expect(page.getByTestId(SITE_BOOKMARKS_TEST_IDS.listView)).toBeVisible()

  const bookmarkRow = getBookmarkRow(page, "Open Bookmark")
  await bookmarkRow.hover()
  await bookmarkRow.getByTestId(SITE_BOOKMARKS_TEST_IDS.rowOpenButton).click()

  await expectBrowserTabOpened(
    serviceWorker,
    "https://bookmark-open.example.com/docs",
  )
})
