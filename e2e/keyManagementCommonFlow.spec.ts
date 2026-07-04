import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import {
  getKeyManagementTokenRowTestId,
  KEY_MANAGEMENT_TEST_IDS,
} from "~/features/KeyManagement/testIds"
import { ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS } from "~/services/core/storageKeys"
import { AuthTypeEnum, type ApiToken } from "~/types"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  verifyAccountKeyLifecycleUsage,
  verifyAccountTokenCcSwitchModelPickerUsage,
} from "~~/e2e/scenarios/accountUsage"
import { verifyCcSwitchModelExportDeepLink } from "~~/e2e/scenarios/ccSwitchExport"
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
  getPlasmoStorageRawValue,
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

async function stubSharedChatServiceCredentialRoutes(
  context: Parameters<typeof stubNewApiSiteRoutes>[0],
) {
  await context.route("https://new.sharedchat.cc/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (
      request.method() === "GET" &&
      url.pathname === "/frontend-api/vibe-code/quota"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 1,
          msg: "ok",
          data: {
            codex: {
              isAuth: true,
              apiKey: "sk-sharedchat-service-e2e",
              subscriptions: {
                remainingAmount: 12.5,
              },
              currentUsage: {
                totalRequests: 3,
                totalTokens: 456,
                totalCost: 0.42,
              },
              recentRecords: [],
            },
          },
        }),
      })
      return
    }

    if (request.method() === "GET" && url.pathname === "/codex/v1/models") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          object: "list",
          data: [
            {
              id: "gpt-sharedchat-service",
              object: "model",
              owned_by: "e2e",
            },
          ],
        }),
      })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unhandled SharedChat E2E route" }),
    })
  })
}

async function readJsonStorageValue<T>(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  storageKey: string,
): Promise<T | null> {
  const raw = await getPlasmoStorageRawValue<unknown>(serviceWorker, storageKey)
  if (typeof raw !== "string") {
    return null
  }

  return JSON.parse(raw) as T
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

test("opens the CC Switch model picker for an account API key", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)

  const accountFixture = await seedMockAccountFixture({
    serviceWorker,
    account: createStoredAccount({
      id: "e2e-cc-switch-account",
      site_name: "CC Switch Source",
      site_url: "https://cc-switch-source.example.com",
    }),
  })
  await stubNewApiSiteRoutes(context, {
    baseUrl: "https://cc-switch-source.example.com",
    models: ["gpt-cc-switch-smoke"],
  })

  await verifyAccountTokenCcSwitchModelPickerUsage({
    extensionId,
    page,
    serviceWorker,
    account: accountFixture,
    openFromAccountRow: false,
    buildTokenName: () => "E2E CC Switch Key",
    modelName: "gpt-cc-switch-smoke",
    expectedCcSwitchDeepLink: {
      app: "claude",
      name: "CC Switch Source",
      homepage: "https://cc-switch-source.example.com",
      endpoint: "https://cc-switch-source.example.com",
      apiKey: "sk-created-1",
    },
  })
})

