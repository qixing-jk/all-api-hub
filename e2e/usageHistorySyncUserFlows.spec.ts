import type { BrowserContext } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { USAGE_HISTORY_STORAGE_KEYS } from "~/services/history/usageHistory/constants"
import { getDayKeyFromUnixSeconds } from "~/services/history/usageHistory/core"
import { LogType } from "~/services/history/usageHistory/usageLogModel"
import {
  USAGE_HISTORY_SCHEDULE_MODE,
  type UsageHistoryStore,
} from "~/types/usageHistory"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createUsageHistoryAccountStore,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUsageHistoryStore,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageJsonValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const USAGE_HISTORY_SYNC_URL = (extensionId: string) =>
  `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=accountUsage&anchor=usage-history-sync#${MENU_ITEM_IDS.BASIC}`

async function stubUsageHistoryLogRoute(
  context: BrowserContext,
  params: {
    baseUrl: string
    userId: number
    username: string
    tokenName: string
    modelName: string
    tokenId: number
    createdAt: number
    quota: number
    promptTokens: number
    completionTokens: number
    onLogRequest?: (type: string | null) => void
  },
) {
  const origin = new URL(params.baseUrl).origin

  await context.route(`${origin}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === "GET" && url.pathname === "/api/log/self") {
      params.onLogRequest?.(url.searchParams.get("type"))
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: {
            total: 1,
            items: [
              {
                id: 101,
                user_id: params.userId,
                created_at: params.createdAt,
                type: LogType.Consume,
                content: "completion",
                username: params.username,
                token_name: params.tokenName,
                model_name: params.modelName,
                quota: params.quota,
                prompt_tokens: params.promptTokens,
                completion_tokens: params.completionTokens,
                use_time: 1.25,
                is_stream: false,
                channel_id: 7,
                channel_name: "OpenAI",
                token_id: params.tokenId,
                group: "default",
                ip: "127.0.0.1",
                other: "{}",
              },
            ],
          },
        }),
      })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: `Unhandled usage-history E2E route: ${request.method()} ${url.pathname}`,
      }),
    })
  })
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("updates usage-history sync settings and syncs only the selected account", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const selectedAccountId = "usage-sync-account-a"
  const unselectedAccountId = "usage-sync-account-b"
  const selectedBaseUrl = "https://usage-sync-a.example.com"
  const unselectedBaseUrl = "https://usage-sync-b.example.com"
  const logCreatedAt = Math.floor(Date.now() / 1000) - 60
  const usageDayKey = getDayKeyFromUnixSeconds(logCreatedAt)
  const selectedLogRequestTypes: Array<string | null> = []
  const unselectedLogRequestTypes: Array<string | null> = []

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: selectedAccountId,
      site_name: "Usage Sync Hub A",
      site_url: selectedBaseUrl,
      account_info: {
        id: "51",
        username: "usage-sync-user-a",
        access_token: "usage-sync-token-a",
      },
    }),
    createStoredAccount({
      id: unselectedAccountId,
      site_name: "Usage Sync Hub B",
      site_url: unselectedBaseUrl,
      account_info: {
        id: "52",
        username: "usage-sync-user-b",
        access_token: "usage-sync-token-b",
      },
    }),
  ])
  await seedUsageHistoryStore(serviceWorker, {
    [selectedAccountId]: createUsageHistoryAccountStore({
      status: { state: "never" },
    }),
    [unselectedAccountId]: createUsageHistoryAccountStore({
      status: { state: "never" },
    }),
  })
  await seedUserPreferences(serviceWorker, {
    usageHistory: {
      enabled: false,
      retentionDays: 7,
      scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.MANUAL,
      syncIntervalMinutes: 6 * 60,
    },
  })
  await stubUsageHistoryLogRoute(context, {
    baseUrl: selectedBaseUrl,
    userId: 51,
    username: "usage-sync-user-a",
    tokenName: "Selected key",
    modelName: "gpt-4o-mini",
    tokenId: 501,
    createdAt: logCreatedAt,
    quota: 654,
    promptTokens: 123,
    completionTokens: 456,
    onLogRequest: (type) => {
      selectedLogRequestTypes.push(type)
    },
  })
  await stubUsageHistoryLogRoute(context, {
    baseUrl: unselectedBaseUrl,
    userId: 52,
    username: "usage-sync-user-b",
    tokenName: "Unselected key",
    modelName: "gpt-4o-mini",
    tokenId: 502,
    createdAt: logCreatedAt,
    quota: 999,
    promptTokens: 900,
    completionTokens: 90,
    onLogRequest: (type) => {
      unselectedLogRequestTypes.push(type)
    },
  })

  await page.goto(USAGE_HISTORY_SYNC_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  await expect(page.locator("#usage-history-sync")).toBeVisible()

  await page.locator("#usage-history-sync").getByRole("switch").click()
  await page.locator("#usage-history-sync-retention-days input").fill("14")
  await page.locator("#usage-history-sync-schedule-mode").click()
  await page
    .getByTestId(
      BASIC_SETTINGS_TEST_IDS.usageHistorySyncScheduleModeAfterRefreshOption,
    )
    .click()
  await page.locator("#usage-history-sync-interval-hours input").fill("2")
  await page.locator("#usage-history-sync-apply-settings").click()

  await expect
    .poll(async () => {
      const preferences = await getPlasmoStorageJsonValue<
        Record<string, unknown>
      >(serviceWorker, STORAGE_KEYS.USER_PREFERENCES)
      return preferences?.usageHistory
    })
    .toMatchObject({
      enabled: true,
      retentionDays: 14,
      scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH,
      syncIntervalMinutes: 120,
    })

  await page
    .getByTestId(
      `${BASIC_SETTINGS_TEST_IDS.usageHistorySyncAccountCheckboxPrefix}-${selectedAccountId}`,
    )
    .click()
  await page
    .getByTestId(BASIC_SETTINGS_TEST_IDS.usageHistorySyncSelectedButton)
    .click()

  await expect
    .poll(async () => {
      const store = await getPlasmoStorageJsonValue<UsageHistoryStore>(
        serviceWorker,
        USAGE_HISTORY_STORAGE_KEYS.STORE,
      )
      return store?.accounts[selectedAccountId]
    })
    .toEqual(
      expect.objectContaining({
        status: expect.objectContaining({
          state: "success",
          lastSuccessAt: expect.any(Number),
        }),
        daily: expect.objectContaining({
          [usageDayKey]: expect.objectContaining({
            requests: 1,
            promptTokens: 123,
            completionTokens: 456,
            totalTokens: 579,
            quotaConsumed: 654,
          }),
        }),
        dailyByToken: expect.objectContaining({
          "501": expect.objectContaining({
            [usageDayKey]: expect.objectContaining({
              requests: 1,
              quotaConsumed: 654,
            }),
          }),
        }),
      }),
    )

  const store = await getPlasmoStorageJsonValue<UsageHistoryStore>(
    serviceWorker,
    USAGE_HISTORY_STORAGE_KEYS.STORE,
  )
  expect(store?.accounts[unselectedAccountId]).toEqual(
    expect.objectContaining({
      status: { state: "never" },
      daily: {},
    }),
  )
  expect(selectedLogRequestTypes).toContain(String(LogType.Consume))
  expect(unselectedLogRequestTypes).toHaveLength(0)
})
