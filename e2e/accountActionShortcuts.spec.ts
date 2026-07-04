import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { LDOH_ORIGIN } from "~/services/integrations/ldohSiteLookup/constants"
import type { LdohSiteListCache } from "~/services/integrations/ldohSiteLookup/types"
import type { ApiToken } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { verifyAccountProviderDestinationUsage } from "~~/e2e/scenarios/accountUsage"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const CLIPBOARD_WRITES_KEY = "__aah_e2e_clipboard_writes__"

function createStubApiToken(overrides: Partial<ApiToken> = {}): ApiToken {
  const nowSeconds = Math.floor(Date.now() / 1000)

  return {
    id: 1,
    user_id: 1,
    key: "sk-shortcut-token",
    status: 1,
    name: "Shortcut Key",
    created_time: nowSeconds,
    accessed_time: nowSeconds,
    expired_time: -1,
    remain_quota: -1,
    unlimited_quota: true,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: "",
    used_quota: 0,
    group: "default",
    ...overrides,
  }
}

async function installClipboardRecorder(page: Page) {
  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, JSON.stringify([]))

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
          window.sessionStorage.setItem(
            storageKey,
            JSON.stringify([...readWrites(), text]),
          )
        },
      },
    })
  }, CLIPBOARD_WRITES_KEY)
}

async function readClipboardWrites(page: Page): Promise<string[]> {
  return await page.evaluate((storageKey) => {
    try {
      const raw = window.sessionStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  }, CLIPBOARD_WRITES_KEY)
}

function getAccountRow(page: Page, accountName: string) {
  return page
    .getByTestId(new RegExp(`^${getAccountManagementListItemTestId("")}`))
    .filter({ hasText: accountName })
}

async function openAccountActionsMenu(page: Page, accountName: string) {
  const row = getAccountRow(page, accountName)
  await row.hover()
  await row
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
    .click()
}

async function expectBrowserTabOpenedAtOrigin(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  origin: string,
) {
  await expect
    .poll(async () => {
      return await serviceWorker.evaluate(async (targetOrigin) => {
        const chromeApi = (globalThis as any).chrome
        const tabs = await chromeApi.tabs.query({})
        return tabs.some((tab: { url?: string }) =>
          tab.url?.startsWith(`${targetOrigin}/`),
        )
      }, origin)
    })
    .toBe(true)
}

async function installTabsCreateRecorder(page: Page) {
  await page.evaluate(() => {
    const browserApi = (globalThis as any).browser ?? (globalThis as any).chrome
    const originalCreate = browserApi.tabs.create.bind(browserApi.tabs)
    ;(globalThis as any).__aahTabsCreateCalls = []
    browserApi.tabs.create = async (
      createProperties: browser.tabs._CreateCreateProperties,
    ) => {
      ;(globalThis as any).__aahTabsCreateCalls.push(createProperties)
      return await originalCreate(createProperties)
    }
  })
}

async function expectTabsCreateCalledWithUrl(page: Page, url: string) {
  await expect
    .poll(async () => {
      return await page.evaluate((targetUrl) => {
        const calls = (globalThis as any).__aahTabsCreateCalls
        return Array.isArray(calls)
          ? calls.some(
              (call: browser.tabs._CreateCreateProperties) =>
                call.url === targetUrl,
            )
          : false
      }, url)
    })
    .toBe(true)
}

function buildLdohSearchUrl(hostname: string) {
  const url = new URL(LDOH_ORIGIN)
  url.searchParams.set("q", hostname)
  return url.toString()
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await installClipboardRecorder(page)
  await stubLlmMetadataIndex(context)
})

test("copies a stored account URL from the account list shortcut", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "shortcut-account",
      site_name: "Shortcut Account",
      site_url: "https://shortcut.example.com",
      account_info: {
        id: "101",
        username: "shortcut-user",
        access_token: "shortcut-token",
      },
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const row = getAccountRow(page, "Shortcut Account")
  await row.hover()
  await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowCopyUrlButton).click()

  await expect
    .poll(() => readClipboardWrites(page))
    .toEqual(["https://shortcut.example.com"])
  await expect(page.getByText("URL copied to clipboard")).toBeVisible()
})

