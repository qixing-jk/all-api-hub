import type { BrowserContext, Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  getAccountManagementListItemTestId,
  ACCOUNT_MANAGEMENT_TEST_IDS as ids,
} from "~/features/AccountManagement/testIds"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
import {
  SITE_TYPE_OBSERVATION_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import {
  AUTO_CHECKIN_RUN_RESULT,
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedAutoCheckinStatus,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const ACCOUNT_ID = "site-type-mismatch-account"
const SITE_URL = "https://site-type-mismatch.example.invalid"
const CHECK_IN_FEEDBACK_ID = "#account-check-in-feedback"
const ACCOUNT_REDETECT_LABEL = "Re-detect"
const CHECK_IN_REDETECT_LABEL = "Re-detect check-in method"

/**
 * Serves a site that brands itself through the public status name while its shell
 * title stays the stock one, and answers check-in with the flat body this
 * deployment family returns. The generic New API method cannot confirm itself
 * against that body, so both the site type and the check-in method stay open to
 * interpretation.
 */
async function stubBrandedSite(context: BrowserContext, brand: string) {
  await stubNewApiSiteRoutes(context, {
    baseUrl: SITE_URL,
    title: "New API",
    systemName: brand,
  })
  // Registered after the shared helper: the newest handler wins for these paths.
  await context.route(`${SITE_URL}/api/status`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "",
        data: { system_name: brand, checkin_enabled: true },
      }),
    }),
  )
  await context.route(`${SITE_URL}/api/user/checkin*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "",
        data: { enabled: true, checked_in: false },
      }),
    }),
  )
}

/** Seeds the account state an older detection would have stored for this site. */
async function seedStaleTypeAccount(context: BrowserContext) {
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
  })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: ACCOUNT_ID,
      site_name: "Branded site",
      site_url: SITE_URL,
      site_type: SITE_TYPES.NEW_API,
    }),
  ])
}

/** Seeds one observation the way a check-in run or the dialog records it. */
async function seedSiteTypeObservation(
  context: BrowserContext,
  observation: {
    storedSiteType: AccountSiteType
    suggestedSiteType: AccountSiteType
  },
) {
  await setPlasmoStorageValue(
    await getServiceWorker(context),
    SITE_TYPE_OBSERVATION_STORAGE_KEYS.OBSERVATIONS,
    { [ACCOUNT_ID]: { ...observation, at: Date.now() } },
    { lock: STORAGE_LOCKS.SITE_TYPE_OBSERVATIONS },
  )
}

/** Seeds one skipped run result whose reason a wrong site type explains. */
async function seedSiteTypeSkippedRun(context: BrowserContext) {
  await seedAutoCheckinStatus(await getServiceWorker(context), {
    lastRunAt: new Date().toISOString(),
    lastRunResult: AUTO_CHECKIN_RUN_RESULT.PARTIAL,
    perAccount: {
      [ACCOUNT_ID]: {
        accountId: ACCOUNT_ID,
        accountName: "Branded site",
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
        timestamp: Date.now(),
      },
    },
  })
}

/** Opens the seeded account in the edit dialog and waits for the form. */
async function openStoredAccountDialog(
  page: Page,
  extensionId: string,
): Promise<ReturnType<Page["getByRole"]>> {
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  const row = page.getByTestId(getAccountManagementListItemTestId(ACCOUNT_ID))
  await row.hover()
  await row.getByTestId(ids.rowEditButton).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByTestId(ids.siteTypeTrigger)).toBeVisible()
  return dialog
}

test("names the site type the site itself resolves to when no method is found", async ({
  context,
  extensionId,
  page,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubBrandedSite(context, SITE_TYPES.VELOERA)
  await seedStaleTypeAccount(context)

  const dialog = await openStoredAccountDialog(page, extensionId)
  // The stored type is what the site was saved as, so the notice has to explain it.
  await expect(dialog.getByTestId(ids.siteTypeTrigger)).toHaveAttribute(
    "data-site-type",
    SITE_TYPES.NEW_API,
  )

  await dialog
    .getByRole("button", { name: CHECK_IN_REDETECT_LABEL, exact: true })
    .click()

  await expect(
    dialog.getByText(
      /This site matches Veloera, which differs from the selected Site Type new-api\./,
    ),
  ).toBeVisible()
})

test("stays silent when the site resolves to the stored type", async ({
  context,
  extensionId,
  page,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubBrandedSite(context, SITE_TYPES.NEW_API)
  await seedStaleTypeAccount(context)

  const dialog = await openStoredAccountDialog(page, extensionId)
  const feedback = dialog.locator(CHECK_IN_FEEDBACK_ID)
  await dialog
    .getByRole("button", { name: CHECK_IN_REDETECT_LABEL, exact: true })
    .click()

  // Wait for the redetection notice itself, then pin the missing suggestion.
  await expect(feedback).not.toBeEmpty()
  await expect(
    dialog.getByText(/differs from the selected Site Type/),
  ).toHaveCount(0)
})

test("repairs a stale stored type through the account re-detect action", async ({
  context,
  extensionId,
  page,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubBrandedSite(context, SITE_TYPES.VELOERA)
  await seedStaleTypeAccount(context)

  const dialog = await openStoredAccountDialog(page, extensionId)
  const siteTypeTrigger = dialog.getByTestId(ids.siteTypeTrigger)
  await expect(siteTypeTrigger).toHaveAttribute(
    "data-site-type",
    SITE_TYPES.NEW_API,
  )

  await dialog
    .getByRole("button", { name: ACCOUNT_REDETECT_LABEL, exact: true })
    .click()

  // Saving this repaired form is how an account stored before the fix is healed.
  await expect(siteTypeTrigger).toHaveAttribute(
    "data-site-type",
    SITE_TYPES.VELOERA,
  )
})

test("shows the recorded observation on the options overview", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await seedStaleTypeAccount(context)
  await seedSiteTypeObservation(context, {
    storedSiteType: SITE_TYPES.NEW_API,
    suggestedSiteType: SITE_TYPES.VELOERA,
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
  )
  const attention = page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.needsAttention)

  await expect(
    attention.getByText(/may have the wrong site type/),
  ).toBeVisible()
  await expect(
    attention.getByText(
      /This site matches Veloera, but the account is set to new-api\./,
    ),
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("site-type-overview-item.png"),
    animations: "disabled",
  })
})

test("names the recorded site type on a run result a wrong type explains", async ({
  context,
  extensionId,
  page,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await seedStaleTypeAccount(context)
  await seedSiteTypeSkippedRun(context)
  await seedSiteTypeObservation(context, {
    storedSiteType: SITE_TYPES.NEW_API,
    suggestedSiteType: SITE_TYPES.VELOERA,
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.AUTO_CHECKIN}`,
  )
  await waitForExtensionRoot(page)

  await expect(
    page.getByText(
      /This site matches Veloera, which differs from the selected Site Type new-api\./,
    ),
  ).toBeVisible()
})

test("keeps a run result generic once the account left the recorded type", async ({
  context,
  extensionId,
  page,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await seedStaleTypeAccount(context)
  await seedSiteTypeSkippedRun(context)
  // Recorded for a type this account no longer carries, so naming it would point
  // the user at a type they already moved away from.
  await seedSiteTypeObservation(context, {
    storedSiteType: SITE_TYPES.VELOERA,
    suggestedSiteType: SITE_TYPES.ONE_API,
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.AUTO_CHECKIN}`,
  )
  await waitForExtensionRoot(page)

  await expect(
    page.getByText(/confirm the site type matches the real site/),
  ).toBeVisible()
  await expect(
    page.getByText(/differs from the selected Site Type/),
  ).toHaveCount(0)
})
