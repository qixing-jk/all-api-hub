import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_ROUTE_ACTIONS,
  ACCOUNT_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/AccountManagement/routeParams"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import {
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/KeyManagement/constants"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
import { UNIFIED_API_GUIDANCE_TEST_IDS } from "~/features/UnifiedApiGuidance/testIds"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import {
  AUTO_CHECKIN_RUN_RESULT,
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { getAccountKeyResourceRow } from "~~/e2e/utils/accountLifecycle"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedAutoCheckinStatus,
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

function createStubApiToken(overrides: Partial<NewApiToken> = {}): NewApiToken {
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

test("automation row shortcut hides again after mouse interaction", async ({
  extensionId,
  page,
}) => {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.OVERVIEW}`,
  )
  await waitForExtensionRoot(page)

  const automation = page.getByTestId(
    OPTIONS_OVERVIEW_TEST_IDS.automationOverview,
  )
  await expect(automation).toBeVisible()

  const row = automation.getByRole("button", {
    name: /^Auto check-in/,
  })
  const shortcut = automation.getByRole("button", {
    name: "Open Auto check-in",
  })

  await expect(shortcut).toHaveCSS("opacity", "0")

  await row.hover()
  await expect(shortcut).toHaveCSS("opacity", "1")

  await row.click()
  await page.mouse.move(0, 0)
  await expect(shortcut).toHaveCSS("opacity", "0")

  // Keyboard focus still reveals the shortcut for keyboard users.
  await page.keyboard.press("Tab")
  await expect(shortcut).toBeFocused()
  await expect(shortcut).toHaveCSS("opacity", "1")
})

test("overview attention list surfaces unknown site type check-in setup", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const account = createStoredAccount({
    id: "unknown-site-account",
    site_name: "Unknown Site",
    site_url: "https://unknown.example.com",
    site_type: SITE_TYPES.UNKNOWN,
    checkIn: {
      automaticExecutionEnabled: true,
      methodKnowledge: { methods: {} },
      selection: { mode: "automatic" },
    },
  })
  await seedStoredAccounts(serviceWorker, [account])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.OVERVIEW}`,
  )
  await waitForExtensionRoot(page)

  const attention = page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.needsAttention)
  const itemTitle = "Unknown Site has an unknown site type"
  await expect(attention).toBeVisible()
  await expect(attention.getByText(itemTitle)).toBeVisible()

  await attention
    .getByRole("button", { name: `Edit account: ${itemTitle}` })
    .click()

  await expect
    .poll(() => {
      const url = new URL(page.url())
      return {
        hash: url.hash,
        search: url.searchParams.get("search"),
      }
    })
    .toEqual({
      hash: `#${MENU_ITEM_IDS.ACCOUNT}`,
      search: "unknown-site-account",
    })
})

test("overview attention list flags disabled-only accounts", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "disabled-account",
      site_name: "Disabled Relay",
      site_url: "https://disabled.example.com",
      site_type: SITE_TYPES.NEW_API,
      disabled: true,
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.OVERVIEW}`,
  )
  await waitForExtensionRoot(page)

  const attention = page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.needsAttention)
  const itemTitle = "The only account is disabled"
  await expect(attention).toBeVisible()
  await expect(attention.getByText(itemTitle)).toBeVisible()
  await expect(attention.getByText("No accounts yet")).toHaveCount(0)

  await attention
    .getByRole("button", { name: `Manage accounts: ${itemTitle}` })
    .click()

  await expect
    .poll(() => {
      const url = new URL(page.url())
      return url.hash
    })
    .toBe(`#${MENU_ITEM_IDS.ACCOUNT}`)
})

