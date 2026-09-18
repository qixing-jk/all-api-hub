import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import enCheckin from "~/locales/en/autoCheckin.json" with { type: "json" }
import zhCheckin from "~/locales/zh-CN/autoCheckin.json" with { type: "json" }
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import type { CheckinAccountResult } from "~/types/autoCheckin"
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
  getPlasmoStorageJsonValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const RESULT_CASES: { name: string; result: Partial<CheckinAccountResult> }[] =
  [
    {
      name: "Action Account",
      result: { status: "skipped", reasonCode: "authentication_required" },
    },
    {
      name: "Routine Account",
      result: { status: "skipped", reasonCode: "already_checked_today" },
    },
    {
      name: "Waiting Account",
      result: { status: "skipped", reasonCode: "network_error" },
    },
    { name: "Failed Account", result: { status: "failed" } },
  ]

for (const language of ["en", "zh-CN"] as const) {
  test(`separates actionable skips from routine skips in results (${language})`, async ({
    context,
    extensionId,
    page,
  }, testInfo) => {
    const copy = language === "en" ? enCheckin : zhCheckin
    const serviceWorker = await getServiceWorker(context)
    await stubLlmMetadataIndex(context)
    // Keep the scheduled run off so the seeded status stays authoritative.
    await seedUserPreferences(serviceWorker, {
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: false,
        pretriggerDailyOnUiOpen: false,
      },
    })
    await seedStoredAccounts(
      serviceWorker,
      RESULT_CASES.map(({ name }) =>
        createStoredAccount({
          id: name,
          site_name: name,
          site_url: "https://skipped-classification.example.invalid",
          site_type: SITE_TYPES.NEW_API,
        }),
      ),
    )
    await expect
      .poll(() =>
        getPlasmoStorageJsonValue(serviceWorker, "autoCheckin_status"),
      )
      .toBeTruthy()
    await setPlasmoStorageValue(serviceWorker, "autoCheckin_status", {
      lastRunAt: new Date().toISOString(),
      lastRunResult: "partial",
      perAccount: Object.fromEntries(
        RESULT_CASES.map(({ name, result }) => [
          name,
          {
            accountId: name,
            accountName: name,
            timestamp: Date.now(),
            ...result,
          },
        ]),
      ),
      summary: {
        totalEligible: RESULT_CASES.length,
        executed: RESULT_CASES.length,
        successCount: 0,
        alreadyCheckedCount: 1,
        failedCount: 1,
        uncertainCount: 0,
        skippedCount: 3,
        needsRetry: false,
      },
      accountsSnapshot: RESULT_CASES.map(({ name, result }) => ({
        accountId: name,
        accountName: name,
        siteType: SITE_TYPES.NEW_API,
        detectionEnabled: true,
        autoCheckinEnabled: result.status !== "success",
        providerAvailable: true,
        ...(result.reasonCode ? { skipReason: result.reasonCode } : {}),
      })),
    })

    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, language)
    await page.setViewportSize({ width: 1600, height: 1100 })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.AUTO_CHECKIN}`,
    )
    await waitForExtensionRoot(page)

    const filters = copy.execution.filters
    await expect(
      page.getByRole("row").filter({ hasText: "Action Account" }),
    ).toBeVisible()

    // Only the failure and the actionable skip count as attention.
    await expect(
      page.locator(`[aria-label="${filters.needsAttention}: 2"]`),
    ).toBeVisible()

    const trigger = page.getByRole("button", {
      name: `${filters.statusLabel}: ${filters.all}`,
    })
    await expect(trigger).toBeVisible()

    await trigger.click()
    const needsAttentionItem = page.getByRole("menuitem", {
      name: new RegExp(`${filters.needsAttention}.*2`),
    })
    await expect(needsAttentionItem).toBeVisible()
    await needsAttentionItem.click()

    await expect(
      page.getByRole("button", {
        name: `${filters.statusLabel}: ${filters.needsAttention}`,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole("row").filter({ hasText: "Failed Account" }),
    ).toBeVisible()
    await expect(
      page.getByRole("row").filter({ hasText: "Action Account" }),
    ).toBeVisible()
    await expect(
      page.getByRole("row").filter({ hasText: "Routine Account" }),
    ).toHaveCount(0)
    await expect(
      page.getByRole("row").filter({ hasText: "Waiting Account" }),
    ).toHaveCount(0)

    // Clearing filters restores every row.
    await page
      .getByRole("button", { name: copy.execution.filters.clearAll })
      .click()
    await expect(
      page.getByRole("row").filter({ hasText: "Routine Account" }),
    ).toBeVisible()

    // Skipped rows expose their reason categories as a nested filter.
    await trigger.click()
    await page
      .getByRole("menuitemcheckbox", {
        name: new RegExp(`${filters.skipped}.*3`),
      })
      .click()
    await expect(page.getByText(filters.skipReasonLabel)).toBeVisible()
    for (const [label, count] of [
      [filters.skipCategoryActionRequired, 1],
      [filters.skipCategoryWaiting, 1],
      [filters.skipCategoryExpected, 1],
    ] as const) {
      await expect(
        page.getByRole("menuitemcheckbox", {
          name: new RegExp(`${label} ${count}`),
        }),
      ).toBeVisible()
    }

    await page
      .getByRole("menuitemcheckbox", {
        name: new RegExp(`${filters.skipCategoryActionRequired} 1`),
      })
      .click()
    await page.keyboard.press("Escape")

    await expect(
      page.getByRole("button", {
        name: `${filters.statusLabel}: ${filters.skipped} · ${filters.skipCategoryActionRequired}`,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole("row").filter({ hasText: "Action Account" }),
    ).toBeVisible()
    await expect(
      page.getByRole("row").filter({ hasText: "Routine Account" }),
    ).toHaveCount(0)

    for (const width of [1600, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await expect(
        page.getByRole("row").filter({ hasText: "Action Account" }),
      ).toBeVisible()
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: testInfo.outputPath(`skipped-classification-${width}.png`),
      })
    }
  })
}
