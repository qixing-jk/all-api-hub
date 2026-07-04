import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { getPopupViewTestId } from "~/entrypoints/popup/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { SiteAccount } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubNewApiSiteRoutes,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const REDEEM_SITE_URL = "https://redeem.example.test"
const REDEEM_PAGE_URL = `${REDEEM_SITE_URL}/console/redeem`
const REDEMPTION_CODE = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"

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

async function sendRedemptionContextMenuTrigger(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  params: {
    pageUrl: string
    selectionText: string
  },
) {
  await expect
    .poll(async () => {
      return await serviceWorker.evaluate(
        async ({ action, pageUrl, selectionText }) => {
          const chromeApi = (globalThis as any).chrome
          const tabs = await chromeApi.tabs.query({})
          const targetTab = tabs.find(
            (tab: { id?: number; url?: string }) => tab.url === pageUrl,
          )

          if (targetTab?.id == null) {
            return { success: false, error: "Target tab not found" }
          }

          return await new Promise<{ success: boolean; error?: string }>(
            (resolve) => {
              chromeApi.tabs.sendMessage(
                targetTab.id,
                {
                  action,
                  pageUrl,
                  selectionText,
                },
                () => {
                  const error = chromeApi.runtime?.lastError
                  const errorMessage =
                    typeof error?.message === "string" ? error.message : ""
                  if (errorMessage.includes("message port closed")) {
                    resolve({ success: true })
                    return
                  }

                  resolve(
                    errorMessage
                      ? { success: false, error: errorMessage }
                      : { success: true },
                  )
                },
              )
            },
          )
        },
        {
          action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
          pageUrl: params.pageUrl,
          selectionText: params.selectionText,
        },
      )
    })
    .toMatchObject({ success: true })
}

test.beforeEach(async ({ page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
})

test("detects a redemption code on a real page, redeems it for the matched account, and refreshes popup balance", async ({
  context,
  extensionId,
  page,
}) => {
  const redeemedCodes: string[] = []
  await stubNewApiSiteRoutes(context, {
    baseUrl: REDEEM_SITE_URL,
    userId: "901",
    username: "redeem-user",
    accessToken: "redeem-access-token",
    initialQuota: 1_000_000,
    redemptionCreditQuota: 500_000,
    onRedeemCode: (code) => {
      redeemedCodes.push(code)
    },
  })

  await context.route(REDEEM_PAGE_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html>
        <html lang="en">
          <head>
            <title>Redeem Fixture</title>
          </head>
          <body>
            <main>
              <h1>Redeem Center</h1>
              <button id="copy-code">Copy ${REDEMPTION_CODE}</button>
            </main>
          </body>
        </html>`,
    })
  })

  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    language: "en",
    currencyType: "USD",
    showTodayCashflow: false,
    redemptionAssist: {
      enabled: true,
      contextMenu: {
        enabled: true,
      },
      relaxedCodeValidation: false,
      urlWhitelist: {
        enabled: true,
        patterns: ["^https://redeem\\.example\\.test/console/redeem"],
        includeAccountSiteUrls: false,
        includeCheckInAndRedeemUrls: false,
      },
    },
  })
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "redeem-account",
      site_name: "Redeem Hub",
      site_url: REDEEM_SITE_URL,
      exchange_rate: 7,
      account_info: {
        id: "901",
        username: "redeem-user",
        access_token: "redeem-access-token",
        quota: 1_000_000,
      },
      checkIn: {
        enableDetection: false,
        customCheckIn: {
          url: REDEEM_PAGE_URL,
          redeemUrl: REDEEM_PAGE_URL,
        },
      },
    }),
  ])

  await page.goto(REDEEM_PAGE_URL)

  await page.locator("#copy-code").evaluate((target, code) => {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(target)
    selection?.removeAllRanges()
    selection?.addRange(range)

    const clipboardData = new DataTransfer()
    clipboardData.setData("text", code)
    target.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    )
  }, REDEMPTION_CODE)

  const contentHost = page.locator("all-api-hub-redemption-toast")
  await expect(
    contentHost.getByRole("heading", { name: "Redemption Assist" }),
  ).toBeVisible()
  await expect(
    contentHost.getByText("a1b2****c5d6", { exact: true }),
  ).toBeVisible()

  await contentHost.getByRole("button", { name: "Auto redeem" }).click()

  await expect(
    contentHost.getByText("Redeemed successfully. Credited amount: 1.00"),
  ).toBeVisible()
  expect(redeemedCodes).toEqual([REDEMPTION_CODE])

  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(serviceWorker)
      return accounts.find((account) => account.id === "redeem-account")
        ?.account_info.quota
    })
    .toBe(1_500_000)

  const popupPage = await context.newPage()
  installExtensionPageGuards(popupPage)
  await forceExtensionLanguage(popupPage, "en")
  await popupPage.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(popupPage)

  await expect(
    popupPage.getByTestId(getPopupViewTestId("accounts")),
  ).toBeVisible()
  await expect(
    popupPage.getByRole("button", { name: "Redeem Hub" }),
  ).toBeVisible()
  await expect(
    popupPage.getByRole("button", { name: "Click to switch to CNY" }),
  ).toContainText("$3.00")
})

test("forwards selected redemption text from the background context-menu path to the live content listener", async ({
  context,
  page,
}) => {
  const redeemedCodes: string[] = []
  await stubNewApiSiteRoutes(context, {
    baseUrl: REDEEM_SITE_URL,
    userId: "902",
    username: "context-menu-user",
    accessToken: "context-menu-access-token",
    initialQuota: 2_000_000,
    redemptionCreditQuota: 250_000,
    onRedeemCode: (code) => {
      redeemedCodes.push(code)
    },
  })

  await context.route(REDEEM_PAGE_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html>
        <html lang="en">
          <head>
            <title>Redeem Fixture</title>
          </head>
          <body>
            <main>
              <h1>Redeem Center</h1>
              <p id="context-menu-code">${REDEMPTION_CODE}</p>
            </main>
          </body>
        </html>`,
    })
  })

  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    language: "en",
    currencyType: "USD",
    redemptionAssist: {
      enabled: true,
      contextMenu: {
        enabled: true,
      },
      relaxedCodeValidation: false,
      urlWhitelist: {
        enabled: true,
        patterns: [],
        includeAccountSiteUrls: false,
        includeCheckInAndRedeemUrls: false,
      },
    },
  })
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "context-menu-redeem-account",
      site_name: "Context Menu Hub",
      site_url: REDEEM_SITE_URL,
      exchange_rate: 7,
      account_info: {
        id: "902",
        username: "context-menu-user",
        access_token: "context-menu-access-token",
        quota: 2_000_000,
      },
      checkIn: {
        enableDetection: false,
        customCheckIn: {
          url: REDEEM_PAGE_URL,
          redeemUrl: REDEEM_PAGE_URL,
        },
      },
    }),
  ])

  await page.goto(REDEEM_PAGE_URL)
  const selectedCode = await page
    .locator("#context-menu-code")
    .evaluate((target) => {
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(target)
      selection?.removeAllRanges()
      selection?.addRange(range)

      return selection?.toString().trim() ?? ""
    })
  expect(selectedCode).toBe(REDEMPTION_CODE)

  await sendRedemptionContextMenuTrigger(serviceWorker, {
    pageUrl: REDEEM_PAGE_URL,
    selectionText: selectedCode,
  })

  const contentHost = page.locator("all-api-hub-redemption-toast")
  await expect(
    contentHost.getByText("Redeemed successfully. Credited amount: 0.50"),
  ).toBeVisible()
  expect(redeemedCodes).toEqual([REDEMPTION_CODE])

  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(serviceWorker)
      return accounts.find(
        (account) => account.id === "context-menu-redeem-account",
      )?.account_info.quota
    })
    .toBe(2_250_000)
})

