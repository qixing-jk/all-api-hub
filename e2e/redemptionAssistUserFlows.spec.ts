import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { getPopupViewTestId } from "~/entrypoints/popup/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { SiteAccount } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  getStoredAccountUsdObservation,
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
import { sendRedemptionContextMenuTrigger } from "~~/e2e/utils/redemptionAssist"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

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

test.beforeEach(async ({ page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
})

test("keeps applicable unsupported accounts visible and provides only known manual redemption links", async ({
  context,
  page,
}, testInfo) => {
  let writes = 0
  await context.route(
    "https://github.com/qixing-jk/all-api-hub/issues/new**",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><title>Support request fixture</title><h1>Review support request</h1></html>",
      }),
  )
  await context.route(`${REDEEM_SITE_URL}/**`, async (route) => {
    if (route.request().method() === "POST") writes++
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><title>Redemption choice fixture</title><h1>Redemption announcement</h1></html>",
    })
  })
  await page.setViewportSize({ width: 1100, height: 850 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    language: "en",
    redemptionAssist: { enabled: true },
  })
  const manual = createStoredAccount({
    id: "manual",
    site_name: "Manual Sub2API",
    site_type: "sub2api",
    site_url: REDEEM_SITE_URL,
  })
  const noRoute = createStoredAccount({
    id: "no-route",
    site_name: "No known page",
    site_type: "RightCode",
    site_url: REDEEM_SITE_URL,
    checkIn: {
      customCheckIn: { url: `${REDEEM_SITE_URL}/unrelated-check-in` },
    },
  })
  const automatic = createStoredAccount({
    id: "auto",
    site_name: "Automatic account",
    site_url: REDEEM_SITE_URL,
  })
  const disabled = createStoredAccount({
    ...automatic,
    id: "disabled",
    site_name: "Disabled account",
    disabled: true,
  })
  const incompatible = createStoredAccount({
    id: "pmplan",
    site_name: "PM-Plan account",
    site_type: "pmplan",
    site_url: REDEEM_SITE_URL,
  })
  const host = page.locator("all-api-hub-redemption-toast")
  const trigger = async () => {
    await page.goto(REDEEM_PAGE_URL)
    await sendRedemptionContextMenuTrigger(worker, {
      pageUrl: REDEEM_PAGE_URL,
      selectionText: REDEMPTION_CODE,
    })
  }
  const capture = async (name: string) =>
    host.locator("section").screenshot({
      path: testInfo.outputPath(`${name}.png`),
      animations: "disabled",
    })
  await seedStoredAccounts(worker, [
    manual,
    noRoute,
    disabled,
    incompatible,
    automatic,
  ])
  await trigger()
  await expect(host.getByRole("radio").first()).toBeVisible()
  await capture("supported-and-unsupported")
  await expect(host.getByRole("radio")).toHaveCount(3)
  await expect(host.getByRole("radio").first()).toHaveAccessibleName(
    /Automatic account/,
  )
  await expect(
    host.getByRole("radio", { name: /Manual Sub2API/ }),
  ).toBeDisabled()
  await expect(
    host.getByRole("radio", { name: /No known page/ }),
  ).toBeDisabled()
  await expect(host.getByText("Disabled account", { exact: true })).toHaveCount(
    0,
  )
  await expect(host.getByText("PM-Plan account", { exact: true })).toHaveCount(
    0,
  )
  const manualLink = host.getByRole("link", {
    name: "Open site to redeem manually",
    exact: true,
  })
  const supportLinks = host.getByRole("link", {
    name: "Request support",
    exact: true,
  })
  await expect(manualLink).toHaveCount(1)
  await expect(manualLink).toHaveAttribute("href", `${REDEEM_SITE_URL}/redeem`)
  await expect(supportLinks).toHaveCount(2)
  const supportOpened = context.waitForEvent("page")
  await supportLinks.first().focus()
  await supportLinks.first().press("Enter")
  const supportPage = await supportOpened
  try {
    await expect(supportPage).toHaveURL(
      /github\.com\/qixing-jk\/all-api-hub\/issues\/new/,
    )
    const destination = new URL(supportPage.url())
    expect(destination.searchParams.get("template")).toBe(
      "site_support_request.yml",
    )
    expect(destination.searchParams.get("site-url")).toBe(REDEEM_SITE_URL)
    expect(destination.searchParams.get("failure-type")).toBe(
      "redemption_unsupported",
    )
    expect(destination.searchParams.get("failure-message")).toBe(
      "Automatic redemption is not yet supported for site type sub2api. Please add redemption support.",
    )
    expect(destination.searchParams.get("extension-version")).toMatch(
      /^\d+\.\d+\.\d+/,
    )
    expect(destination.href).not.toContain(REDEMPTION_CODE)
    expect(decodeURIComponent(destination.href)).not.toContain("Manual Sub2API")
  } finally {
    await supportPage.close()
  }
  await expect(host.getByRole("radio").first()).toBeChecked()
  expect(writes).toBe(0)
  await host.getByRole("textbox").fill("Manual Sub2API")
  await expect(
    host.getByRole("button", { name: "Confirm redemption", exact: true }),
  ).toBeDisabled()
  await expect(
    host.getByText(/The accounts shown match this code type/),
  ).toBeVisible()
  await host.getByRole("textbox").press("Enter")
  expect(writes).toBe(0)
  await capture("unsupported-search")
  await host.getByRole("textbox").fill("no such account")
  await expect(
    host.getByText("No matching accounts found", { exact: true }),
  ).toBeVisible()
  await capture("no-search-results")
  await host.getByRole("textbox").fill("")
  await expect(
    host.getByRole("button", { name: "Confirm redemption", exact: true }),
  ).toBeEnabled()
  await expect(host.getByRole("radio").first()).toBeChecked()
  const opened = context.waitForEvent("page")
  await manualLink.click()
  const manualPage = await opened
  try {
    await expect(manualPage).toHaveURL(`${REDEEM_SITE_URL}/redeem`)
  } finally {
    await manualPage.close()
  }
  expect(writes).toBe(0)

  // A same-origin manual-only account must not bypass the picker and submit.
  await seedStoredAccounts(worker, [
    {
      ...manual,
      checkIn: { ...manual.checkIn, customCheckIn: { url: REDEEM_PAGE_URL } },
    },
    noRoute,
  ])
  await trigger()
  await expect(
    host.getByRole("heading", {
      name: "Automatic redemption is not available for these accounts",
      exact: true,
    }),
  ).toBeVisible()
  await expect(host.getByRole("radio")).toHaveCount(2)
  await expect(
    host.getByRole("button", { name: "Confirm redemption", exact: true }),
  ).toBeDisabled()
  await expect(
    host.getByText(/The accounts shown match this code type/),
  ).toBeVisible()
  await capture("all-unsupported")
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(manualLink).toBeInViewport()
  await expect(supportLinks.first()).toBeInViewport()
  await capture("all-unsupported-narrow")
  await host
    .getByRole("radio", { name: /No known page/ })
    .locator("xpath=ancestor::label/..")
    .scrollIntoViewIfNeeded()
  await expect(supportLinks.last()).toBeInViewport()
  await capture("all-unsupported-scrolled")
  await host.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(host.getByText("Cancelled", { exact: true })).toBeVisible()
  expect(writes).toBe(0)

  await seedStoredAccounts(worker, [disabled, incompatible])
  await trigger()
  await expect(
    host.getByText(/No enabled account matches this code type/),
  ).toBeVisible()
  await expect(host.getByRole("radio")).toHaveCount(0)
  await capture("no-compatible-account")
  expect(writes).toBe(0)
})

