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

// All deployment requests are intercepted; this verifies the built extension,
// not live-site availability or an actual account reward. The payload shapes
// mirror the contract verified at https://api.clawhud.com on 2026-10-11,
// including the duplicate-mutation 409 envelope with its upstream reason.
for (const scenario of [
  "award",
  "already_checked",
  "duplicate_rejected",
  "lost_response",
] as const) {
  test(`Clawhud check-in: ${scenario}`, async ({
    context,
    extensionId,
    page,
  }) => {
    const worker = await getServiceWorker(context)
    const calls: string[] = []
    let checked = scenario === "already_checked"
    await stubLlmMetadataIndex(context)
    await context.route("https://api.clawhud.com/**", async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const envelope = async (data: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ code: 0, message: "success", data }),
        })
      if (url.pathname === "/api/v1/user/checkin/status") {
        calls.push("GET status")
        expect(request.headers().authorization).toBe("Bearer e2e-token")
        expect(url.searchParams.get("timezone")).toBeTruthy()
        await envelope({
          enabled: true,
          checked_in_today: checked,
          today: "2026-10-11",
          timezone: "Asia/Taipei",
          min_amount: 1,
          max_amount: 10,
          today_amount: checked ? 1.14 : 0,
          total_count: checked ? 1 : 0,
          total_amount: checked ? 1.14 : 0,
        })
      } else if (
        url.pathname === "/api/v1/user/checkin" &&
        request.method() === "POST"
      ) {
        calls.push("POST checkin")
        expect(request.headers().authorization).toBe("Bearer e2e-token")
        expect(request.postData()).toBeNull()
        if (scenario === "lost_response") {
          // The write took effect even though its response was lost; the
          // reconciling status read must confirm it without a replay.
          checked = true
          await route.abort("failed")
          return
        }
        if (scenario === "duplicate_rejected") {
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              code: 409,
              message: "already checked in today",
              reason: "CHECKIN_ALREADY_DONE",
            }),
          })
          return
        }
        checked = true
        await envelope({
          enabled: true,
          checked_in_today: true,
          today: "2026-10-11",
          timezone: "Asia/Taipei",
          min_amount: 1,
          max_amount: 10,
          today_amount: 1.14,
          total_count: 1,
          total_amount: 1.14,
          new_balance: 6.14,
          checked_in_at: "2026-10-11T12:52:08.131448304+08:00",
        })
      } else {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ code: 404, message: "not found" }),
        })
      }
    })
    const methodId = AUTO_CHECKIN_METHOD_IDS.ClawhudDailyCheckIn
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "clawhud-e2e",
        site_name: "詞元公益站",
        site_url: "https://api.clawhud.com",
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
          return status?.perAccount?.["clawhud-e2e"]?.status
        },
        { timeout: 15000 },
      )
      .toBe(
        scenario === "award" || scenario === "lost_response"
          ? "success"
          : scenario === "duplicate_rejected"
            ? "already_checked"
            : "skipped",
      )
    expect(calls[0]).toBe("GET status")
    expect(calls.filter((call) => call === "POST checkin")).toHaveLength(
      scenario === "already_checked" ? 0 : 1,
    )
    if (scenario === "lost_response") expect(calls.at(-1)).toBe("GET status")
    await expect(
      page.getByRole("row").filter({ hasText: "詞元公益站" }),
    ).toBeVisible()
  })
}
