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
    // Failures and uncertain results persist the same reason vocabulary as
    // skips, so they take part in the second-level filtering too.
    { name: "Failed Account", result: { status: "failed" } },
    {
      name: "Failed Turnstile Account",
      result: {
        status: "failed",
        reasonCode: "manual_verification_required",
        messageKey: "autoCheckin:providerFallback.turnstileManualRequired",
        messageParams: { checkInUrl: "https://example.invalid/check-in" },
      },
    },
    {
      name: "Failed Timeout Account",
      result: { status: "failed", reasonCode: "timeout" },
    },
    {
      name: "Failed Network Account",
      result: { status: "failed", reasonCode: "network_error" },
    },
    {
      name: "Uncertain Account",
      result: {
        status: "uncertain",
        reconciliation: "unknown",
        reasonCode: "account_unavailable",
      },
    },
    {
      name: "Success Account",
      result: {
        status: "success",
        messageKey: "autoCheckin:providerFallback.checkinSuccessful",
      },
    },
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
  test(`filters results by status and reason (${language})`, async ({
    context,
    extensionId,
    page,
  }, testInfo) => {
    const copy = language === "en" ? enCheckin : zhCheckin
    const filters = copy.execution.filters
    const skipReasons = copy.skipReasons
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
          site_url: "https://result-filters.example.invalid",
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
        successCount: 1,
        alreadyCheckedCount: 0,
        failedCount: 4,
        uncertainCount: 1,
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
    // The trigger labels track the active selection, so only the prefixes
    // stay fixed.
    const statusTrigger = () =>
      page.getByRole("button", {
        name: new RegExp(`^${filters.statusLabel}: `),
      })
    const reasonTrigger = () =>
      page.getByRole("button", {
        name: new RegExp(`^${filters.reasonLabel}: `),
      })
    const expectRowsVisible = async (names: string[]) => {
      for (const name of names) await expect(row(name)).toBeVisible()
    }
    const expectRowsHidden = async (names: string[]) => {
      for (const name of names) await expect(row(name)).toHaveCount(0)
    }

    await expectRowsVisible([
      "Action Account",
      "Failed Turnstile Account",
      "Uncertain Account",
      "Success Account",
    ])

    // Only failures, uncertain results, and user-fixable skips count as
    // attention.
    await expect(
      page.locator(`[aria-label="${filters.needsAttention}: 7"]`),
    ).toBeVisible()

    // Status and reason are peer controls: reasons stay reachable without
    // first selecting "Not executed".
    await expect(statusTrigger()).toHaveAccessibleName(
      `${filters.statusLabel}: ${filters.all}`,
    )
    await expect(reasonTrigger()).toHaveAccessibleName(
      `${filters.reasonLabel}: ${filters.reasonAll}`,
    )
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("status-and-reason-1600.png"),
    })

    // The controls collapse into stacked rows before they can force
    // horizontal scrolling at narrow desktop widths.
    await page.setViewportSize({ width: 768, height: 1000 })
    const stackedLayout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(stackedLayout.scrollWidth).toBeLessThanOrEqual(
      stackedLayout.clientWidth,
    )
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("status-and-reason-768.png"),
    })
    await page.setViewportSize({ width: 1600, height: 1100 })

    // The needs-attention preset keeps failed and uncertain rows complete
    // while narrowing skipped rows to the actionable ones.
    await statusTrigger().click()
    await menuItem(filters.needsAttention, 7).click()
    await expect(statusTrigger()).toHaveAccessibleName(
      `${filters.statusLabel}: ${filters.needsAttention}`,
    )
    await expect(reasonTrigger()).toHaveAccessibleName(
      `${filters.reasonLabel}: ${filters.skipCategoryActionRequired}`,
    )
    await expectRowsVisible([
      "Action Account",
      "Credentials Account",
      "Failed Account",
      "Failed Timeout Account",
      "Failed Network Account",
      "Failed Turnstile Account",
      "Uncertain Account",
    ])
    await expectRowsHidden([
      "Routine Account",
      "Waiting Account",
      "Disabled Account",
      "Detection Off Account",
      "Method Off Account",
      "Success Account",
    ])

    // Clearing filters restores every row.
    await page.getByRole("button", { name: filters.clearAll }).click()
    await expectRowsVisible(["Routine Account", "Method Off Account"])

    // Not-executed rows expose their reason categories as a second filter.
    await statusTrigger().click()
    await checkboxItem(filters.skipped, 7).click()
    await page.keyboard.press("Escape")
    await expect(statusTrigger()).toHaveAccessibleName(
      `${filters.statusLabel}: ${filters.skipped}`,
    )
    await expect(reasonTrigger()).toHaveAccessibleName(
      `${filters.reasonLabel}: ${filters.reasonAll}`,
    )

    await reasonTrigger().click()
    await expect(
      checkboxItem(filters.skipCategoryActionRequired, 2),
    ).toBeVisible()
    await expect(checkboxItem(filters.skipCategoryWaiting, 1)).toBeVisible()
    // Account disabling is a user decision, so it stays a first-class
    // category instead of hiding inside the generic disabled bucket.
    await expect(
      checkboxItem(filters.skipCategoryAccountDisabled, 1),
    ).toBeVisible()
    await expect(checkboxItem(filters.skipCategoryDisabled, 2)).toBeVisible()
    await expect(checkboxItem(filters.skipCategoryExpected, 1)).toBeVisible()
    // Categories that resolve to several reasons list those sub-types.
    await expect(checkboxItem(skipReasons.credentials_missing, 1)).toBeVisible()
    await expect(
      checkboxItem(skipReasons.authentication_required, 1),
    ).toBeVisible()
    await expect(checkboxItem(skipReasons.detection_disabled, 1)).toBeVisible()
    await expect(checkboxItem(skipReasons.method_disabled, 1)).toBeVisible()
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("skipped-reason-menu-1600.png"),
    })

    // Selecting a precise reason narrows the table to that sub-type only.
    await checkboxItem(skipReasons.credentials_missing, 1).click()
    await page.keyboard.press("Escape")
    await expect(reasonTrigger()).toHaveAccessibleName(
      `${filters.reasonLabel}: ${fillCopy(
        "selectedReasons_one" in filters
          ? filters.selectedReasons_one
          : filters.selectedReasons,
        { count: 1 },
      )}`,
    )
    await expect(row("Credentials Account")).toBeVisible()
    await expect(
      page.getByText(
        fillCopy(filters.countFiltered, { filtered: 1, total: 13 }),
      ),
    ).toBeVisible()
    await expectRowsHidden([
      "Action Account",
      "Routine Account",
      "Waiting Account",
      "Disabled Account",
      "Detection Off Account",
      "Method Off Account",
      "Failed Account",
      "Failed Timeout Account",
      "Failed Network Account",
      "Uncertain Account",
      "Success Account",
      "Failed Turnstile Account",
    ])

    for (const width of [1600, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await statusTrigger().scrollIntoViewIfNeeded()
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: testInfo.outputPath(`skipped-precise-reason-${width}.png`),
      })
    }

    // The account-disabled category narrows on its own as well, and the
    // explicit reason reset keeps the status selection intact.
    await page.setViewportSize({ width: 1600, height: 1100 })
    await reasonTrigger().click()
    await page.getByRole("menuitem", { name: filters.clearReasons }).click()
    await expect(reasonTrigger()).toHaveAccessibleName(
      `${filters.reasonLabel}: ${filters.reasonAll}`,
    )
    await expect(row("Credentials Account")).toBeVisible()
    await reasonTrigger().click()
    await checkboxItem(filters.skipCategoryAccountDisabled, 1).click()
    await page.keyboard.press("Escape")
    await expect(reasonTrigger()).toHaveAccessibleName(
      `${filters.reasonLabel}: ${filters.skipCategoryAccountDisabled}`,
    )
    await expect(row("Disabled Account")).toBeVisible()
    await expectRowsHidden([
      "Action Account",
      "Credentials Account",
      "Routine Account",
      "Waiting Account",
      "Detection Off Account",
      "Method Off Account",
      "Failed Account",
      "Failed Timeout Account",
      "Failed Network Account",
      "Uncertain Account",
      "Success Account",
      "Failed Turnstile Account",
    ])

    for (const width of [1600, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await statusTrigger().scrollIntoViewIfNeeded()
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: testInfo.outputPath(`skipped-account-disabled-${width}.png`),
      })
    }

    // Failures reuse the same persisted reason vocabulary, so they get their
    // own second-level filtering instead of one opaque bucket.
    await page.setViewportSize({ width: 1600, height: 1100 })
    await statusTrigger().click()
    await menuItem(filters.all, 13).click()
    await statusTrigger().click()
    await checkboxItem(filters.failed, 4).click()
    await page.keyboard.press("Escape")
    await expect(statusTrigger()).toHaveAccessibleName(
      `${filters.statusLabel}: ${filters.failed}`,
    )
    await expect(reasonTrigger()).toHaveAccessibleName(
      `${filters.reasonLabel}: ${filters.reasonAll}`,
    )

    await reasonTrigger().click()
    // Only the reasons present on failed rows stay listed.
    await expect(checkboxItem(filters.skipCategoryWaiting, 2)).toBeVisible()
    // A legacy Turnstile failure keeps its classification through the
    // presentation key it persisted.
    await expect(
      checkboxItem(filters.skipCategoryActionRequired, 1),
    ).toBeVisible()
    await expect(checkboxItem(skipReasons.timeout, 1)).toBeVisible()
    await expect(checkboxItem(skipReasons.network_error, 1)).toBeVisible()
    // A failure without a reason code is still classified, so the reason
    // dimension covers every failed row.
    await expect(
      checkboxItem(filters.skipCategoryUnclassified, 1),
    ).toBeVisible()
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("failed-reason-menu-1600.png"),
    })

    // A precise failure reason narrows to that row; failures without a
    // classified reason drop out of the narrowed scope.
    await checkboxItem(skipReasons.timeout, 1).click()
    await page.keyboard.press("Escape")
    await expect(reasonTrigger()).toHaveAccessibleName(
      `${filters.reasonLabel}: ${fillCopy(
        "selectedReasons_one" in filters
          ? filters.selectedReasons_one
          : filters.selectedReasons,
        { count: 1 },
      )}`,
    )
    await expect(row("Failed Timeout Account")).toBeVisible()
    await expect(
      page.getByText(
        fillCopy(filters.countFiltered, { filtered: 1, total: 13 }),
      ),
    ).toBeVisible()
    await expectRowsHidden([
      "Failed Account",
      "Failed Network Account",
      "Uncertain Account",
      "Action Account",
      "Credentials Account",
      "Routine Account",
      "Waiting Account",
      "Disabled Account",
      "Detection Off Account",
      "Method Off Account",
      "Success Account",
      "Failed Turnstile Account",
    ])

    for (const width of [1600, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await statusTrigger().scrollIntoViewIfNeeded()
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: testInfo.outputPath(`failed-precise-reason-${width}.png`),
      })
    }

    // The derived classification narrows to the manual-verification row.
    await page.setViewportSize({ width: 1600, height: 1100 })
    await reasonTrigger().click()
    await page.getByRole("menuitem", { name: filters.clearReasons }).click()
    await reasonTrigger().click()
    await checkboxItem(filters.skipCategoryActionRequired, 1).click()
    await page.keyboard.press("Escape")
    await expect(reasonTrigger()).toHaveAccessibleName(
      `${filters.reasonLabel}: ${filters.skipCategoryActionRequired}`,
    )
    await expect(row("Failed Turnstile Account")).toBeVisible()
    await expect(
      page.getByText(
        fillCopy(filters.countFiltered, { filtered: 1, total: 13 }),
      ),
    ).toBeVisible()
    await expectRowsHidden([
      "Failed Account",
      "Failed Timeout Account",
      "Failed Network Account",
      "Uncertain Account",
      "Action Account",
      "Credentials Account",
      "Routine Account",
      "Waiting Account",
      "Disabled Account",
      "Detection Off Account",
      "Method Off Account",
      "Success Account",
    ])
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("failed-manual-verification-1600.png"),
    })

    // The unclassified bucket keeps failures without a reason code
    // reachable instead of dropping them out of the reason dimension.
    await page.setViewportSize({ width: 1600, height: 1100 })
    await reasonTrigger().click()
    await page.getByRole("menuitem", { name: filters.clearReasons }).click()
    await reasonTrigger().click()
    await checkboxItem(filters.skipCategoryUnclassified, 1).click()
    await page.keyboard.press("Escape")
    await expect(reasonTrigger()).toHaveAccessibleName(
      `${filters.reasonLabel}: ${filters.skipCategoryUnclassified}`,
    )
    await expect(row("Failed Account")).toBeVisible()
    await expect(
      page.getByText(
        fillCopy(filters.countFiltered, { filtered: 1, total: 13 }),
      ),
    ).toBeVisible()
    await expectRowsHidden([
      "Failed Timeout Account",
      "Failed Network Account",
      "Uncertain Account",
      "Action Account",
      "Credentials Account",
      "Routine Account",
      "Waiting Account",
      "Disabled Account",
      "Detection Off Account",
      "Method Off Account",
      "Success Account",
      "Failed Turnstile Account",
    ])
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("failed-unclassified-1600.png"),
    })

    // Narrow viewports keep every reason sub-type reachable in the menu.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await statusTrigger().click()
      await menuItem(filters.all, 13).click()
      await statusTrigger().click()
      await checkboxItem(filters.skipped, 7).click()
      await page.keyboard.press("Escape")
      await reasonTrigger().click()
      await expect(
        checkboxItem(skipReasons.credentials_missing, 1),
      ).toBeVisible()
      await expect(
        checkboxItem(filters.skipCategoryAccountDisabled, 1),
      ).toBeVisible()
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: testInfo.outputPath(`reason-menu-${width}.png`),
      })
      await page.keyboard.press("Escape")
    }

    // A status without a reason vocabulary removes the reason control
    // instead of leaving an empty slot next to the status filter.
    await page.setViewportSize({ width: 1600, height: 1100 })
    await statusTrigger().click()
    await menuItem(filters.all, 13).click()
    await statusTrigger().click()
    await checkboxItem(filters.success, 1).click()
    await page.keyboard.press("Escape")
    await expect(reasonTrigger()).toHaveCount(0)
    await expect(statusTrigger()).toBeVisible()
    await expect(row("Success Account")).toBeVisible()
    await expect(
      page.getByText(
        fillCopy(filters.countFiltered, { filtered: 1, total: 13 }),
      ),
    ).toBeVisible()
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("reason-control-absent-1600.png"),
    })
  })
}
