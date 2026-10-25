import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
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
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

test("validates, saves and clears a deployment check-in route", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const baseUrl = "https://route-edit.example.invalid"
  await stubNewApiSiteRoutes(context, {
    baseUrl,
    userId: 1,
    systemName: "Route editing",
  })
  await context.route(`${baseUrl}/api/user/manual?*`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          enabled: true,
          stats: { checked_in_today: false, records: [] },
        },
      },
    }),
  )
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    autoCheckin: {
      ...DEFAULT_PREFERENCES.autoCheckin!,
      globalEnabled: false,
      pretriggerDailyOnUiOpen: false,
    },
  })
  const methodId = AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "route-edit",
      site_name: "Route editing",
      site_url: baseUrl,
      site_type: SITE_TYPES.NEW_API,
      checkIn: {
        automaticExecutionEnabled: false,
        selection: { mode: "automatic", methodId },
        methodKnowledge: { methods: {} },
        routeOverrides: {
          [methodId]: {
            path: "/api/user/old",
            source: "discovery",
            observedAt: 1,
          },
        },
      },
    }),
  ])
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  const row = page.getByTestId(getAccountManagementListItemTestId("route-edit"))
  const openEditor = async () => {
    await row.hover()
    await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
    await expect(page.getByRole("dialog")).toBeVisible()
  }
  await openEditor()
  const dialog = page.getByRole("dialog")
  const input = dialog.getByLabel("Check-in API path (optional)", {
    exact: true,
  })
  const save = dialog.getByRole("button", { name: "Save Changes", exact: true })
  await expect(input).toHaveValue("/api/user/old")
  await input.fill("https://route-edit.example.invalid/api/user/new")
  const error = dialog.getByText(
    "Enter a same-site path starting with /, without a host, query, or fragment.",
    { exact: true },
  )
  await expect(error).toBeVisible()
  await expect(input).toHaveAttribute("aria-invalid", "true")
  await save.click()
  await expect(dialog).toBeVisible()
  await error.click()
  await captureVisualViews({
    page,
    ready: error,
    id: "checkin-route-invalid",
    extensionDir,
  })

  await input.fill("/api/user/manual")
  await expect(error).toHaveCount(0)
  await save.click()
  await expect(dialog).toBeHidden()
  await openEditor()
  await expect(input).toHaveValue("/api/user/manual")
  await input.clear()
  await save.click()
  await expect(dialog).toBeHidden()
  await openEditor()
  await expect(input).toHaveValue("")
  await captureVisualViews({
    page,
    ready: input,
    id: "checkin-route-cleared",
    extensionDir,
  })
})