test("copies the only API key directly from the account list shortcut", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "shortcut-account",
      site_name: "Shortcut Account",
      site_url: "https://shortcut.example.com",
      account_info: {
        id: "101",
        username: "shortcut-user",
        access_token: "shortcut-token",
      },
    }),
  ])
  await stubNewApiSiteRoutes(context, {
    baseUrl: "https://shortcut.example.com",
    initialTokens: [
      createStubApiToken({
        id: 7,
        name: "Single Shortcut Key",
        key: "sk-single-shortcut",
      }),
    ],
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const row = getAccountRow(page, "Shortcut Account")
  await row.hover()
  await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowCopyKeyButton).click()

  await expect
    .poll(() => readClipboardWrites(page))
    .toEqual(["sk-single-shortcut"])
  await expect(page.getByText("Key copied to clipboard")).toBeVisible()
})

test("opens per-account key and model management from the row menu", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "shortcut-account",
      site_name: "Shortcut Account",
      site_url: "https://shortcut.example.com",
      account_info: {
        id: "101",
        username: "shortcut-user",
        access_token: "shortcut-token",
      },
    }),
  ])
  await stubNewApiSiteRoutes(context, {
    baseUrl: "https://shortcut.example.com",
    models: ["gpt-shortcut"],
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const keysPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.KEYS}`,
    searchParams: { accountId: "shortcut-account" },
  })

  await openAccountActionsMenu(page, "Shortcut Account")
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowKeyManagementMenuItem)
    .click()

  const keysPage = await keysPagePromise
  installExtensionPageGuards(keysPage)
  await waitForExtensionRoot(keysPage)
  await expect(keysPage).toHaveURL(
    /options\.html\?accountId=shortcut-account#keys$/,
  )
  await keysPage.close()

  await page.bringToFront()

  const modelsPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.MODELS}`,
    searchParams: { accountId: "shortcut-account" },
  })

  await openAccountActionsMenu(page, "Shortcut Account")
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowModelManagementMenuItem)
    .click()

  const modelsPage = await modelsPagePromise
  installExtensionPageGuards(modelsPage)
  await waitForExtensionRoot(modelsPage)

  const targetUrl = new URL(modelsPage.url())
  expect(targetUrl.hash).toBe(`#${MENU_ITEM_IDS.MODELS}`)
  expect(targetUrl.searchParams.get("accountId")).toBe("shortcut-account")
  await expect(
    modelsPage.getByRole("heading", { name: "gpt-shortcut" }),
  ).toBeVisible()
})

test("opens an LDOH site lookup search from the account row action", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const now = Date.now()
  const accountHostname = "ldoh-account.example.invalid"
  const expectedLdohSearchUrl = buildLdohSearchUrl(accountHostname)
  const ldohCache: LdohSiteListCache = {
    version: 1,
    fetchedAt: now,
    expiresAt: now + 60 * 60 * 1000,
    items: [
      {
        id: "ldoh-e2e-site",
        name: "LDOH E2E Site",
        apiBaseUrl: `https://${accountHostname}/api`,
      },
    ],
  }

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "ldoh-shortcut-account",
      site_name: "LDOH Shortcut Account",
      site_url: `https://${accountHostname}`,
      account_info: {
        id: "301",
        username: "ldoh-shortcut-user",
        access_token: "ldoh-shortcut-token",
      },
    }),
  ])
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.SITE_LIST_CACHE,
    ldohCache,
  )
  await context.route(`${LDOH_ORIGIN}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>LDOH lookup</title>",
    })
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  await installTabsCreateRecorder(page)

  const row = getAccountRow(page, "LDOH Shortcut Account")
  await row.hover()
  const ldohLookupButton = row.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.rowLdohLookupButton,
  )
  await expect(ldohLookupButton).toBeVisible()
  await ldohLookupButton.click()

  await expectTabsCreateCalledWithUrl(page, expectedLdohSearchUrl)
  await expectBrowserTabOpenedAtOrigin(serviceWorker, LDOH_ORIGIN)
})

test("opens provider usage and redeem destinations from the account row menu", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "shortcut-routes-account",
      site_name: "Shortcut Routes Account",
      site_url: "https://shortcut-routes.example.com",
      account_info: {
        id: "201",
        username: "shortcut-routes-user",
        access_token: "shortcut-routes-token",
      },
    }),
  ])
  await stubNewApiSiteRoutes(context, {
    baseUrl: "https://shortcut-routes.example.com",
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await verifyAccountProviderDestinationUsage({
    page,
    serviceWorker,
    account: {
      accountId: "shortcut-routes-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://shortcut-routes.example.com",
    },
  })
})
