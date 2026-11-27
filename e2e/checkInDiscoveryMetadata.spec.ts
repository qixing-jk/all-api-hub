import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

// Two independently recognized fork protocols; only their advertised addresses differ.
for (const scenario of [
  "api-base",
  "custom-endpoint",
  "equal-overlap",
  "metadata-failed",
] as const) {
  test(`Sub2API check-in metadata: ${scenario}`, async ({
    context,
    extensionId,
    extensionDir,
    page,
  }) => {
    const baseUrl = "https://checkin-metadata.example"
    const accountId = `checkin-metadata-${scenario}`
    const requests: Array<{
      path: string
      method: string
      authorization?: string
    }> = []
    await stubLlmMetadataIndex(context)
    await context.route(`${baseUrl}/**`, async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const headers = await request.allHeaders()
      requests.push({
        path,
        method: request.method(),
        authorization: headers.authorization,
      })
      if (path === "/api/v1/user/checkin/status")
        return route.fulfill({
          json: {
            code: 0,
            message: "",
            data: {
              enabled: true,
              today_checked_in: false,
              recent_records: [],
            },
          },
        })
      if (path === "/api/v1/engagement/checkin/status")
        return route.fulfill({
          json: {
            code: 0,
            message: "",
            data: {
              checkin_enabled: true,
              checked_in_today: false,
              can_checkin: true,
            },
          },
        })
      if (path === "/api/v1/settings/public") {
        if (scenario === "metadata-failed")
          return route.fulfill({
            status: 503,
            json: { code: 503, message: "Unavailable" },
          })
        const data =
          scenario === "api-base"
            ? { api_base_url: "https://codexcli.club/v1" }
            : scenario === "custom-endpoint"
              ? {
                  custom_endpoints: [
                    { name: "Route", endpoint: "https://api.codexcli.club/v1" },
                  ],
                }
              : {
                  api_base_url: "https://codexcli.club/v1",
                  custom_endpoints: [{ endpoint: "https://toolcode.top/v1" }],
                }
        return route.fulfill({ json: { code: 0, message: "", data } })
      }
      // Other registered protocols are authoritatively absent on this deployment.
      return route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: "404 page not found",
      })
    })
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      refreshOnOpen: false,
      autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
    })
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: accountId,
        site_url: baseUrl,
        site_name: "Check-in metadata",
        site_type: SITE_TYPES.SUB2API,
        checkIn: {
          automaticExecutionEnabled: false,
          selection: { mode: "automatic" },
          methodKnowledge: { methods: {} },
        },
      }),
    ])
    installExtensionPageGuards(page, {
      ignoreConsoleError: (message) =>
        message.location().url.startsWith(baseUrl) &&
        /status of (404|503)/.test(message.text()),
    })
    await forceExtensionLanguage(page, "en")
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
    )
    await waitForExtensionRoot(page)
    const row = page.getByTestId(getAccountManagementListItemTestId(accountId))
    const openEditor = async () => {
      await row.hover()
      await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
      await expect(page.getByRole("dialog")).toBeVisible()
    }
    await openEditor()
    const dialog = page.getByRole("dialog")
    await dialog
      .getByRole("button", { name: "Detect method", exact: true })
      .click()
    // The selection updates before the discovery promise clears its running state.
    await expect(
      dialog.getByRole("button", {
        name: "Detect method",
        exact: true,
      }),
    ).toBeEnabled()
    const selected = scenario === "api-base" || scenario === "custom-endpoint"
    const method = dialog.locator("#account-check-in-method")
    await expect(method).toContainText(
      selected
        ? "Automatic selection: Genius Programmer Relay daily check-in"
        : "Multiple methods detected; choose one",
    )
    await captureVisualViews({
      page,
      ready: method,
      id: `sub2api-metadata-${scenario}`,
      extensionDir,
    })
    expect(
      requests.filter((request) => request.path === "/api/v1/settings/public"),
    ).toEqual([
      {
        path: "/api/v1/settings/public",
        method: "GET",
        authorization: undefined,
      },
    ])
    expect(requests.every((request) => request.method === "GET")).toBe(true)
    if (!selected) {
      await method.click()
      await page
        .getByRole("option", {
          name: "Genius Programmer Relay daily check-in",
          exact: true,
        })
        .click()
      await expect(method).toContainText(
        "Genius Programmer Relay daily check-in",
      )
    }
    await dialog
      .getByRole("button", { name: "Save Changes", exact: true })
      .click()
    await expect(dialog).toBeHidden()
    await expect
      .poll(async () => {
        const raw = await getPlasmoStorageRawValue(
          worker,
          ACCOUNT_STORAGE_KEYS.ACCOUNTS,
        )
        const store = typeof raw === "string" ? JSON.parse(raw) : raw
        return store.accounts.find(
          (account: { id: string }) => account.id === accountId,
        ).checkIn.selection
      })
      .toEqual({
        mode: selected ? "automatic" : "manual",
        methodId: AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn,
      })
    await openEditor()
    await expect(dialog.locator("#account-check-in-method")).toContainText(
      selected
        ? "Automatic selection: Genius Programmer Relay daily check-in"
        : "Genius Programmer Relay daily check-in",
    )
  })
}
