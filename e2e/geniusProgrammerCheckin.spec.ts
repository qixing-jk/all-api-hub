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

// All deployment requests are intercepted; this verifies the built extension,
// not live-site availability or an actual account reward.
for (const scenario of ["award", "already_checked", "lost_response"] as const) {
  test(`Genius Programmer check-in: ${scenario}`, async ({
    context,
    extensionId,
    page,
  }) => {
    const worker = await getServiceWorker(context)
    const calls: string[] = []
    let checked = scenario === "already_checked"
    await stubLlmMetadataIndex(context)
    await context.route("https://codexcli.club/**", async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const envelope = async (data: unknown) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ code: 0, message: "success", data }),
        })
      if (url.pathname === "/api/v1/user/checkin/status") {
        calls.push("GET status")
        expect(request.headers().authorization).toBe("Bearer e2e-token")
        expect(url.searchParams.get("timezone")).toBeTruthy()
        await envelope({
          enabled: true,
          today_checked_in: checked,
          reward_amount: 0.05,
        })
      } else if (
        url.pathname === "/api/v1/user/checkin" &&
        request.method() === "POST"
      ) {
        calls.push("POST checkin")
        expect(request.headers().authorization).toBe("Bearer e2e-token")
        expect(request.postData()).toBeNull()
        checked = true
        if (scenario === "lost_response") await route.abort("failed")
        else await envelope({ new_reward: true, reward_amount: 0.05 })
      } else {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ code: 404, message: "not found" }),
        })
      }
    })
    const methodId = AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "genius-programmer-e2e",
        site_name: "天才程序员中转站",
        site_url: "https://codexcli.club",
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
          return status?.perAccount?.["genius-programmer-e2e"]?.status
        },
        { timeout: 15000 },
      )
      .toBe(scenario === "already_checked" ? "skipped" : "success")
    expect(calls[0]).toBe("GET status")
    expect(calls.filter((call) => call === "POST checkin")).toHaveLength(
      scenario === "already_checked" ? 0 : 1,
    )
    if (scenario === "lost_response") expect(calls.at(-1)).toBe("GET status")
    await expect(
      page.getByRole("row").filter({ hasText: "天才程序员中转站" }),
    ).toBeVisible()
  })
}
