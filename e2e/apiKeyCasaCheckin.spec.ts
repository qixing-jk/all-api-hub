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

for (const selection of ["confirmed", "imported"] as const) {
  test(`Run now renews Casa credentials for a selection marked ${selection} after a status 401 and claims once`, async ({
    context,
    page,
    extensionId,
  }) => {
    const worker = await getServiceWorker(context)
    const methodId = AUTO_CHECKIN_METHOD_IDS.ApiKeyCasaDailyCheckIn
    const origin = "https://casa.example"
    const account = createStoredAccount({
      site_name: "Casa fixture",
      site_type: SITE_TYPES.SUB2API,
      site_url: origin,
      sub2apiAuth: { refreshToken: "fixture-refresh" },
      checkIn: {
        automaticExecutionEnabled: true,
        selection: { mode: "automatic", methodId },
        methodKnowledge: {
          methods:
            selection === "imported"
              ? {}
              : {
                  [methodId]: {
                    detection: {
                      outcome: "matched",
                      evidence: { source: "probe", observedAt: Date.now() },
                    },
                  },
                },
        },
      },
    })
    const calls: string[] = []
    let checked = false
    await stubLlmMetadataIndex(context)
    await context.route(`${origin}/**`, async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const ok = (data: unknown) =>
        route.fulfill({ json: { code: 0, message: "ok", data } })
      const renewed =
        request.headers().authorization === "Bearer fixture-renewed"
      if (path === "/api/v1/redeem/checkin") {
        calls.push(request.method())
        if (!renewed) {
          await route.fulfill({
            status: 401,
            json: { code: "INVALID_TOKEN", message: "Invalid token" },
          })
          return
        }
        if (request.method() === "POST") checked = true
        await ok({ checked_in: checked, reward: 1 })
      } else if (path === "/api/v1/auth/refresh") {
        calls.push("refresh")
        expect(request.postDataJSON()).toEqual({
          refresh_token: "fixture-refresh",
        })
        await ok({
          access_token: "fixture-renewed",
          refresh_token: "fixture-rotated",
          expires_in: 3600,
        })
      } else if (path === "/api/v1/auth/me") {
        calls.push("identity")
        expect(renewed).toBe(true)
        await ok({
          id: Number(account.account_info.id),
          username: "fixture",
          balance: 1,
        })
      } else {
        await route.fulfill({ status: 404, body: "not found" })
      }
    })
    await seedStoredAccounts(worker, [account])
    await seedUserPreferences(worker, {
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: false,
        pretriggerDailyOnUiOpen: false,
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
      .poll(async () => {
        const raw = await getPlasmoStorageRawValue<unknown>(
          worker,
          "autoCheckin_status",
        )
        if (typeof raw === "string")
          return (JSON.parse(raw) as AutoCheckinStatus).perAccount?.[account.id]
            ?.status
      })
      .toBe("success")
    expect(calls.slice(0, calls.indexOf("POST") + 1)).toEqual([
      "GET",
      "refresh",
      "identity",
      "GET",
      ...(selection === "imported" ? ["GET"] : []),
      "POST",
    ])
    expect(calls.filter((name) => name === "POST")).toHaveLength(1)
    expect(calls.filter((name) => name === "refresh")).toHaveLength(1)
  })
}
