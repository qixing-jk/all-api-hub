import {
  OPTIONS_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { getPopupViewTestId, POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import { SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE } from "~/features/AccountManagement/sponsors/types"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { SITE_BOOKMARKS_TEST_IDS } from "~/features/SiteBookmarks/testIds"
import {
  createDefaultAccountStorageConfig,
  normalizeAccountStorageConfigForWrite,
} from "~/services/accounts/accountDefaults"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { AuthTypeEnum } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createStoredApiCredentialProfile,
  createStoredBookmark,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedApiCredentialProfiles,
  stubLlmMetadataIndex,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const SIDEPANEL_URL = (extensionId: string) =>
  `chrome-extension://${extensionId}/${SIDEPANEL_PAGE_PATH}`

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

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("sidepanel switches common saved-item tabs and opens the matching management pages", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const now = Date.now()
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
    normalizeAccountStorageConfigForWrite(
      {
        ...createDefaultAccountStorageConfig(now),
        accounts: [
          createStoredAccount({
            id: "sidepanel-account-1",
            site_name: "Sidepanel Account",
            site_url: "https://sidepanel-account.example.com",
            account_info: {
              id: "31",
              username: "sidepanel-user",
              access_token: "sidepanel-token",
            },
          }),
        ],
        bookmarks: [
          createStoredBookmark({
            id: "sidepanel-bookmark-1",
            name: "Sidepanel Docs",
            url: "https://sidepanel-docs.example.com",
          }),
        ],
      },
      now,
    ),
  )
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "sidepanel-profile-1",
      name: "Sidepanel Profile",
      baseUrl: "https://sidepanel-api.example.com",
      apiKey: "sk-sidepanel-profile",
    }),
  ])

  await page.goto(SIDEPANEL_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(page.getByText("All API Hub", { exact: true })).toBeVisible()
  await expect(page.getByTestId(getPopupViewTestId("accounts"))).toBeVisible()
  await expect(page.getByText("Sidepanel Account")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Open Side Panel" }),
  ).toHaveCount(0)

  const accountsPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.ACCOUNT}`,
  })
  await page.getByRole("button", { name: "Account Management" }).click()
  const accountsPage = await accountsPagePromise
  installExtensionPageGuards(accountsPage)
  await waitForExtensionRoot(accountsPage)
  expect(new URL(accountsPage.url()).hash).toBe(`#${MENU_ITEM_IDS.ACCOUNT}`)
  await accountsPage.close()

  await page.getByRole("tab", { name: "Bookmarks" }).click()
  await expect(page.getByTestId(getPopupViewTestId("bookmarks"))).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Sidepanel Docs" }),
  ).toBeVisible()

  const bookmarksPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.BOOKMARK}`,
  })
  await page.getByRole("button", { name: "Bookmark Management" }).click()
  const bookmarksPage = await bookmarksPagePromise
  installExtensionPageGuards(bookmarksPage)
  await waitForExtensionRoot(bookmarksPage)
  expect(new URL(bookmarksPage.url()).hash).toBe(`#${MENU_ITEM_IDS.BOOKMARK}`)
  await bookmarksPage.close()

  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()
  await expect(page.getByText("Sidepanel Profile")).toBeVisible()

  const profilesPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  })
  await page.getByTestId(POPUP_TEST_IDS.openApiCredentialProfilesButton).click()
  const profilesPage = await profilesPagePromise
  installExtensionPageGuards(profilesPage)
  await waitForExtensionRoot(profilesPage)
  expect(new URL(profilesPage.url()).hash).toBe(
    `#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
})

test("sidepanel opens saved account and bookmark targets in browser tabs", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const now = Date.now()
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
    normalizeAccountStorageConfigForWrite(
      {
        ...createDefaultAccountStorageConfig(now),
        accounts: [
          createStoredAccount({
            id: "sidepanel-open-account",
            site_name: "Sidepanel Open Account",
            site_url: "https://sidepanel-open-account.example.com",
            account_info: {
              id: "41",
              username: "sidepanel-open-user",
              access_token: "sidepanel-open-token",
            },
          }),
        ],
        bookmarks: [
          createStoredBookmark({
            id: "sidepanel-open-bookmark",
            name: "Sidepanel Open Bookmark",
            url: "https://sidepanel-open-bookmark.example.com/docs",
          }),
        ],
      },
      now,
    ),
  )

  await page.goto(SIDEPANEL_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(page.getByTestId(getPopupViewTestId("accounts"))).toBeVisible()
  await page.getByRole("button", { name: "Sidepanel Open Account" }).click()
  await expectBrowserTabOpened(
    serviceWorker,
    "https://sidepanel-open-account.example.com/",
  )

  await page.getByRole("tab", { name: "Bookmarks" }).click()
  await expect(page.getByTestId(SITE_BOOKMARKS_TEST_IDS.listView)).toBeVisible()
  await page.getByRole("button", { name: "Sidepanel Open Bookmark" }).click()
  await expectBrowserTabOpened(
    serviceWorker,
    "https://sidepanel-open-bookmark.example.com/docs",
  )
})

test("sidepanel opens the model list for a saved API credential profile", async ({
  context,
  extensionId,
  page,
}) => {
  await context.route(
    "https://sidepanel-model-api.example.com/v1/models",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "gpt-sidepanel-mini" }, { id: "gpt-sidepanel-pro" }],
        }),
      }),
  )

  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "sidepanel-model-profile",
      name: "Sidepanel Model Profile",
      baseUrl: "https://sidepanel-model-api.example.com",
      apiKey: "sk-sidepanel-model-profile",
    }),
  ])

  await page.goto(SIDEPANEL_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Sidepanel Model Profile" }),
  ).toBeVisible()

  const modelsPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.MODELS}`,
    searchParams: {
      profileId: "sidepanel-model-profile",
    },
  })

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.openModelManagementButton)
    .click()

  const modelsPage = await modelsPagePromise
  installExtensionPageGuards(modelsPage)
  await waitForExtensionRoot(modelsPage)

  const targetUrl = new URL(modelsPage.url())
  expect(targetUrl.hash).toBe(`#${MENU_ITEM_IDS.MODELS}`)
  expect(targetUrl.searchParams.get("profileId")).toBe(
    "sidepanel-model-profile",
  )
  await expect(modelsPage.getByText("gpt-sidepanel-mini")).toBeVisible()
  await expect(modelsPage.getByText("gpt-sidepanel-pro")).toBeVisible()
  await expect(
    modelsPage
      .getByText("Profile: Sidepanel Model Profile", { exact: false })
      .first(),
  ).toBeVisible()
})

test("sidepanel consumes pending sponsor add-account prefill", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL,
    {
      createdAt: Date.now(),
      prefill: {
        source: SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE,
        sponsorId: "e2e-supported-provider",
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://sponsor-prefill.example.invalid",
        authType: AuthTypeEnum.AccessToken,
      },
    },
  )

  await page.goto(SIDEPANEL_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const accountDialog = page.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog,
  )
  await expect(accountDialog).toBeVisible()
  await expect(
    accountDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput),
  ).toHaveValue("https://sponsor-prefill.example.invalid")
  await expect(
    accountDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.authTypeTrigger),
  ).toHaveAttribute("data-auth-type", AuthTypeEnum.AccessToken)
  await accountDialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.manualAddButton)
    .click()
  await expect(
    accountDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger),
  ).toHaveAttribute("data-site-type", SITE_TYPES.NEW_API)
  await expect
    .poll(() =>
      getPlasmoStorageRawValue(
        serviceWorker,
        STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL,
      ),
    )
    .toBeUndefined()
})
