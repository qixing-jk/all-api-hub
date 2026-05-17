import type { Page, Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileVerifyProbeTestId,
} from "~/features/ApiCredentialProfiles/testIds"
import {
  getKeyManagementTokenRowTestId,
  KEY_MANAGEMENT_TEST_IDS,
} from "~/features/KeyManagement/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { ApiToken, SiteAccount } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const JOURNEY_SITE_URL = "https://example.com"

async function readStoredAccounts(
  serviceWorker: Worker,
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

async function readStoredApiCredentialProfiles(
  serviceWorker: Worker,
): Promise<ApiCredentialProfile[]> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.API_CREDENTIAL_PROFILES,
  )

  if (typeof raw !== "string") return []

  try {
    const parsed = JSON.parse(raw) as { profiles?: ApiCredentialProfile[] }
    return Array.isArray(parsed.profiles) ? parsed.profiles : []
  } catch {
    return []
  }
}

async function getJourneyAccountId(serviceWorker: Worker): Promise<string> {
  const account = (await readStoredAccounts(serviceWorker)).find(
    (storedAccount) =>
      storedAccount.site_url === JOURNEY_SITE_URL &&
      storedAccount.account_info.username === "journey-user",
  )

  expect(account).toBeTruthy()
  return account!.id
}

function createJourneyToken(overrides: Partial<ApiToken> = {}): ApiToken {
  const nowSeconds = Math.floor(Date.now() / 1000)

  return {
    id: 1,
    user_id: 77,
    key: "sk-existing-journey",
    status: 1,
    name: "Existing Journey Key",
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

function getAccountRowByText(page: Page, text: string) {
  return page
    .getByTestId(new RegExp(`^${getAccountManagementListItemTestId("")}`))
    .filter({ hasText: text })
}

async function openAccountActionsMenu(page: Page, accountRowText: string) {
  const row = getAccountRowByText(page, accountRowText)

  await row.hover()
  await row
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
    .click()
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    baseUrl: JOURNEY_SITE_URL,
    title: "new-api",
    systemName: "new-api",
    userId: 77,
    username: "journey-user",
    accessToken: "journey-access-token",
    models: ["gpt-journey-mini", "gpt-journey-pro"],
    initialTokens: [
      createJourneyToken({
        id: 42,
        name: "Reusable Journey Key",
        key: "sk-reusable-journey",
      }),
    ],
  })
})

test("adds an account, creates a reusable API profile from its key, and verifies it from the popup", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    tempWindowFallback: {
      enabled: false,
    },
  })

  const sitePage = await context.newPage()
  installExtensionPageGuards(sitePage)
  await forceExtensionLanguage(sitePage, "en")
  await sitePage.addInitScript(() => {
    window.localStorage.setItem(
      "user",
      JSON.stringify({
        id: 77,
        username: "journey-user",
        quota: 1000,
      }),
    )
  })
  await sitePage.goto(JOURNEY_SITE_URL)
  await sitePage.bringToFront()

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
  await page.locator("#site-url").fill(JOURNEY_SITE_URL)
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton).click()
  await expect(page.getByRole("button", { name: "Confirm Add" })).toBeVisible()
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton).click()

  await expect(
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountListView),
  ).toContainText("journey-user")
  await expect(getAccountRowByText(page, "journey-user")).toBeVisible()

  const accountId = await getJourneyAccountId(serviceWorker)
  const keysPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.KEYS}`,
    searchParams: { accountId },
  })

  await openAccountActionsMenu(page, "journey-user")
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowKeyManagementMenuItem)
    .click()

  const keysPage = await keysPagePromise
  installExtensionPageGuards(keysPage)
  await waitForExtensionRoot(keysPage)
  await expect(keysPage).toHaveURL(new RegExp(`accountId=${accountId}#keys$`))
  await expect(
    keysPage.getByTestId(getKeyManagementTokenRowTestId(42)),
  ).toBeVisible()

  await keysPage.getByTestId(KEY_MANAGEMENT_TEST_IDS.addTokenButton).click()
  await expect(keysPage.locator("#tokenName")).toBeVisible()
  await keysPage.locator("#tokenName").fill("Journey Created Key")
  await keysPage
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.addTokenSubmitButton)
    .click()
  await expect(
    keysPage.getByRole("heading", { name: "Journey Created Key" }),
  ).toBeVisible()

  await keysPage
    .getByTestId(getKeyManagementTokenRowTestId(43))
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.saveToApiProfilesButton)
    .click()

  await expect
    .poll(async () => {
      const profiles = await readStoredApiCredentialProfiles(serviceWorker)
      return (
        profiles.find((profile) => profile.apiKey === "sk-created-43") ?? null
      )
    })
    .toMatchObject({
      name: "Example - Journey Created Key",
      baseUrl: JOURNEY_SITE_URL,
      apiKey: "sk-created-43",
    })

  const popupPage = await context.newPage()
  installExtensionPageGuards(popupPage)
  await forceExtensionLanguage(popupPage, "en")
  await popupPage.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(popupPage)

  await popupPage.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    popupPage.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()
  await expect(
    popupPage.getByRole("heading", {
      name: "Example - Journey Created Key",
    }),
  ).toBeVisible()

  await popupPage
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyButton)
    .click()
  const modelsProbe = popupPage.getByTestId(
    getApiCredentialProfileVerifyProbeTestId("models"),
  )
  await expect(
    popupPage.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId),
  ).toBeVisible()

  await modelsProbe
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyProbeRunButton)
    .click()

  await expect(modelsProbe).toContainText("Pass")
  await expect(modelsProbe).toContainText("Fetched 2 models.")

  await sitePage.close()
})
