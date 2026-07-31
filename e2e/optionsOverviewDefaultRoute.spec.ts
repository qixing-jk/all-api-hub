import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import {
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/KeyManagement/constants"
import {
  getKeyManagementTokenRowTestId,
  KEY_MANAGEMENT_TEST_IDS,
} from "~/features/KeyManagement/testIds"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
import type { ApiToken } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
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
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const MANAGED_SITE_BASE_URL = "https://managed-gateway.example.invalid"

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

async function stubManagedSiteAdminRoutes(
  context: Parameters<typeof stubNewApiSiteRoutes>[0],
) {
  const origin = new URL(MANAGED_SITE_BASE_URL).origin

  await context.route(`${origin}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (
      request.method() === "GET" &&
      (url.pathname === "/api/channel/" ||
        url.pathname === "/api/channel/search")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: {
            items: [],
            total: 0,
            type_counts: {},
          },
        }),
      })
      return
    }

    if (request.method() === "GET" && url.pathname === "/api/group") {
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

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: `Unhandled managed-site E2E route: ${url.pathname}`,
      }),
    })
  })
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("options default route opens overview and preserves explicit basic links", async ({
  extensionId,
  page,
}) => {
  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
  await expect(page).toHaveURL(new RegExp(`#${MENU_ITEM_IDS.OVERVIEW}$`))
  await expect(page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.page)).toBeVisible()

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await expect(page).toHaveURL(new RegExp(`#${MENU_ITEM_IDS.BASIC}$`))
})

test("overview action center opens disabled auto check-in settings", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    autoCheckin: {
      globalEnabled: false,
    },
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.OVERVIEW}`,
  )
  await waitForExtensionRoot(page)

  await expect(page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.page)).toBeVisible()
  const actionCenter = page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.actionCenter)
  await expect(actionCenter).toBeVisible()

  await actionCenter
    .getByRole("button", { name: "Auto check-in", exact: true })
    .click()

  await expect
    .poll(() => {
      const url = new URL(page.url())
      return {
        hash: url.hash,
        tab: url.searchParams.get("tab"),
        anchor: url.searchParams.get("anchor"),
        highlight: url.searchParams.get("highlight"),
      }
    })
    .toEqual({
      hash: `#${MENU_ITEM_IDS.BASIC}`,
      tab: "checkinRedeem",
      anchor: SETTINGS_ANCHORS.AUTO_CHECKIN,
      highlight: SETTINGS_ANCHORS.AUTO_CHECKIN,
    })

  await expect(page.getByTestId(BASIC_SETTINGS_TEST_IDS.page)).toBeVisible()
  await expect(
    page.locator(`#${SETTINGS_ANCHORS.AUTO_CHECKIN}`),
  ).toBeInViewport()
  await expect(
    page
      .locator(`#${SETTINGS_ANCHORS.AUTO_CHECKIN}`)
      .getByRole("heading", { name: "Auto Check-in", exact: true }),
  ).toBeVisible()
})

test("overview gateway CTA opens key management with guided account import highlighted", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const account = createStoredAccount()
  await seedStoredAccounts(serviceWorker, [account])
  await seedUserPreferences(serviceWorker, {
    managedSiteType: SITE_TYPES.NEW_API,
    newApi: {
      baseUrl: MANAGED_SITE_BASE_URL,
      adminToken: "managed-site-admin-token",
      userId: "1",
      username: "",
      password: "",
      totpSecret: "",
    },
  })
  await stubNewApiSiteRoutes(context, {
    initialTokens: [createStubApiToken()],
  })
  await stubManagedSiteAdminRoutes(context)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.OVERVIEW}`,
  )
  await waitForExtensionRoot(page)

  const guidance = page.getByTestId(
    OPTIONS_OVERVIEW_TEST_IDS.unifiedApiGuidance,
  )
  await expect(guidance).toBeVisible()
  await guidance
    .getByRole("button", { name: "Add first gateway channel" })
    .click()

  await expect
    .poll(() => {
      const url = new URL(page.url())
      return {
        hash: url.hash,
        accountId: url.searchParams.get("accountId"),
        guidedImport: url.searchParams.get(
          KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport,
        ),
        tokenId: url.searchParams.get(KEY_MANAGEMENT_ROUTE_PARAMS.TokenId),
      }
    })
    .toEqual({
      hash: `#${MENU_ITEM_IDS.KEYS}`,
      accountId: account.id,
      guidedImport: KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS.ManagedSite,
      tokenId: null,
    })

  await expectPermissionOnboardingHidden(page)
  const tokenRow = page.getByTestId(getKeyManagementTokenRowTestId(1))
  await expect(tokenRow).toBeVisible()

  const importButton = tokenRow.getByTestId(
    KEY_MANAGEMENT_TEST_IDS.importToManagedSiteButton,
  )
  await expect(importButton).toHaveAttribute("data-guidance-highlight", "true")
  await expect(importButton).toBeFocused()
})