test("overview attention list surfaces accounts paused by the global check-in switch", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const account = createStoredAccount({
    id: "paused-checkin-account",
    site_name: "Paused Relay",
    site_url: "https://paused.example.com",
    site_type: SITE_TYPES.NEW_API,
    checkIn: {
      automaticExecutionEnabled: true,
      methodKnowledge: { methods: {} },
      selection: { mode: "automatic" },
    },
  })
  await seedStoredAccounts(serviceWorker, [account])
  await seedUserPreferences(serviceWorker, {
    autoCheckin: {
      globalEnabled: false,
    },
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.OVERVIEW}`,
  )
  await waitForExtensionRoot(page)

  const attention = page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.needsAttention)
  const itemTitle = "Automatic check-in is off globally"
  await expect(attention).toBeVisible()
  await expect(attention.getByText(itemTitle)).toBeVisible()
  await expect(
    attention.getByText(
      /1 account has automatic check-in enabled, but nothing runs/u,
    ),
  ).toBeVisible()

  await attention
    .getByRole("button", { name: `Handle check-in: ${itemTitle}` })
    .click()

  await expect
    .poll(() => {
      const url = new URL(page.url())
      return {
        hash: url.hash,
        tab: url.searchParams.get("tab"),
        anchor: url.searchParams.get("anchor"),
      }
    })
    .toEqual({
      hash: `#${MENU_ITEM_IDS.BASIC}`,
      tab: "checkinRedeem",
      anchor: SETTINGS_ANCHORS.AUTO_CHECKIN,
    })

  await expect(
    page.locator(`#${SETTINGS_ANCHORS.AUTO_CHECKIN}`),
  ).toBeInViewport()
})
test("overview attention list surfaces missing sign-in data as a todo", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    autoCheckin: {
      globalEnabled: true,
      pretriggerDailyOnUiOpen: false,
    },
  })
  await seedAutoCheckinStatus(serviceWorker, {
    lastRunAt: new Date().toISOString(),
    lastRunResult: AUTO_CHECKIN_RUN_RESULT.PARTIAL,
    perAccount: {
      "skipped-account": {
        accountId: "skipped-account",
        accountName: "Skipped Relay",
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
        timestamp: 1,
      },
      "routine-account": {
        accountId: "routine-account",
        accountName: "Routine Relay",
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY,
        timestamp: 1,
      },
    },
    summary: {
      totalEligible: 2,
      executed: 2,
      successCount: 1,
      failedCount: 0,
      skippedCount: 1,
      needsRetry: false,
    },
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.OVERVIEW}`,
  )
  await waitForExtensionRoot(page)

  const attention = page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.needsAttention)
  const itemTitle = "1 account is missing saved sign-in data"
  await expect(attention).toBeVisible()
  await expect(attention.getByText(itemTitle)).toBeVisible()
  await expect(attention.getByText("Routine Relay")).toHaveCount(0)

  const severityFilters = attention.getByTestId(
    OPTIONS_OVERVIEW_TEST_IDS.attentionSeverityFilters,
  )
  await expect(
    severityFilters.getByRole("button", { name: "Warning 1" }),
  ).toBeVisible()

  const categoryFilters = attention.getByTestId(
    OPTIONS_OVERVIEW_TEST_IDS.attentionCategoryFilters,
  )
  const automationFilter = categoryFilters.getByRole("button", {
    name: "Automation 1",
  })
  await expect(automationFilter).toBeVisible()
  await automationFilter.click()
  await expect(attention.getByText("No API profiles yet")).toHaveCount(0)
  await expect(attention.getByText(itemTitle)).toBeVisible()

  await attention
    .getByRole("button", { name: `Fix account: ${itemTitle}` })
    .click()

  await expect
    .poll(() => {
      const url = new URL(page.url())
      return { hash: url.hash }
    })
    .toEqual({ hash: `#${MENU_ITEM_IDS.AUTO_CHECKIN}` })

  await expect(
    page.getByRole("button", { name: "Run now", exact: true }),
  ).toBeVisible()
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
      }
    })
    .toEqual({
      hash: `#${MENU_ITEM_IDS.BASIC}`,
      tab: "checkinRedeem",
      anchor: SETTINGS_ANCHORS.AUTO_CHECKIN,
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

test("overview add-account guidance opens the account dialog", async ({
  extensionId,
  page,
}) => {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.OVERVIEW}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const guidance = page.getByTestId(
    OPTIONS_OVERVIEW_TEST_IDS.unifiedApiGuidance,
  )
  await expect(guidance).toBeVisible()
  await guidance
    .getByRole("button", { name: "View steps", exact: true })
    .click()
  await guidance
    .getByTestId(UNIFIED_API_GUIDANCE_TEST_IDS.primaryAction)
    .click()

  await expect
    .poll(() => {
      const url = new URL(page.url())
      return {
        hash: url.hash,
        action: url.searchParams.get(ACCOUNT_MANAGEMENT_ROUTE_PARAMS.Action),
      }
    })
    .toEqual({
      hash: `#${MENU_ITEM_IDS.ACCOUNT}`,
      action: ACCOUNT_MANAGEMENT_ROUTE_ACTIONS.Add,
    })

  const accountDialog = page.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog,
  )
  await expect(accountDialog).toBeVisible()
  await expect(
    accountDialog.getByRole("heading", { name: "Add Account" }),
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
    .getByRole("button", { name: "View steps", exact: true })
    .click()
  await guidance
    .getByTestId(UNIFIED_API_GUIDANCE_TEST_IDS.primaryAction)
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
  const tokenRow = getAccountKeyResourceRow(page, "Existing Key")
  await expect(tokenRow).toBeVisible()

  const importButton = tokenRow.getByTestId(
    KEY_MANAGEMENT_TEST_IDS.importToManagedSiteButton,
  )
  await expect(importButton).toHaveAttribute("data-guidance-highlight", "true")
  await expect(importButton).toBeFocused()
})
