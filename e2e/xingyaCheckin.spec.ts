import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import type { AutoCheckinStatus } from "~/types/autoCheckin"
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
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

const ORIGIN = "https://xingya.site"
const STATUS_PATH = "/api/user/xingya-checkin"
const CLAIM_PATH = "/api/user/xingya-daily-claim"

for (const hostname of ["xingya.site", "xingya.space"] as const) {
  test(`xingya discovery selects and saves its protocol on ${hostname}`, async ({
    context,
    extensionId,
    extensionDir,
    page,
  }) => {
    const baseUrl = `https://${hostname}`
    const accountId = `discovery-${hostname}`
    const requests: Array<{ host: string; path: string; method: string }> = []
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context, {
      baseUrl,
      systemName: "Xingya",
      userId: 1,
    })
    await context.route(`${baseUrl}/api/status`, (route) =>
      route.fulfill({
        json: {
          success: true,
          message: "",
          data: {
            system_name: "Xingya",
            version: "xingya-rc50",
            checkin_enabled: false,
            xingya_checkin_available: true,
            api_info: [
              { url: "https://xingya.site/" },
              { url: "https://xingya.space" },
            ],
          },
        },
      }),
    )
    await context.route(`${baseUrl}/api/user/*checkin*`, (route) => {
      const url = new URL(route.request().url())
      requests.push({
        host: url.host,
        path: url.pathname,
        method: route.request().method(),
      })
      return route.fulfill({
        status: 401,
        json: {
          success: false,
          message: "Unauthorized",
          code: "AUTH_UNAUTHORIZED",
        },
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
        site_name: "Xingya discovery",
        site_type: SITE_TYPES.NEW_API,
        checkIn: {
          automaticExecutionEnabled: false,
          selection: {
            mode: "automatic",
            methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
          },
          methodKnowledge: { methods: {} },
        },
      }),
    ])
    installExtensionPageGuards(page, {
      ignoreConsoleError: (message) =>
        message.text().includes("status of 401") &&
        message.location().url.startsWith(`${baseUrl}/api/user/`),
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
      .getByRole("button", { name: "Detect check-in method", exact: true })
      .click()
    await expect(dialog.locator("#account-check-in-method")).toContainText(
      "Automatic selection: Xingya daily check-in",
    )
    await expect(
      dialog.getByText("Multiple methods detected; choose one", {
        exact: true,
      }),
    ).toHaveCount(0)
    await captureVisualViews({
      page,
      ready: dialog.locator("#account-check-in-method"),
      id: `xingya-discovery-${hostname.replaceAll(".", "-")}`,
      extensionDir,
    })
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
        mode: "automatic",
        methodId: AUTO_CHECKIN_METHOD_IDS.XingyaDailyCheckIn,
      })
    await openEditor()
    await expect(dialog.locator("#account-check-in-method")).toContainText(
      "Automatic selection: Xingya daily check-in",
    )
    expect(requests.length).toBeGreaterThan(0)
    expect(
      requests.every(
        (request) => request.host === hostname && request.method === "GET",
      ),
    ).toBe(true)
  })
}

