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
      name: "Credentials Account",
      result: { status: "skipped", reasonCode: "credentials_missing" },
    },
    {
      name: "Routine Account",
      result: { status: "skipped", reasonCode: "already_checked_today" },
    },
    {
      name: "Waiting Account",
      result: { status: "skipped", reasonCode: "network_error" },
    },
    {
      name: "Disabled Account",
      result: { status: "skipped", reasonCode: "account_disabled" },
    },
    {
      name: "Detection Off Account",
      result: { status: "skipped", reasonCode: "detection_disabled" },
    },
    {
      name: "Method Off Account",
      result: { status: "skipped", reasonCode: "method_disabled" },
    },
    { name: "Failed Account", result: { status: "failed" } },
  ]

/** Fills an i18next copy string for the seeded run. */
function fillCopy(
  copy: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    copy,
  )
}

for (const language of ["en", "zh-CN"] as const) {
  test(`separates actionable skips from routine skips in results (${language})`, async ({
    context,
    extensionId,
    page,
  }, testInfo) => {
    const copy = language === "en" ? enCheckin : zhCheckin
    const filters: Record<string, string> = copy.execution.filters
    const skipReasons: Record<string, string> = copy.skipReasons
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
        skippedCount: 7,
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

    const row = (name: string) =>
      page.getByRole("row").filter({ hasText: name })
    const menuItem = (label: string, count: number) =>
      page.getByRole("menuitem", { name: new RegExp(`^${label}\\s*${count}$`) })
    const checkboxItem = (label: string, count: number) =>
      page.getByRole("menuitemcheckbox", {
        name: new RegExp(`^${label}\\s*${count}$`),
      })

    await expect(row("Action Account")).toBeVisible()

    // Only the failure and the user-fixable skips count as attention.
    await expect(
      page.locator(`[aria-label="${filters.needsAttention}: 3"]`),
    ).toBeVisible()

    // The trigger label tracks the active filter, so only the prefix is fixed.
    const trigger = () =>
      page.getByRole("button", {
        name: new RegExp(`^${filters.statusLabel}: `),
      })
    await expect(trigger()).toBeVisible()
    await expect(trigger()).toHaveAccessibleName(
      `${filters.statusLabel}: ${filters.all}`,
    )

    await trigger().click()
    await menuItem(filters.needsAttention, 3).click()

    await expect(
      page.getByRole("button", {
        name: `${filters.statusLabel}: ${filters.needsAttention}`,
      }),
    ).toBeVisible()
    await expect(row("Failed Account")).toBeVisible()
    await expect(row("Action Account")).toBeVisible()
    await expect(row("Credentials Account")).toBeVisible()
    for (const hidden of [
      "Routine Account",
      "Waiting Account",
      "Disabled Account",
      "Detection Off Account",
      "Method Off Account",
    ]) {
      await expect(row(hidden)).toHaveCount(0)
    }

    // Clearing filters restores every row.
    await page.getByRole("button", { name: filters.clearAll }).click()
    await expect(row("Routine Account")).toBeVisible()
    await expect(row("Method Off Account")).toBeVisible()

    // Skipped rows expose their reason categories as a nested filter.
    await trigger().click()
    await checkboxItem(filters.skipped, 7).click()
    await expect(page.getByText(filters.skipReasonLabel)).toBeVisible()

    // Account disabling is a user decision, so it stays a first-class
    // sub-type instead of hiding inside the generic disabled bucket.
    await expect(
      checkboxItem(filters.skipCategoryAccountDisabled, 1),
    ).toBeVisible()
    // Categories that resolve to several reasons list those sub-types.
    await expect(
      checkboxItem(filters.skipCategoryActionRequired, 2),
    ).toBeVisible()
    await expect(checkboxItem(filters.skipCategoryDisabled, 2)).toBeVisible()
    await expect(checkboxItem(filters.skipCategoryWaiting, 1)).toBeVisible()
    await expect(checkboxItem(filters.skipCategoryExpected, 1)).toBeVisible()
    await expect(checkboxItem(skipReasons.credentials_missing, 1)).toBeVisible()
    await expect(
      checkboxItem(skipReasons.authentication_required, 1),
    ).toBeVisible()
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("skipped-reason-subtypes-1600.png"),
    })

    // Selecting a precise reason narrows the table to that sub-type only.
    await checkboxItem(skipReasons.credentials_missing, 1).click()
    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")
    await expect(
      page.getByRole("button", {
        name: `${filters.statusLabel}: ${filters.skipped} · ${fillCopy(
          filters.selectedReasons_one ?? filters.selectedReasons,
          { count: 1 },
        )}`,
      }),
    ).toBeVisible()
    await expect(row("Credentials Account")).toBeVisible()
    await expect(
      page.getByText(
        fillCopy(filters.countFiltered, { filtered: 1, total: 8 }),
      ),
    ).toBeVisible()
    for (const hidden of [
      "Action Account",
      "Routine Account",
      "Waiting Account",
      "Disabled Account",
      "Detection Off Account",
      "Method Off Account",
      "Failed Account",
    ]) {
      await expect(row(hidden)).toHaveCount(0)
    }

    for (const width of [1600, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await trigger().scrollIntoViewIfNeeded()
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: testInfo.outputPath(`skipped-precise-reason-${width}.png`),
      })
    }

    // The account-disabled sub-type narrows on its own as well.
    await page.setViewportSize({ width: 1600, height: 1100 })
    await trigger().click()
    await menuItem(filters.all, 8).click()
    // Resetting from inside the menu closes it, so reopen before selecting.
    await trigger().click()
    await checkboxItem(filters.skipped, 7).click()
    await checkboxItem(filters.skipCategoryAccountDisabled, 1).click()
    await page.keyboard.press("Escape")

    await expect(
      page.getByRole("button", {
        name: `${filters.statusLabel}: ${filters.skipped} · ${filters.skipCategoryAccountDisabled}`,
      }),
    ).toBeVisible()
    await expect(row("Disabled Account")).toBeVisible()
    for (const hidden of [
      "Action Account",
      "Credentials Account",
      "Routine Account",
      "Waiting Account",
      "Detection Off Account",
      "Method Off Account",
      "Failed Account",
    ]) {
      await expect(row(hidden)).toHaveCount(0)
    }

    for (const width of [1600, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await trigger().scrollIntoViewIfNeeded()
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: testInfo.outputPath(`skipped-account-disabled-${width}.png`),
      })
    }

    // Narrow viewports keep every reason sub-type reachable in the menu.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await trigger().click()
      await menuItem(filters.all, 8).click()
      await trigger().click()
      await checkboxItem(filters.skipped, 7).click()
      await expect(
        checkboxItem(skipReasons.credentials_missing, 1),
      ).toBeVisible()
      await expect(
        checkboxItem(filters.skipCategoryAccountDisabled, 1),
      ).toBeVisible()
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: testInfo.outputPath(`skipped-reason-menu-${width}.png`),
      })
      await page.keyboard.press("Escape")
    }
  })
}
