import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
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
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

// The host is a neutral fixture even though the registered method is named after
// the deployment brand it was observed on. All requests are intercepted; this
// verifies the built extension, not a live site.
for (const scenario of ["award", "already_checked", "lost_response"] as const) {
  test(`小白Code check-in: ${scenario}`, async ({
    context,
    extensionId,
    page,
  }) => {
    const worker = await getServiceWorker(context)
    const calls: string[] = []
    let checked = scenario === "already_checked"
    await stubLlmMetadataIndex(context)
    await context.route("https://relay.example/**", async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const envelope = async (data: unknown) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data }),
        })
      if (url.pathname === "/checkin/api/status") {
        calls.push("GET status")
        expect(request.headers().authorization).toBe("Bearer e2e-token")
        await envelope({ config: { enabled: true }, signedToday: checked })
      } else if (
        url.pathname === "/checkin/api/checkin" &&
        request.method() === "POST"
      ) {
        calls.push("POST checkin")
        expect(request.headers().authorization).toBe("Bearer e2e-token")
        expect(request.postData()).toBe("{}")
        const alreadyChecked = checked
        checked = true
        if (scenario === "lost_response") await route.abort("failed")
        else
          await envelope({
            alreadyChecked,
            record: { checkin_date: "2026-09-26", reward_amount: "0.25" },
          })
      } else {
        // A host without the app answers every other path from its SPA shell.
        calls.push(`SPA ${url.pathname}`)
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><html><body>spa</body></html>",
        })
      }
    })
    const methodId = AUTO_CHECKIN_METHOD_IDS.XiaobaiCodeDailyCheckIn
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "xiaobai-code-e2e",
        site_name: "Neutral Relay",
        site_url: "https://relay.example",
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
          return status?.perAccount?.["xiaobai-code-e2e"]?.status
        },
        { timeout: 15000 },
      )
      .toBe(scenario === "already_checked" ? "skipped" : "success")
    // Other background traffic also reaches this origin, so only the check-in
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