// 星芽 serves its own `xingya-*` check-in routes from the same console origin it
// is saved under. The host is intercepted for every request, so this exercises
// the built extension rather than the live deployment.
for (const scenario of [
  "award",
  "already_checked",
  "claim_disabled",
  "lost_response",
  "session_required",
] as const) {
  test(`xingya check-in: ${scenario}`, async ({
    context,
    extensionId,
    page,
  }, testInfo) => {
    const worker = await getServiceWorker(context)
    const calls: string[] = []
    let checked = scenario === "already_checked"
    await stubLlmMetadataIndex(context)

    const statusEnvelope = (checkedToday: boolean) =>
      JSON.stringify({
        success: true,
        message: "",
        data: {
          claim_enabled: scenario === "claim_disabled" ? false : true,
          claim_round: 0,
          group: "签到-福利分组",
          group_accessible: true,
          max_reward: 15,
          min_reward: 5,
          month: "2026-10",
          month_quota: checkedToday ? 69350 : 0,
          records: checkedToday
            ? [
                {
                  checkin_date: "2026-10-25",
                  quota_awarded: 69350,
                  source: "checkin",
                },
              ]
            : [],
          today: "2026-10-25",
          today_record: {
            checked_in: checkedToday,
            quota_awarded: checkedToday ? 69350 : 0,
            source: "checkin",
          },
          wallet: { available: checkedToday ? 69350 : 0 },
        },
      })

    await context.route(`${ORIGIN}/**`, async (route) => {
      const request = route.request()
      const url = new URL(request.url())

      if (url.pathname === STATUS_PATH) {
        calls.push("GET status")
        // The read-only status route must never be posted through.
        expect(request.method()).toBe("GET")
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: statusEnvelope(checked),
        })
        return
      }

      if (url.pathname === CLAIM_PATH) {
        calls.push("POST claim")
        expect(request.method()).toBe("POST")
        // The console posts the claim without a body and without a Turnstile
        // token while the deployment reports `turnstile_check: false`.
        expect(request.postData()).toBeNull()
        expect(url.search).toBe("")
        if (scenario === "session_required") {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              code: "AUTH_SESSION_REQUIRED",
              message: "a dashboard login session is required",
            }),
          })
          return
        }
        checked = true
        if (scenario === "lost_response") {
          await route.abort("failed")
          return
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "",
            data: { already_claimed: false, quota_awarded: 69350 },
          }),
        })
        return
      }

      if (url.pathname.startsWith("/api/")) {
        // Any other console read is unrelated to this assertion set.
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, message: "", data: {} }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><body>app shell</body></html>",
      })
    })

    const methodId = AUTO_CHECKIN_METHOD_IDS.XingyaDailyCheckIn
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "xingya-e2e",
        site_name: "Neutral Sprout",
        site_url: ORIGIN,
        site_type: SITE_TYPES.NEW_API,
        checkIn: {
          automaticExecutionEnabled: true,
          selection: { mode: "automatic", methodId },
          methodKnowledge: {
            methods: {
              [methodId]: {
                detection: {
                  outcome: "matched",
                  evidence: { source: "probe", observedAt: Date.now() },
                },
              },
            },
          },
        },
      }),
    ])
    await seedUserPreferences(worker, {
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: false,
        pretriggerDailyOnUiOpen: false,
        notifyUiOnCompletion: true,
      },
    })
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "en")
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.AUTO_CHECKIN}`,
    )
    await waitForExtensionRoot(page)
    await page.getByRole("button", { name: "Run now", exact: true }).click()

    // A lost mutation answer is reconciled by reading status, never by
    // replaying the claim; the status route already reports the day claimed.
    const expectedStatus =
      scenario === "award" || scenario === "lost_response"
        ? "success"
        : scenario === "session_required"
          ? "failed"
          : "skipped"
    await expect
      .poll(
        async () => {
          const raw = await getPlasmoStorageRawValue<unknown>(
            worker,
            "autoCheckin_status",
          )
          const status =
            typeof raw === "string"
              ? (JSON.parse(raw) as AutoCheckinStatus)
              : null
          return status?.perAccount?.["xingya-e2e"]?.status
        },
        { timeout: 15000 },
      )
      .toBe(expectedStatus)

    const statusCalls = calls.filter((call) => call === "GET status")
    const claimCalls = calls.filter((call) => call === "POST claim")

    // Status is read before the mutation, and a day already claimed or a
    // deployment with claims paused never mutates at all.
    expect(calls[0]).toBe("GET status")
    if (scenario === "already_checked" || scenario === "claim_disabled") {
      expect(claimCalls).toHaveLength(0)
    } else {
      expect(claimCalls).toHaveLength(1)
    }
    if (scenario === "lost_response") {
      // A lost mutation answer is reconciled by reading status, not by replaying.
      expect(statusCalls.length).toBeGreaterThan(1)
    }

    const raw = await getPlasmoStorageRawValue<unknown>(
      worker,
      "autoCheckin_status",
    )
    const status =
      typeof raw === "string" ? (JSON.parse(raw) as AutoCheckinStatus) : null
    const result = status?.perAccount?.["xingya-e2e"]
    if (scenario === "award") {
      expect(result?.awards).toMatchObject([
        {
          asset: { kind: "currency", code: "USD" },
          amount: { status: "known", value: "0.1387" },
          fulfillment: "credited",
        },
      ])
    }

    await expect(
      page.getByRole("row").filter({ hasText: "Neutral Sprout" }),
    ).toBeVisible()
    if (scenario === "session_required") {
      const row = page.getByRole("row").filter({ hasText: "Neutral Sprout" })
      await expect(row).toContainText("Failed")
      expect(result?.reasonCode).toBe("authentication_required")
      await expect(
        row.getByRole("button", { name: "Set up login" }),
      ).toBeVisible()
      await expect(
        page.getByText("Auto check-in completed.", { exact: true }),
      ).toBeHidden()
      await page.emulateMedia({ reducedMotion: "reduce" })
      await row.screenshot({
        path: testInfo.outputPath("session-required.png"),
        animations: "disabled",
      })
    }
  })
}