test("detects a redemption code on a real page, redeems it for the matched account, and refreshes popup balance", async ({
  context,
  extensionId,
  extensionDir,
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
        automaticExecutionEnabled: false,
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
    contentHost.getByRole("heading", {
      name: "Redemption Assist",
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    contentHost.getByText("a1b2****c5d6", { exact: true }),
  ).toBeVisible()

  await contentHost.getByRole("button", { name: "Auto redeem" }).click()

  await expect(
    contentHost.getByText("Redeemed successfully. Credited amount: USD 1"),
  ).toBeVisible()
  expect(redeemedCodes).toEqual([REDEMPTION_CODE])
  await captureVisualViews({
    page,
    ready: contentHost.getByText(
      "Redeemed successfully. Credited amount: USD 1",
    ),
    captureTarget: contentHost
      .getByText("Redeemed successfully. Credited amount: USD 1")
      .locator(".."),
    id: "redemption-native-award",
    extensionDir,
  })

  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(serviceWorker)
      return getStoredAccountUsdObservation(
        accounts.find((account) => account.id === "redeem-account"),
      )
    })
    .toMatchObject({ status: "known", value: "3" })

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
    popupPage.getByRole("region", { name: "Financial totals" }),
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
        automaticExecutionEnabled: false,
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
    contentHost.getByText(
      /^Redeemed successfully\. Credited amount: USD\s*0\.5$/,
    ),
  ).toBeVisible()
  expect(redeemedCodes).toEqual([REDEMPTION_CODE])

  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(serviceWorker)
      return getStoredAccountUsdObservation(
        accounts.find(
          (account) => account.id === "context-menu-redeem-account",
        ),
      )
    })
    .toMatchObject({ status: "known", value: "4.5" })
})

test("opens Redemption Assist settings from the content prompt", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
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
        automaticExecutionEnabled: false,
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
    contentHost.getByRole("heading", {
      name: "Redemption Assist",
      exact: true,
    }),
  ).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: testInfo.outputPath("redemption-prompt-mobile.png"),
    animations: "disabled",
  })

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
