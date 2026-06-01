import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import {
  getKeyManagementTokenRowTestId,
  KEY_MANAGEMENT_TEST_IDS,
} from "~/features/KeyManagement/testIds"
import type { ApiToken } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { verifyAccountKeyLifecycleUsage } from "~~/e2e/scenarios/accountUsage"
import { saveTokenToApiCredentialProfilesFromKeyManagementPage } from "~~/e2e/utils/accountLifecycle"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { seedMockAccountFixture } from "~~/e2e/utils/mockedSite/accountFixtures"

function createStubApiToken(overrides: Partial<ApiToken> = {}): ApiToken {
  const nowSeconds = Math.floor(Date.now() / 1000)

  return {
    id: 1,
    user_id: 1,
    key: "sk-existing-token",
    status: 1,
    name: "Existing Key",
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

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("creates a token from key management and reloads it into the visible list", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)

  const accountFixture = await seedMockAccountFixture({
    serviceWorker,
    account: createStoredAccount({
      id: "e2e-key-create-account",
      site_url: "https://example.com",
    }),
  })
  await stubNewApiSiteRoutes(context)

  await verifyAccountKeyLifecycleUsage({
    extensionId,
    page,
    serviceWorker,
    account: accountFixture,
    openFromAccountRow: false,
    buildTokenName: () => "E2E Created Key",
  })
})

test("updates an existing token from key management and reloads the visible list", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [createStoredAccount()])
  await stubNewApiSiteRoutes(context, {
    initialTokens: [createStubApiToken()],
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=e2e-account-1`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Existing Key" }),
  ).toBeVisible()

  await page.getByRole("button", { name: "Edit Key" }).click()
  await expect(page.locator("#tokenName")).toBeVisible()
  await page.locator("#tokenName").fill("Updated Key")
  await page.getByRole("button", { name: "Update Key" }).click()

  await expect(page.getByRole("heading", { name: "Updated Key" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Existing Key" })).toHaveCount(
    0,
  )
})

test("deletes an existing token from key management and shows the empty state", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [createStoredAccount()])
  await stubNewApiSiteRoutes(context, {
    initialTokens: [createStubApiToken()],
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=e2e-account-1`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Existing Key" }),
  ).toBeVisible()

  await page.getByRole("button", { name: "Delete Key" }).click()
  await page
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.deleteTokenConfirmButton)
    .click()

  await expect(page.getByRole("heading", { name: "Existing Key" })).toHaveCount(
    0,
  )
  await expect(page.getByText("No key data yet")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Create first key" }),
  ).toBeVisible()
})

test("filters keys by search query and shows the no-results state", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [createStoredAccount()])
  await stubNewApiSiteRoutes(context, {
    initialTokens: [
      createStubApiToken({
        id: 1,
        name: "Alpha Key",
        key: "sk-alpha-token",
      }),
      createStubApiToken({
        id: 2,
        name: "Beta Key",
        key: "sk-beta-token",
      }),
    ],
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=e2e-account-1`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const searchInput = page.getByPlaceholder("Search key name...")
  await expect(searchInput).toBeVisible()

  await searchInput.fill("Alpha")
  await expect(page.getByRole("heading", { name: "Alpha Key" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Beta Key" })).toHaveCount(0)

  await searchInput.fill("Missing key")
  await expect(page.getByText("No matching keys")).toBeVisible()

  await searchInput.fill("")
  await expect(page.getByRole("heading", { name: "Alpha Key" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Beta Key" })).toBeVisible()
})

test("saves a key to API credential profiles and opens the profiles page", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "e2e-account-1",
      site_name: "Profile Source",
      site_url: "https://profile-source.example.com",
      tagIds: ["team-shared"],
      account_info: {
        id: "31",
        username: "profile-user",
        access_token: "profile-token",
      },
    }),
  ])
  await stubNewApiSiteRoutes(context, {
    baseUrl: "https://profile-source.example.com",
    initialTokens: [
      createStubApiToken({
        id: 1,
        name: "Profile Export Key",
        key: "sk-profile-export",
      }),
    ],
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=e2e-account-1`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Profile Export Key" }),
  ).toBeVisible()

  await saveTokenToApiCredentialProfilesFromKeyManagementPage({
    serviceWorker,
    page,
    row: page.getByTestId(getKeyManagementTokenRowTestId(1)),
    expectedProfile: {
      name: "Profile Source - Profile Export Key",
      baseUrl: "https://profile-source.example.com",
      apiKey: "sk-profile-export",
      tagIds: ["team-shared"],
    },
  })

  await expect(page).toHaveURL(/options\.html.*#apiCredentialProfiles$/)
  await expect(
    page.getByRole("heading", { name: "Profile Source - Profile Export Key" }),
  ).toBeVisible()
})
