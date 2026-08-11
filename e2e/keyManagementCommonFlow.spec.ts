import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import {
  getKeyManagementTokenRowTestId,
  getManagedSiteBatchExportRowSelectTestId,
  KEY_MANAGEMENT_TEST_IDS,
} from "~/features/KeyManagement/testIds"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import { buildAccountTokenRuntimeKeyId } from "~/services/accounts/accountRuntimeKeys"
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
import {
  deleteTokenFromKeyManagementPage,
  openKeyManagementForAccount,
  saveTokenToApiCredentialProfilesFromKeyManagementPage,
} from "~~/e2e/utils/accountLifecycle"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  expectPlasmoStorageJsonValueToBecome,
  getPlasmoStorageJsonValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { seedMockAccountFixture } from "~~/e2e/utils/mockedSite/accountFixtures"
import { isRealSiteTestTokenName } from "~~/e2e/utils/realSite/keyManagement"

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

const MANAGED_SITE_IMPORT_TARGET_ORIGIN =
  "https://managed-target.example.invalid"

async function stubManagedSiteImportTargetRoutes(
  context: Parameters<typeof stubNewApiSiteRoutes>[0],
) {
  const createPayloads: unknown[] = []

  await context.route(
    `${MANAGED_SITE_IMPORT_TARGET_ORIGIN}/**`,
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const method = request.method()

      if (
        method === "GET" &&
        (url.pathname === "/api/channel/" ||
          url.pathname === "/api/channel/search")
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "ok",
            data: { items: [], total: 0, type_counts: {} },
          }),
        })
        return
      }

      if (method === "GET" && url.pathname === "/api/group") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "ok",
            data: ["default"],
          }),
        })
        return
      }

      if (method === "GET" && url.pathname === "/api/user/self/groups") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "ok",
            data: { default: { desc: "Default", ratio: 1 } },
          }),
        })
        return
      }

      if (method === "GET" && url.pathname === "/api/user/models") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "ok",
            data: ["gpt-4o-mini", "gpt-4.1-mini"],
          }),
        })
        return
      }

      if (method === "POST" && url.pathname === "/api/channel/") {
        createPayloads.push(request.postDataJSON())
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, message: "created" }),
        })
        return
      }

      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          message: `Unhandled managed-site import route: ${method} ${url.pathname}`,
        }),
      })
    },
  )

  return { createPayloads }
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

test("cleans stale test-owned tokens before creating a new token", async ({
  context,
  extensionId,
  page,
}) => {
  const tokenMutationResponses: string[] = []
  context.on("response", (response) => {
    const request = response.request()
    if (
      response
        .url()
        .startsWith("https://stale-key-cleanup.example.invalid/api/token/") &&
      ["DELETE", "POST"].includes(request.method())
    ) {
      tokenMutationResponses.push(request.method())
    }
  })
  const serviceWorker = await getServiceWorker(context)
  const accountFixture = await seedMockAccountFixture({
    serviceWorker,
    account: createStoredAccount({
      id: "e2e-stale-key-cleanup-account",
      site_url: "https://stale-key-cleanup.example.invalid",
    }),
  })
  await stubNewApiSiteRoutes(context, {
    baseUrl: "https://stale-key-cleanup.example.invalid",
    initialTokens: [
      createStubApiToken({ id: 1, name: "Personal Key" }),
      createStubApiToken({ id: 2, name: "AAH E2E Personal" }),
      createStubApiToken({ id: 3, name: "AAH E2E NewAPI abc123def4" }),
      createStubApiToken({ id: 4, name: "AAH E2E NewAPI zyx987wvu6" }),
    ],
  })

  await verifyAccountKeyLifecycleUsage({
    extensionId,
    page,
    serviceWorker,
    account: accountFixture,
    openFromAccountRow: false,
    cleanupAccountFixture: false,
    cleanupTokenNameMatcher: (tokenName) =>
      isRealSiteTestTokenName({ tokenName, label: "New API" }),
    buildTokenName: () => "AAH E2E NewAPI run123abcd",
  })

  await expect(
    page.getByRole("heading", { name: "Personal Key" }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "AAH E2E Personal", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", {
      name: "AAH E2E NewAPI abc123def4",
      exact: true,
    }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("heading", {
      name: "AAH E2E NewAPI zyx987wvu6",
      exact: true,
    }),
  ).toHaveCount(0)
  expect(tokenMutationResponses).toEqual(["DELETE", "DELETE", "POST", "DELETE"])
})