test("opens Redemption Assist settings from the content prompt", async ({
  context,
  extensionId,
  page,
}) => {
  await context.route(REDEEM_PAGE_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html>
        <html lang="en">
          <head>
            <title>Redeem Settings Fixture</title>
          </head>
          <body>
            <main>
              <h1>Redeem Settings Center</h1>
              <button id="copy-code">Copy ${REDEMPTION_CODE}</button>
            </main>
          </body>
        </html>`,
    })
  })

  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    language: "en",
    redemptionAssist: {
      enabled: true,
      contextMenu: {
        enabled: true,
      },
      relaxedCodeValidation: false,
      urlWhitelist: {
        enabled: true,
        patterns: ["^https://redeem\\.example\\.test/console/redeem"],
        includeAccountSiteUrls: false,
        includeCheckInAndRedeemUrls: false,
      },
    },
  })
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "redeem-settings-account",
      site_name: "Redeem Settings Hub",
      site_url: REDEEM_SITE_URL,
      account_info: {
        id: "903",
        username: "redeem-settings-user",
        access_token: "redeem-settings-access-token",
        quota: 1_000_000,
      },
      checkIn: {
        enableDetection: false,
        customCheckIn: {
          url: REDEEM_PAGE_URL,
          redeemUrl: REDEEM_PAGE_URL,
        },
      },
    }),
  ])

  await page.goto(REDEEM_PAGE_URL)

  await page.locator("#copy-code").evaluate((target, code) => {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(target)
    selection?.removeAllRanges()
    selection?.addRange(range)

    const clipboardData = new DataTransfer()
    clipboardData.setData("text", code)
    target.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    )
  }, REDEMPTION_CODE)

  const contentHost = page.locator("all-api-hub-redemption-toast")
  await expect(
    contentHost.getByRole("heading", { name: "Redemption Assist" }),
  ).toBeVisible()

  const settingsPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.BASIC}`,
    searchParams: {
      tab: "checkinRedeem",
      anchor: "redemption-assist",
    },
  })

  await contentHost
    .getByRole("link", { name: "Open Redemption Assist settings" })
    .click()

  const settingsPage = await settingsPagePromise
  installExtensionPageGuards(settingsPage)
  await waitForExtensionRoot(settingsPage)

  const targetUrl = new URL(settingsPage.url())
  expect(targetUrl.hash).toBe(`#${MENU_ITEM_IDS.BASIC}`)
  expect(targetUrl.searchParams.get("tab")).toBe("checkinRedeem")
  expect(targetUrl.searchParams.get("anchor")).toBe("redemption-assist")

  await expect(
    settingsPage.getByRole("heading", {
      name: "Redemption Assist",
      exact: true,
    }),
  ).toBeInViewport()
})