test("exports a SharedChat service credential to CC Switch", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "e2e-sharedchat-service-account",
      site_name: "SharedChat Service",
      site_type: SITE_TYPES.SHAREDCHAT,
      site_url: "https://new.sharedchat.cc",
      authType: AuthTypeEnum.Cookie,
      account_info: {
        id: "sharedchat-user",
        access_token: "sharedchat-session",
        username: "sharedchat-user",
      },
    }),
  ])
  await stubSharedChatServiceCredentialRoutes(context)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=e2e-sharedchat-service-account`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const serviceCredentialCard = page.getByTestId(
    KEY_MANAGEMENT_TEST_IDS.serviceCredentialCard,
  )
  await expect(serviceCredentialCard).toBeVisible()
  await expect(
    serviceCredentialCard.getByRole("heading", { name: "Codex" }),
  ).toBeVisible()

  await serviceCredentialCard
    .getByTestId(
      KEY_MANAGEMENT_TEST_IDS.serviceCredentialExportToCCSwitchButton,
    )
    .click()

  await verifyCcSwitchModelExportDeepLink({
    page,
    modelName: "gpt-sharedchat-service",
    expected: {
      app: "claude",
      name: "SharedChat Service - Codex",
      homepage: "https://new.sharedchat.cc/codex",
      endpoint: "https://new.sharedchat.cc/codex",
      apiKey: "sk-sharedchat-service-e2e",
    },
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

test("repairs missing account keys and deletes invalid group keys", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const accountId = "e2e-key-repair-account"
  const baseUrl = "https://key-repair.example.com"

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: accountId,
      site_name: "Key Repair Source",
      site_url: baseUrl,
      account_info: {
        id: "1",
        access_token: "repair-token",
        username: "repair-user",
      },
    }),
  ])
  await stubNewApiSiteRoutes(context, {
    baseUrl,
    accessToken: "repair-token",
    username: "repair-user",
    groups: {
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 1.5 },
    },
    initialTokens: [
      createStubApiToken({
        id: 1,
        name: "Default Key",
        key: "sk-default-token",
        group: "default",
      }),
      createStubApiToken({
        id: 2,
        name: "Legacy Group Key",
        key: "sk-legacy-token",
        group: "legacy",
      }),
    ],
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=${accountId}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  await expect(page.getByRole("heading", { name: "Default Key" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Legacy Group Key" }),
  ).toBeVisible()

  await page.getByRole("button", { name: "Key check" }).click()
  await expect(
    page.getByRole("heading", { name: "Key coverage check" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Start check and fill gaps" }).click()

  await expect
    .poll(
      async () => {
        const progress = await readJsonStorageValue<AccountKeyRepairProgress>(
          serviceWorker,
          ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_PROGRESS,
        )
        return progress?.state
      },
      { timeout: 30_000 },
    )
    .toBe(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed)

  const completedProgress =
    await readJsonStorageValue<AccountKeyRepairProgress>(
      serviceWorker,
      ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_PROGRESS,
    )

  expect(completedProgress?.summary).toMatchObject({
    created: 1,
    availableGroups: 2,
    coveredGroups: 2,
    createdKeys: 1,
    invalidKeys: 1,
  })
  expect(completedProgress?.results[0]).toMatchObject({
    accountId,
    accountName: "Key Repair Source",
    availableGroups: ["default", "vip"],
    coveredGroups: ["default", "vip"],
    createdGroups: ["vip"],
    invalidTokens: [
      expect.objectContaining({
        tokenId: 2,
        tokenName: "Legacy Group Key",
        group: "legacy",
      }),
    ],
  })

  await expect(page.getByText("Covered 2/2 groups")).toBeVisible()
  await expect(page.getByText("Created: vip")).toBeVisible()
  await expect(page.getByTestId("repair-missing-keys-result-count")).toHaveText(
    "1/1",
  )

  await page.getByRole("button", { name: /Invalid keys/ }).click()
  await expect(page.getByTestId("repair-missing-keys-result-count")).toHaveText(
    "1/1",
  )
  await expect(
    page.getByRole("checkbox", { name: "Legacy Group Key", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Group legacy is currently unavailable"),
  ).toBeVisible()

  await page
    .getByRole("checkbox", { name: "Legacy Group Key", exact: true })
    .click()
  await page.getByRole("button", { name: "Delete selected" }).click()
  await expect(
    page.getByText(
      "These keys will also be deleted from the corresponding sites and cannot be restored through the extension.",
    ),
  ).toBeVisible()
  await page.getByTestId("repair-invalid-keys-confirm-delete").click()

  await expect(page.getByText("Deleted 1 invalid key")).toBeVisible()
  await expect(page.getByText("No invalid keys")).toBeVisible()
  await expect(
    page.getByRole("checkbox", { name: "Legacy Group Key", exact: true }),
  ).toHaveCount(0)
  await expect(page.getByTestId("repair-missing-keys-result-count")).toHaveText(
    "0/0",
  )
  await expect
    .poll(
      async () => {
        const progress = await readJsonStorageValue<AccountKeyRepairProgress>(
          serviceWorker,
          ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_PROGRESS,
        )
        return progress?.summary.invalidKeys
      },
      { timeout: 10_000 },
    )
    .toBe(0)
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