test("reports the create response instead of timing out on a missing token row", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const accountFixture = await seedMockAccountFixture({
    serviceWorker,
    account: createStoredAccount({
      id: "e2e-key-create-error-account",
      site_url: "https://key-create-error.example.invalid",
    }),
  })
  await stubNewApiSiteRoutes(context, {
    baseUrl: "https://key-create-error.example.invalid",
    createTokenError: {
      status: 200,
      message: "Fixture token quota reached",
    },
  })

  await expect(
    verifyAccountKeyLifecycleUsage({
      extensionId,
      page,
      serviceWorker,
      account: accountFixture,
      openFromAccountRow: false,
      buildTokenName: () => "E2E Rejected Key",
    }),
  ).rejects.toThrow("API key creation failed: Fixture token quota reached")
})

test("reports the delete response instead of timing out on a retained token row", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const accountFixture = await seedMockAccountFixture({
    serviceWorker,
    account: createStoredAccount({
      id: "e2e-key-delete-error-account",
      site_url: "https://key-delete-error.example.invalid",
    }),
  })
  await stubNewApiSiteRoutes(context, {
    baseUrl: "https://key-delete-error.example.invalid",
    deleteTokenError: {
      status: 200,
      message: "Fixture delete temporarily unavailable",
    },
  })

  await expect(
    verifyAccountKeyLifecycleUsage({
      extensionId,
      page,
      serviceWorker,
      account: accountFixture,
      openFromAccountRow: false,
      buildTokenName: () => "E2E Rejected Token",
    }),
  ).rejects.toThrow(
    "API key deletion failed: Fixture delete temporarily unavailable",
  )
  await expect(
    page.getByRole("heading", {
      name: "E2E Rejected Token",
      exact: true,
    }),
  ).toBeVisible()
})

