import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import type { AutoCheckinStatus } from "~/types/autoCheckin"
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

const DASHBOARD_ORIGIN = "https://ai-router.dev"
const API_ORIGIN = "https://api.ai-router.dev"
const CHECK_IN_PATH = "/api/v1/user/daily-checkin"

// AI-ROUTER keeps its dashboard and its API on different origins, so this also
// verifies the built extension routes account requests to the API origin. The
// hosts are neutral fixtures: every request is intercepted, so this exercises
// the extension rather than the live deployment.
for (const scenario of ["award", "already_checked", "lost_response"] as const) {
  test(`AI-ROUTER check-in: ${scenario}`, async ({
    context,
    extensionId,
    page,
  }) => {
    const worker = await getServiceWorker(context)
    const calls: string[] = []
    let checked = scenario === "already_checked"
    await stubLlmMetadataIndex(context)

    const statusEnvelope = (checkedToday: boolean) =>
      JSON.stringify({
        code: 0,
        message: "success",
        data: {
          enabled: true,
          reward_amount: 1,
          base_reward_amount: 1,
          yesterday_actual_cost: 0,
          yesterday_usage_reward_percent: 2,
          yesterday_usage_reward_amount: 0,
          max_reward_amount: 10,
          checked_today: checkedToday,
          next_reset_at: "2026-09-28T00:00:00Z",
          checkin_date: "2026-09-27",
          eligible: true,
        },
      })

    await context.route(`${DASHBOARD_ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.startsWith("/api/")) {
        // The dashboard origin must not answer the API for this deployment.
        calls.push(`WRONG ORIGIN ${url.pathname}`)
      }
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><body>app shell</body></html>",
      })
    })

    await context.route(`${API_ORIGIN}/**`, async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.pathname !== CHECK_IN_PATH) {
        calls.push(`API ${request.method()} ${url.pathname}`)
        await route.fulfill({
          status: 404,
          contentType: "text/plain",
          body: "404 page not found",
        })
        return
      }

      // The deployment's own dashboard sends the browser timezone on reads.
      if (request.method() === "GET") {
        calls.push("GET status")
        expect(url.searchParams.get("timezone")).toBeTruthy()
        expect(request.headers().authorization).toBe("Bearer e2e-token")
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: statusEnvelope(checked),
        })
        return
      }

      calls.push("POST checkin")
      expect(request.postData()).toBeNull()
      expect(
        request.headers()["x-ai-router-client-fingerprint"],
      ).toBeUndefined()
      checked = true
      if (scenario === "lost_response") {
        await route.abort("failed")
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: statusEnvelope(true),
      })
    })

    const methodId = AUTO_CHECKIN_METHOD_IDS.AiRouterDailyCheckIn
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "ai-router-e2e",
        site_name: "Neutral Relay",
        site_url: DASHBOARD_ORIGIN,
        site_type: SITE_TYPES.SUB2API,
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
          return status?.perAccount?.["ai-router-e2e"]?.status
        },
        { timeout: 15000 },
      )
      .toBe(scenario === "already_checked" ? "skipped" : "success")

    // The dashboard origin never served the API, so the account URL was not used
    // as the request base.
    expect(calls.filter((call) => call.startsWith("WRONG ORIGIN"))).toEqual([])

    // Other background traffic also reaches the API origin, so only the check-in
    // calls are ordered here.
    const checkInCalls = calls.filter(
      (call) => call === "GET status" || call === "POST checkin",
    )
    expect(checkInCalls[0]).toBe("GET status")
    expect(checkInCalls.filter((call) => call === "POST checkin")).toHaveLength(
      scenario === "already_checked" ? 0 : 1,
    )
    if (scenario === "lost_response") {
      expect(checkInCalls.at(-1)).toBe("GET status")
    }
    await expect(
      page.getByRole("row").filter({ hasText: "Neutral Relay" }),
    ).toBeVisible()
  })
}
