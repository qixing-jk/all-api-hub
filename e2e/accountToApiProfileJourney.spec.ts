import type { Page, Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { ApiToken, SiteAccount } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { createNoopAccountFixtureCleanup } from "~~/e2e/scenarios/accountFixtures"
import { runAccountKeyToApiProfileScenario } from "~~/e2e/scenarios/accountKeyToApiProfile"
import {
  openApiCredentialProfilesPopupScenario,
  verifyApiCredentialProfileModelsProbeScenario,
} from "~~/e2e/scenarios/apiCredentialProfileVerification"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
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

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    baseUrl: JOURNEY_SITE_URL,
    title: SITE_TYPES.NEW_API,
    systemName: SITE_TYPES.NEW_API,
    userId: "77",
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
  await runAccountKeyToApiProfileScenario({
    extensionId,
    extensionPage: page,
    getServiceWorker: async () => serviceWorker,
    resolveAccountFixture: async () => ({
      accountId,
      siteType: SITE_TYPES.NEW_API,
      baseUrl: JOURNEY_SITE_URL,
      cleanup: createNoopAccountFixtureCleanup(),
    }),
    buildTokenName: () => "Journey Created Key",
    expectedProfile: {
      name: "Example - Journey Created Key",
      baseUrl: JOURNEY_SITE_URL,
      apiKey: "sk-created-43",
    },
    cleanupAccountFixture: false,
    cleanupCreatedProfile: false,
  })

  const popupPage = await openApiCredentialProfilesPopupScenario({
    page: await context.newPage(),
    extensionId,
  })
  await verifyApiCredentialProfileModelsProbeScenario({
    page: popupPage,
    profileName: "Example - Journey Created Key",
    expectedModelCount: 2,
  })

  await sitePage.close()
})