test("ignores an unrelated success notification while deleting a token", async ({
  context,
  extensionId,
  page,
}) => {
  const baseUrl = "https://unrelated-delete-status.example.invalid"
  const token = createStubApiToken({
    id: 81,
    name: "E2E Deletion Target",
  })
  const serviceWorker = await getServiceWorker(context)
  const accountFixture = await seedMockAccountFixture({
    serviceWorker,
    account: createStoredAccount({
      id: "e2e-unrelated-delete-status-account",
      site_url: baseUrl,
    }),
  })
  await stubNewApiSiteRoutes(context, {
    baseUrl,
    initialTokens: [token],
  })
  await page.route(`${baseUrl}/api/token/${token.id}`, async (route) => {
    if (route.request().method() === "DELETE") {
      await page.evaluate((openProfilesButtonTestId) => {
        const status = document.createElement("div")
        status.setAttribute("role", "status")
        status.textContent = "Saved fixture key to API credential library"
        const action = document.createElement("button")
        action.dataset.testid = openProfilesButtonTestId
        action.textContent = "Open API credential library"
        status.append(action)
        document.body.append(status)
      }, TOKEN_PROVISIONING_TEST_IDS.openApiProfilesToastButton)
    }
    await route.fallback()
  })

  const keyManagementPage = await openKeyManagementForAccount({
    page,
    extensionId,
    accountId: accountFixture.accountId,
    siteType: accountFixture.siteType,
    baseUrl: accountFixture.baseUrl,
    openFromAccountRow: false,
  })
  await deleteTokenFromKeyManagementPage({
    page: keyManagementPage,
    token: { id: token.id, name: token.name },
  })

  await expect(
    keyManagementPage.getByTestId(getKeyManagementTokenRowTestId(token.id)),
  ).toHaveCount(0)
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
  const { createPayloads } = await stubManagedSiteImportTargetRoutes(context)

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
  await seedUserPreferences(serviceWorker, {
    managedSiteType: SITE_TYPES.NEW_API,
    newApi: {
      baseUrl: MANAGED_SITE_IMPORT_TARGET_ORIGIN,
      adminToken: "managed-target-admin-token",
      userId: "1",
      username: "",
      password: "",
      totpSecret: "",
    },
  })
  await stubNewApiSiteRoutes(context, {
    baseUrl,
    accessToken: "repair-token",
    username: "repair-user",
    groups: {
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 1.5 },
      alpha: { desc: "Alpha", ratio: 2 },
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

  await expectPlasmoStorageJsonValueToBecome<
    AccountKeyRepairProgress,
    string | undefined
  >(
    serviceWorker,
    ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_PROGRESS,
    (progress) => progress?.state,
    ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
  )

  const completedProgress =
    await getPlasmoStorageJsonValue<AccountKeyRepairProgress>(
      serviceWorker,
      ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_PROGRESS,
    )

  expect(completedProgress?.summary).toMatchObject({
    created: 1,
    availableGroups: 3,
    coveredGroups: 3,
    createdKeys: 2,
    invalidKeys: 1,
  })
  expect(completedProgress?.results[0]).toMatchObject({
    accountId,
    accountName: "Key Repair Source",
    availableGroups: ["default", "vip", "alpha"],
    coveredGroups: ["default", "vip", "alpha"],
    createdGroups: ["vip", "alpha"],
    createdTokens: [
      { tokenId: 3, group: "vip" },
      { tokenId: 4, group: "alpha" },
    ],
    invalidTokens: [
      expect.objectContaining({
        tokenId: 2,
        tokenName: "Legacy Group Key",
        group: "legacy",
      }),
    ],
  })

  await expect(page.getByText("Covered 3/3 groups")).toBeVisible()
  await expect(page.getByText("Created: vip")).toBeVisible()
  await expect(page.getByText("Created: alpha")).toBeVisible()
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
  await expectPlasmoStorageJsonValueToBecome<
    AccountKeyRepairProgress,
    number | undefined
  >(
    serviceWorker,
    ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_PROGRESS,
    (progress) => progress?.summary.invalidKeys,
    0,
    10_000,
  )

  await page
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton)
    .click()

  const batchImportDialog = page.getByRole("dialog").filter({
    has: page.getByText("Batch import to self-hosted AI gateway", {
      exact: true,
    }),
  })
  const vipRowLabel = "Key Repair Source / vip group (auto)"
  const alphaRowLabel = "Key Repair Source / alpha group (auto)"

  await expect(batchImportDialog).toBeVisible()
  await expect(
    batchImportDialog.getByTestId(
      KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportUseCompleteChecksButton,
    ),
  ).toBeVisible()
  await expect(
    batchImportDialog.getByTestId(
      getManagedSiteBatchExportRowSelectTestId(
        buildAccountTokenRuntimeKeyId(accountId, 3),
      ),
    ),
  ).toBeVisible()
  await expect(
    batchImportDialog.getByTestId(
      getManagedSiteBatchExportRowSelectTestId(
        buildAccountTokenRuntimeKeyId(accountId, 4),
      ),
    ),
  ).toBeVisible()
  await expect(
    batchImportDialog.getByText(vipRowLabel, { exact: true }),
  ).toBeVisible()
  await expect(
    batchImportDialog.getByText(alphaRowLabel, { exact: true }),
  ).toBeVisible()

  const alphaRowCheckbox = batchImportDialog.getByTestId(
    getManagedSiteBatchExportRowSelectTestId(
      buildAccountTokenRuntimeKeyId(accountId, 4),
    ),
  )
  await expect(alphaRowCheckbox).toBeChecked()
  await alphaRowCheckbox.click()
  await expect(alphaRowCheckbox).not.toBeChecked()

  const startImportButton = batchImportDialog.getByTestId(
    KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportStartButton,
  )
  await expect(startImportButton).toBeEnabled()
  await startImportButton.click()

  await expect(
    page.getByRole("dialog", { name: "Import selected keys" }),
  ).toHaveCount(0)
  await expect.poll(() => createPayloads.length).toBe(1)
  await expect(
    batchImportDialog.getByText("Created", { exact: true }),
  ).toBeVisible()
  await expect(
    batchImportDialog.getByText("Not selected", { exact: true }),
  ).toBeVisible()
  await expect(
    batchImportDialog.getByText(vipRowLabel, { exact: true }),
  ).toBeVisible()
  await expect(
    batchImportDialog.getByText(alphaRowLabel, { exact: true }),
  ).toBeVisible()
  expect(createPayloads[0]).toMatchObject({
    mode: "single",
    channel: {
      name: "Key Repair Source | vip group (auto)",
      base_url: baseUrl,
      key: "sk-created-3",
    },
  })
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
