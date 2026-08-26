import type { Page, Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  CHECKIN_RECONCILIATION_OUTCOME,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinStatus,
} from "~/types/autoCheckin"
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
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const AUTO_CHECKIN_STATUS_STORAGE_KEY = "autoCheckin_status"
const AUTO_CHECKIN_RETRY_ALARM_NAME = "autoCheckinRetry"
const ACCOUNT_ID = "uncertain-reentry-account"
const ACCOUNT_NAME = "Uncertain Re-entry Account"
const SITE_URL = "https://auto-checkin-uncertain.example.invalid"

function getLocalDay(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function autoCheckinOptionsUrl(extensionId: string) {
  return `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.AUTO_CHECKIN}`
}

async function readAutoCheckinStatus(
  serviceWorker: Worker,
): Promise<AutoCheckinStatus | null> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    AUTO_CHECKIN_STATUS_STORAGE_KEY,
  )
  return typeof raw === "string" ? (JSON.parse(raw) as AutoCheckinStatus) : null
}

async function openAutoCheckinOptionsPage(page: Page, extensionId: string) {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await page.goto(autoCheckinOptionsUrl(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  await expect(page.getByRole("button", { name: "Run now" })).toBeVisible()
}

test("reconciles a persisted uncertain check-in on retry re-entry without a duplicate mutation", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const today = getLocalDay()
  let statusReadCount = 0
  let mutationPostCount = 0
  const protocolRequestMethods: string[] = []

  await stubLlmMetadataIndex(context)
  await context.route(`${SITE_URL}/api/user/checkin**`, async (route) => {
    const request = route.request()
    protocolRequestMethods.push(request.method())
    if (request.method() === "GET") {
      statusReadCount += 1
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            enabled: true,
            stats: { checked_in_today: true },
          },
        }),
      })
      return
    }

    if (request.method() === "POST") {
      mutationPostCount += 1
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "unexpected retry" }),
      })
      return
    }

    await route.fallback()
  })

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: ACCOUNT_ID,
      site_name: ACCOUNT_NAME,
      site_url: SITE_URL,
      site_type: SITE_TYPES.NEW_API,
      account_info: {
        id: "uncertain-user",
        username: "uncertain-user",
        access_token: "uncertain-token",
      },
      checkIn: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.NEW_API,
        supported: true,
        automaticExecutionEnabled: true,
      }),
    }),
  ])
  await seedUserPreferences(serviceWorker, {
    autoCheckin: {
      ...DEFAULT_PREFERENCES.autoCheckin!,
      globalEnabled: true,
      pretriggerDailyOnUiOpen: false,
      windowStart: "00:00",
      windowEnd: "23:59",
      scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
      deterministicTime: "23:58",
      retryStrategy: {
        enabled: true,
        intervalMinutes: 30,
        maxAttemptsPerDay: 2,
      },
    },
  })

  await setPlasmoStorageValue(serviceWorker, AUTO_CHECKIN_STATUS_STORAGE_KEY, {
    lastDailyRunDay: today,
    lastRunAt: new Date(Date.now() - 60_000).toISOString(),
    lastRunResult: "failed",
    perAccount: {
      [ACCOUNT_ID]: {
        accountId: ACCOUNT_ID,
        accountName: ACCOUNT_NAME,
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        messageKey: "autoCheckin:providerFallback.unknownError",
        reconciliation: CHECKIN_RECONCILIATION_OUTCOME.UNAVAILABLE,
        timestamp: Date.now() - 60_000,
      },
    },
    summary: {
      totalEligible: 1,
      executed: 1,
      successCount: 0,
      failedCount: 0,
      uncertainCount: 1,
      skippedCount: 0,
      needsRetry: true,
    },
    accountsSnapshot: [
      {
        accountId: ACCOUNT_ID,
        accountName: ACCOUNT_NAME,
        siteType: SITE_TYPES.NEW_API,
        detectionEnabled: true,
        autoCheckinEnabled: true,
        providerAvailable: true,
        isCheckedInToday: false,
        lastResult: {
          accountId: ACCOUNT_ID,
          accountName: ACCOUNT_NAME,
          status: CHECKIN_RESULT_STATUS.UNCERTAIN,
          reconciliation: CHECKIN_RECONCILIATION_OUTCOME.UNAVAILABLE,
          timestamp: Date.now() - 60_000,
        },
      },
    ],
    retryState: {
      day: today,
      pendingAccountIds: [ACCOUNT_ID],
      attemptsByAccount: { [ACCOUNT_ID]: 1 },
    },
    pendingRetry: true,
    retryAlarmTargetDay: today,
  } satisfies AutoCheckinStatus)

  // The options page is the persisted-state re-entry point: it must render the
  // uncertain result before the background retry alarm is allowed to reconcile.
  await openAutoCheckinOptionsPage(page, extensionId)
  // Wait for the initial status load to paint the results table before arming
  // the retry alarm. Otherwise the alarm can fire, rewrite perAccount to
  // "skipped", and its RunCompleted refresh can beat the first GetStatus
  // response under CI worker contention, so the uncertain badge never paints.
  await expect(
    page.getByRole("table").getByText(ACCOUNT_NAME, { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Pending confirmation", { exact: true }),
  ).toBeVisible()

  // Scheduling the real MV3 alarm exercises a fresh scheduler boundary. The
  // retry path must read authoritative status first and therefore discover that
  // the check-in already happened without issuing a second POST.
  await serviceWorker.evaluate(async (alarmName) => {
    const chromeApi = (globalThis as any).chrome
    await chromeApi.alarms.create(alarmName, { when: Date.now() + 1_000 })
  }, AUTO_CHECKIN_RETRY_ALARM_NAME)

  await expect
    .poll(async () => await readAutoCheckinStatus(serviceWorker), {
      message: "retry re-entry should reconcile the uncertain account",
      timeout: 15_000,
    })
    .toEqual(
      expect.objectContaining({
        pendingRetry: false,
        perAccount: expect.objectContaining({
          [ACCOUNT_ID]: expect.objectContaining({
            accountId: ACCOUNT_ID,
            status: "skipped",
          }),
        }),
      }),
    )

  const finalStatus = await readAutoCheckinStatus(serviceWorker)
  expect(finalStatus).not.toHaveProperty("retryState")
  expect(statusReadCount).toBeGreaterThan(0)
  expect(mutationPostCount).toBe(0)
  expect(protocolRequestMethods[0]).toBe("GET")

  // Re-entry must render the persisted reconciliation rather than the stale
  // uncertain row that was visible before the background alarm completed.
  await page.reload()
  await waitForExtensionRoot(page)
  await expect(
    page.getByRole("table").getByText("Skipped", { exact: true }),
  ).toBeVisible()
})
