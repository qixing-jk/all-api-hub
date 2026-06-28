import type { BrowserContext, Page, Route, Worker } from "@playwright/test"

import { ChannelType } from "~/constants"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { DAILY_BALANCE_HISTORY_ALARM_NAME } from "~/services/history/dailyBalanceHistory/constants"
import { getDayKeyFromUnixSeconds as getBalanceHistoryDayKeyFromUnixSeconds } from "~/services/history/dailyBalanceHistory/dayKeys"
import {
  USAGE_HISTORY_ALARM_NAME,
  USAGE_HISTORY_STORAGE_KEYS,
} from "~/services/history/usageHistory/constants"
import { getDayKeyFromUnixSeconds as getUsageHistoryDayKeyFromUnixSeconds } from "~/services/history/usageHistory/core"
import { LogType } from "~/services/history/usageHistory/usageLogModel"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import {
  AutoCheckinMessageTypes,
  BalanceHistoryMessageTypes,
  ModelSyncMessageTypes,
  SiteAnnouncementsMessageTypes,
  UsageHistoryMessageTypes,
  WebdavAutoSyncMessageTypes,
} from "~/services/runtimeMessaging/messageTypes"
import { SITE_ANNOUNCEMENTS_ALARM_NAME } from "~/services/siteAnnouncements/constants"
import { AUTO_CHECKIN_SCHEDULE_MODE } from "~/types/autoCheckin"
import type { AutoCheckinStatus } from "~/types/autoCheckin"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"
import { CHANNEL_STATUS, type ManagedSiteChannel } from "~/types/managedSite"
import type { ExecutionResult } from "~/types/managedSiteModelSync"
import type { UsageHistoryStore } from "~/types/usageHistory"
import { USAGE_HISTORY_SCHEDULE_MODE } from "~/types/usageHistory"
import { WEBDAV_SYNC_STRATEGIES } from "~/types/webdav"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createStoredBookmark,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedStoredBookmarks,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const AUTO_CHECKIN_LEGACY_ALARM_NAME = "autoCheckin"
const AUTO_CHECKIN_DAILY_ALARM_NAME = "autoCheckinDaily"
const AUTO_CHECKIN_RETRY_ALARM_NAME = "autoCheckinRetry"
const MANAGED_SITE_MODEL_SYNC_ALARM_NAME = "managedSiteModelSync"
const RELEASE_UPDATE_ALARM_NAME = "releaseUpdateDailyCheck"
const WEBDAV_AUTO_SYNC_ALARM_NAME = "webdavAutoSync"
const WEBDAV_BEST_EFFORT_UPLOAD_ALARM_NAME = "webdavAutoSyncBestEffortUpload"
const MANAGED_SITE_ALARM_BASE_URL = "https://managed-alarm.example.com"
const MANAGED_SITE_ALARM_ADMIN_TOKEN = "managed-alarm-token"
const MANAGED_SITE_ALARM_USER_ID = "1"
const AUTO_CHECKIN_STATUS_STORAGE_KEY = "autoCheckin_status"

const EXPECTED_ENABLED_ALARMS = [
  AUTO_CHECKIN_DAILY_ALARM_NAME,
  DAILY_BALANCE_HISTORY_ALARM_NAME,
  MANAGED_SITE_MODEL_SYNC_ALARM_NAME,
  RELEASE_UPDATE_ALARM_NAME,
  SITE_ANNOUNCEMENTS_ALARM_NAME,
  USAGE_HISTORY_ALARM_NAME,
  WEBDAV_AUTO_SYNC_ALARM_NAME,
] as const

const CONFIGURABLE_ALARMS = [
  AUTO_CHECKIN_LEGACY_ALARM_NAME,
  AUTO_CHECKIN_DAILY_ALARM_NAME,
  AUTO_CHECKIN_RETRY_ALARM_NAME,
  DAILY_BALANCE_HISTORY_ALARM_NAME,
  MANAGED_SITE_MODEL_SYNC_ALARM_NAME,
  SITE_ANNOUNCEMENTS_ALARM_NAME,
  USAGE_HISTORY_ALARM_NAME,
  WEBDAV_AUTO_SYNC_ALARM_NAME,
  WEBDAV_BEST_EFFORT_UPLOAD_ALARM_NAME,
] as const

type AlarmSnapshot = {
  name: string
  scheduledTime?: number
  periodInMinutes?: number
} | null

function createManagedSiteChannel(
  overrides: Partial<ManagedSiteChannel>,
): ManagedSiteChannel {
  return {
    id: 101,
    type: ChannelType.OpenAI,
    key: "",
    name: "Production OpenAI",
    base_url: "https://upstream-a.example.com/v1",
    models: "gpt-4o-mini",
    status: CHANNEL_STATUS.Enable,
    weight: 1,
    priority: 0,
    openai_organization: null,
    test_model: null,
    created_time: 1_700_000_000,
    test_time: 0,
    response_time: 0,
    other: "",
    balance: 0,
    balance_updated_time: 0,
    group: "default",
    used_quota: 0,
    model_mapping: "",
    status_code_mapping: "",
    auto_ban: 1,
    other_info: "",
    tag: null,
    param_override: null,
    header_override: null,
    remark: null,
    channel_info: {
      is_multi_key: false,
      multi_key_size: 0,
      multi_key_status_list: null,
      multi_key_polling_index: 0,
      multi_key_mode: "",
    },
    setting: "",
    settings: "",
    ...overrides,
  }
}

async function readJsonStorageValue<T>(
  serviceWorker: Worker,
  storageKey: string,
): Promise<T | null> {
  const raw = await getPlasmoStorageRawValue<unknown>(serviceWorker, storageKey)
  if (typeof raw !== "string") {
    return null
  }
  return JSON.parse(raw) as T
}

async function openExtensionPage(page: Page, extensionId: string) {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
}

async function sendTypedRuntimeMessageFromPage<TResponse>(
  page: Page,
  type: string,
  data?: Record<string, unknown>,
): Promise<TResponse> {
  return await page.evaluate(
    async ({ type, data }) => {
      const chromeApi = (globalThis as any).chrome
      const response = await chromeApi.runtime.sendMessage({
        id: Date.now(),
        type,
        data,
        timestamp: Date.now(),
      })
      return response?.res ?? response
    },
    { type, data },
  )
}

async function getAlarm(
  serviceWorker: Worker,
  alarmName: string,
): Promise<AlarmSnapshot> {
  return await serviceWorker.evaluate(async (name) => {
    const chromeApi = (globalThis as any).chrome
    const alarm = await chromeApi.alarms.get(name)
    return alarm
      ? {
          name: alarm.name,
          scheduledTime: alarm.scheduledTime,
          periodInMinutes: alarm.periodInMinutes,
        }
      : null
  }, alarmName)
}

async function getAlarmsByName(serviceWorker: Worker) {
  return await serviceWorker.evaluate(async () => {
    const chromeApi = (globalThis as any).chrome
    const alarms = await chromeApi.alarms.getAll()
    return Object.fromEntries(
      alarms.map(
        (alarm: {
          name: string
          scheduledTime?: number
          periodInMinutes?: number
        }) => [
          alarm.name,
          {
            name: alarm.name,
            scheduledTime: alarm.scheduledTime,
            periodInMinutes: alarm.periodInMinutes,
          },
        ],
      ),
    ) as Record<string, NonNullable<AlarmSnapshot>>
  })
}

async function clearAlarms(
  serviceWorker: Worker,
  alarmNames: readonly string[],
) {
  await serviceWorker.evaluate(
    async (names) => {
      const chromeApi = (globalThis as any).chrome
      await Promise.all(
        names.map((name: string) => chromeApi.alarms.clear(name)),
      )
    },
    [...alarmNames],
  )
}

async function createStaleAlarms(
  serviceWorker: Worker,
  alarmNames: readonly string[],
) {
  await serviceWorker.evaluate(
    async (names) => {
      const chromeApi = (globalThis as any).chrome
      await Promise.all(
        names.map((name: string) =>
          chromeApi.alarms.create(name, {
            delayInMinutes: 1,
            periodInMinutes: 1,
          }),
        ),
      )
    },
    [...alarmNames],
  )
}

async function scheduleAlarmSoon(serviceWorker: Worker, alarmName: string) {
  await serviceWorker.evaluate(async (name) => {
    const chromeApi = (globalThis as any).chrome
    await chromeApi.alarms.create(name, {
      when: Date.now() + 1_000,
    })
  }, alarmName)
}

async function seedAutoCheckinStatus(
  serviceWorker: Worker,
  status: AutoCheckinStatus,
) {
  await setPlasmoStorageValue(
    serviceWorker,
    AUTO_CHECKIN_STATUS_STORAGE_KEY,
    status,
  )
}

function getLocalDay(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

async function stubManagedSiteAdminRoutes(
  context: BrowserContext,
  options: {
    channels?: ManagedSiteChannel[]
    fetchedModelsByChannelId?: Record<number, string[]>
  } = {},
) {
  const channels = options.channels ?? [
    createManagedSiteChannel({
      id: 101,
      name: "Production OpenAI",
      base_url: "https://upstream-a.example.com/v1",
      models: "gpt-4o-mini",
    }),
  ]
  const updatePayloads: unknown[] = []
  const origin = new URL(MANAGED_SITE_ALARM_BASE_URL).origin

  await context.route(`${origin}/**`, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (method === "GET" && url.pathname === "/api/channel/") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: {
            items: channels,
            total: channels.length,
            type_counts: {
              [String(ChannelType.OpenAI)]: channels.length,
            },
          },
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/group") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: ["default"],
        }),
      })
      return
    }

    if (
      method === "GET" &&
      url.pathname.startsWith("/api/channel/fetch_models/")
    ) {
      const channelId = Number(url.pathname.split("/").filter(Boolean).pop())
      const fetchedModels =
        options.fetchedModelsByChannelId?.[channelId] ??
        (channelId === 101 ? ["gpt-4o-mini", "gpt-4.1-mini"] : null)

      if (!fetchedModels) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: `No fetched models configured for channel ${channelId}`,
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: fetchedModels,
        }),
      })
      return
    }

    if (method === "PUT" && url.pathname === "/api/channel/") {
      const payload = request.postDataJSON()
      updatePayloads.push(payload)

      const channel = channels.find(
        (item) => item.id === Number((payload as { id?: number }).id),
      )
      if (channel) {
        const updates = payload as Partial<ManagedSiteChannel>
        if (typeof updates.models === "string") channel.models = updates.models
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "updated",
          data: null,
        }),
      })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: `Unhandled managed-site alarm E2E route: ${method} ${url.pathname}`,
      }),
    })
  })

  return { updatePayloads }
}

async function stubWebdavBackupRoutes(
  context: BrowserContext,
  options: {
    backupFileUrl: string
    initialRemoteBackup?: string
  },
) {
  let remoteBackup = options.initialRemoteBackup ?? ""
  const stagedBackups = new Map<string, string>()
  const uploadedPayloads: unknown[] = []
  const tempDeleteUrls: string[] = []
  const backupFileUrl = new URL(options.backupFileUrl)
  const backupDirectoryPath = backupFileUrl.pathname.replace(/\/[^/]*$/, "")
  const backupFileName = backupFileUrl.pathname.split("/").pop() ?? ""

  await context.route(`${backupFileUrl.origin}/**`, async (route: Route) => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    const isBackupFile = url.href === options.backupFileUrl
    const requestDirectoryPath = url.pathname.replace(/\/[^/]*$/, "")
    const requestFileName = url.pathname.split("/").pop() ?? ""
    const isTempBackupFile =
      requestDirectoryPath === backupDirectoryPath &&
      (requestFileName.startsWith(`${backupFileName}.tmp.`) ||
        requestFileName.startsWith(`.${backupFileName}.tmp.`))

    if (method === "GET" && (isBackupFile || isTempBackupFile)) {
      const body = isTempBackupFile ? stagedBackups.get(url.href) : remoteBackup
      if (!body) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "missing backup" }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body,
      })
      return
    }

    if (method === "PUT" && (isBackupFile || isTempBackupFile)) {
      const body = request.postData() ?? ""
      if (isTempBackupFile) {
        stagedBackups.set(url.href, body)
      } else {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "direct final backup PUT rejected" }),
        })
        return
      }
      await route.fulfill({
        status: isTempBackupFile ? 204 : 201,
        contentType: "application/json",
        body: "{}",
      })
      return
    }

    if (method === "PROPFIND") {
      await route.fulfill({
        status: 207,
        contentType: "application/xml",
        body: `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:" />`,
      })
      return
    }

    if (method === "MOVE" && isTempBackupFile) {
      const destination = request.headers()["destination"]
      const body = stagedBackups.get(url.href)
      if (destination !== options.backupFileUrl || body === undefined) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "missing staged backup" }),
        })
        return
      }

      remoteBackup = body
      stagedBackups.delete(url.href)
      uploadedPayloads.push(JSON.parse(remoteBackup))
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: "{}",
      })
      return
    }

    if (method === "DELETE" && isTempBackupFile) {
      tempDeleteUrls.push(url.href)
      stagedBackups.delete(url.href)
      await route.fulfill({
        status: 204,
        contentType: "text/plain",
        body: "",
      })
      return
    }

    if (method === "MKCOL") {
      await route.fulfill({
        status: 201,
        contentType: "text/plain",
        body: "",
      })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: `Unhandled WebDAV alarm E2E route: ${method} ${url.pathname}`,
      }),
    })
  })

  return { tempDeleteUrls, uploadedPayloads }
}

async function enableAlarmBackedFeatures(page: Page, serviceWorker: Worker) {
  await seedUserPreferences(serviceWorker, {
    webdav: {
      ...DEFAULT_PREFERENCES.webdav,
      autoSync: true,
      url: "https://webdav-alarm.example.com/remote.php/dav/files/e2e",
      username: "e2e-webdav-user",
      password: "e2e-webdav-password",
      syncInterval: 120,
      syncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
      syncData: {
        accounts: true,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
    },
    newApi: {
      ...DEFAULT_PREFERENCES.newApi,
      baseUrl: MANAGED_SITE_ALARM_BASE_URL,
      adminToken: MANAGED_SITE_ALARM_ADMIN_TOKEN,
      userId: MANAGED_SITE_ALARM_USER_ID,
    },
    managedSiteType: SITE_TYPES.NEW_API,
  })

  const responses = [
    await sendTypedRuntimeMessageFromPage<{ success: boolean }>(
      page,
      UsageHistoryMessageTypes.UpdateSettings,
      {
        settings: {
          enabled: true,
          scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.ALARM,
          syncIntervalMinutes: 17,
        },
      },
    ),
    await sendTypedRuntimeMessageFromPage<{ success: boolean }>(
      page,
      BalanceHistoryMessageTypes.UpdateSettings,
      {
        settings: {
          enabled: true,
          endOfDayCapture: { enabled: true },
          retentionDays: 365,
        },
      },
    ),
    await sendTypedRuntimeMessageFromPage<{ success: boolean }>(
      page,
      WebdavAutoSyncMessageTypes.UpdateSettings,
      {
        settings: {
          autoSync: true,
          syncInterval: 120,
          syncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
        },
      },
    ),
    await sendTypedRuntimeMessageFromPage<{ success: boolean }>(
      page,
      ModelSyncMessageTypes.UpdateSettings,
      {
        settings: {
          enableSync: true,
          intervalMs: 5 * 60 * 1000,
        },
      },
    ),
    await sendTypedRuntimeMessageFromPage<{ success: boolean }>(
      page,
      AutoCheckinMessageTypes.UpdateSettings,
      {
        settings: {
          globalEnabled: true,
          pretriggerDailyOnUiOpen: false,
          notifyUiOnCompletion: true,
          windowStart: "00:00",
          windowEnd: "23:59",
          scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
          deterministicTime: "23:58",
          retryStrategy: {
            enabled: false,
            intervalMinutes: 30,
            maxAttemptsPerDay: 1,
          },
        },
      },
    ),
    await sendTypedRuntimeMessageFromPage<{ success: boolean }>(
      page,
      SiteAnnouncementsMessageTypes.UpdatePreferences,
      {
        settings: {
          enabled: true,
          notificationEnabled: false,
          intervalMinutes: 15,
        },
      },
    ),
  ]

  expect(responses).toEqual(
    responses.map(() => expect.objectContaining({ success: true })),
  )
}

async function disableConfigurableAlarmFeatures(page: Page) {
  const responses = [
    await sendTypedRuntimeMessageFromPage<{ success: boolean }>(
      page,
      UsageHistoryMessageTypes.UpdateSettings,
      {
        settings: {
          enabled: false,
          scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH,
        },
      },
    ),
    await sendTypedRuntimeMessageFromPage<{ success: boolean }>(
      page,
      BalanceHistoryMessageTypes.UpdateSettings,
      {
        settings: {
          enabled: false,
          endOfDayCapture: { enabled: false },
        },
      },
    ),
    await sendTypedRuntimeMessageFromPage<{ success: boolean }>(
      page,
      WebdavAutoSyncMessageTypes.UpdateSettings,
      {
        settings: {
          autoSync: false,
        },
      },
    ),
    await sendTypedRuntimeMessageFromPage<{ success: boolean }>(
      page,
      ModelSyncMessageTypes.UpdateSettings,
      {
        settings: {
          enableSync: false,
        },
      },
    ),
    await sendTypedRuntimeMessageFromPage<{ success: boolean }>(
      page,
      AutoCheckinMessageTypes.UpdateSettings,
      {
        settings: {
          globalEnabled: false,
        },
      },
    ),
    await sendTypedRuntimeMessageFromPage<{ success: boolean }>(
      page,
      SiteAnnouncementsMessageTypes.UpdatePreferences,
      {
        settings: {
          enabled: false,
        },
      },
    ),
  ]

  expect(responses).toEqual(
    responses.map(() => expect.objectContaining({ success: true })),
  )
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("reconciles every enabled background scheduler into production MV3 alarms without schedule drift", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await clearAlarms(serviceWorker, CONFIGURABLE_ALARMS)
  await openExtensionPage(page, extensionId)
  await enableAlarmBackedFeatures(page, serviceWorker)

  await expect
    .poll(() => getAlarmsByName(serviceWorker), {
      message: "enabled alarm-backed features should create their MV3 alarms",
    })
    .toEqual(
      expect.objectContaining({
        [AUTO_CHECKIN_DAILY_ALARM_NAME]: expect.objectContaining({
          name: AUTO_CHECKIN_DAILY_ALARM_NAME,
        }),
        [DAILY_BALANCE_HISTORY_ALARM_NAME]: expect.objectContaining({
          name: DAILY_BALANCE_HISTORY_ALARM_NAME,
        }),
        [MANAGED_SITE_MODEL_SYNC_ALARM_NAME]: expect.objectContaining({
          name: MANAGED_SITE_MODEL_SYNC_ALARM_NAME,
          periodInMinutes: 5,
        }),
        [RELEASE_UPDATE_ALARM_NAME]: expect.objectContaining({
          name: RELEASE_UPDATE_ALARM_NAME,
          periodInMinutes: 24 * 60,
        }),
        [SITE_ANNOUNCEMENTS_ALARM_NAME]: expect.objectContaining({
          name: SITE_ANNOUNCEMENTS_ALARM_NAME,
          periodInMinutes: 15,
        }),
        [USAGE_HISTORY_ALARM_NAME]: expect.objectContaining({
          name: USAGE_HISTORY_ALARM_NAME,
          periodInMinutes: 17,
        }),
        [WEBDAV_AUTO_SYNC_ALARM_NAME]: expect.objectContaining({
          name: WEBDAV_AUTO_SYNC_ALARM_NAME,
          periodInMinutes: 2,
        }),
      }),
    )

  const beforeReconcile = await getAlarmsByName(serviceWorker)

  await enableAlarmBackedFeatures(page, serviceWorker)

  await expect
    .poll(() => getAlarmsByName(serviceWorker), {
      message:
        "repeated scheduler reconciliation should preserve matching alarms",
    })
    .toEqual(
      expect.objectContaining(
        Object.fromEntries(
          EXPECTED_ENABLED_ALARMS.map((name) => [
            name,
            expect.objectContaining({
              name,
              scheduledTime: beforeReconcile[name].scheduledTime,
              periodInMinutes: beforeReconcile[name].periodInMinutes,
            }),
          ]),
        ),
      ),
    )
})

test("clears scheduler-owned MV3 alarms when features are disabled", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await openExtensionPage(page, extensionId)
  await createStaleAlarms(serviceWorker, CONFIGURABLE_ALARMS)

  await expect
    .poll(() => getAlarmsByName(serviceWorker), {
      message: "test setup should create stale scheduler-owned alarms",
    })
    .toEqual(
      expect.objectContaining(
        Object.fromEntries(
          CONFIGURABLE_ALARMS.map((name) => [
            name,
            expect.objectContaining({ name }),
          ]),
        ),
      ),
    )

  await disableConfigurableAlarmFeatures(page)

  for (const alarmName of CONFIGURABLE_ALARMS) {
    await expect
      .poll(() => getAlarm(serviceWorker, alarmName), {
        message: `${alarmName} should be cleared by its owning scheduler`,
      })
      .toBeNull()
  }
})

test("runs usage-history sync when its MV3 alarm fires", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const accountId = "usage-alarm-account"
  const baseUrl = "https://usage-alarm.example.com"
  const nowSeconds = Math.floor(Date.now() / 1000)
  const logCreatedAt = nowSeconds - 60
  const usageDayKey = getUsageHistoryDayKeyFromUnixSeconds(logCreatedAt)
  let usageLogRequests = 0

  await context.route(`${baseUrl}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === "GET" && url.pathname === "/api/log/self") {
      usageLogRequests += 1
      expect(url.searchParams.get("type")).toBe(String(LogType.Consume))
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
                user_id: 41,
                created_at: logCreatedAt,
                type: LogType.Consume,
                content: "completion",
                username: "usage-alarm-user",
                token_name: "Scheduled key",
                model_name: "gpt-4o-mini",
                quota: 321,
                prompt_tokens: 123,
                completion_tokens: 456,
                use_time: 1.25,
                is_stream: false,
                channel_id: 7,
                channel_name: "OpenAI",
                token_id: 88,
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
        message: `Unhandled alarm E2E route: ${request.method()} ${url.pathname}`,
      }),
    })
  })

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: accountId,
      site_name: "Usage Alarm Hub",
      site_url: baseUrl,
      account_info: {
        id: "41",
        username: "usage-alarm-user",
        access_token: "usage-alarm-token",
      },
    }),
  ])

  await openExtensionPage(page, extensionId)
  const settingsResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
  }>(page, UsageHistoryMessageTypes.UpdateSettings, {
    settings: {
      enabled: true,
      scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.ALARM,
      syncIntervalMinutes: 15,
      retentionDays: 30,
    },
  })
  expect(settingsResponse).toEqual(expect.objectContaining({ success: true }))

  await scheduleAlarmSoon(serviceWorker, USAGE_HISTORY_ALARM_NAME)

  await expect
    .poll(
      async () => {
        const store = await readJsonStorageValue<UsageHistoryStore>(
          serviceWorker,
          USAGE_HISTORY_STORAGE_KEYS.STORE,
        )
        return store?.accounts[accountId]
      },
      {
        message:
          "usage-history alarm should fetch logs and persist account aggregates",
        timeout: 15_000,
      },
    )
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
            quotaConsumed: 321,
          }),
        }),
        dailyByModel: expect.objectContaining({
          "gpt-4o-mini": expect.objectContaining({
            [usageDayKey]: expect.objectContaining({
              requests: 1,
              quotaConsumed: 321,
            }),
          }),
        }),
      }),
    )
  expect(usageLogRequests).toBeGreaterThanOrEqual(1)
})

test("captures daily balance snapshots when its MV3 alarm fires", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const accountId = "balance-alarm-account"
  const baseUrl = "https://balance-alarm.example.com"
  const balanceDayKey = getBalanceHistoryDayKeyFromUnixSeconds(
    Math.floor(Date.now() / 1000),
  )

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: accountId,
      site_name: "Balance Alarm Hub",
      site_url: baseUrl,
      account_info: {
        id: "52",
        username: "balance-alarm-user",
        access_token: "balance-alarm-token",
      },
    }),
  ])
  await stubNewApiSiteRoutes(context, {
    baseUrl,
    userId: "52",
    username: "balance-alarm-user",
    accessToken: "balance-alarm-token",
    initialQuota: 9_876_543,
    todayQuotaConsumption: 123_456,
  })

  await openExtensionPage(page, extensionId)
  const settingsResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
  }>(page, BalanceHistoryMessageTypes.UpdateSettings, {
    settings: {
      enabled: true,
      endOfDayCapture: { enabled: true },
      retentionDays: 365,
    },
  })
  expect(settingsResponse).toEqual(expect.objectContaining({ success: true }))

  await scheduleAlarmSoon(serviceWorker, DAILY_BALANCE_HISTORY_ALARM_NAME)

  await expect
    .poll(
      async () => {
        const store = await readJsonStorageValue<DailyBalanceHistoryStore>(
          serviceWorker,
          STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
        )
        return store?.snapshotsByAccountId[accountId]?.[balanceDayKey]
      },
      {
        message:
          "daily-balance alarm should refresh the account and persist an alarm-sourced snapshot",
        timeout: 15_000,
      },
    )
    .toEqual(
      expect.objectContaining({
        quota: 9_876_543,
        today_quota_consumption: 123_456,
        source: "alarm",
        capturedAt: expect.any(Number),
      }),
    )
})

test("runs WebDAV auto-sync upload when its MV3 alarm fires", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const accountId = "webdav-alarm-account"
  const backupFileUrl = "https://webdav-alarm.example.com/alarm-backup.json"
  const { tempDeleteUrls, uploadedPayloads } = await stubWebdavBackupRoutes(
    context,
    {
      backupFileUrl,
    },
  )

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: accountId,
      site_name: "WebDAV Alarm Hub",
      site_url: "https://webdav-account.example.com",
      account_info: {
        id: "63",
        username: "webdav-alarm-user",
        access_token: "webdav-alarm-token",
      },
    }),
  ])
  await seedUserPreferences(serviceWorker, {
    webdav: {
      ...DEFAULT_PREFERENCES.webdav,
      autoSync: true,
      url: backupFileUrl,
      username: "webdav-alarm-user",
      password: "webdav-alarm-password",
      syncInterval: 120,
      syncStrategy: WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY,
      syncData: {
        accounts: true,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
    },
  })

  await openExtensionPage(page, extensionId)
  const settingsResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
  }>(page, WebdavAutoSyncMessageTypes.UpdateSettings, {
    settings: {
      autoSync: true,
      syncInterval: 120,
      syncStrategy: WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY,
    },
  })
  expect(settingsResponse).toEqual(expect.objectContaining({ success: true }))

  await expect
    .poll(() => getAlarm(serviceWorker, WEBDAV_AUTO_SYNC_ALARM_NAME), {
      message: "WebDAV auto-sync settings should create its production alarm",
    })
    .toEqual(
      expect.objectContaining({
        name: WEBDAV_AUTO_SYNC_ALARM_NAME,
        periodInMinutes: 2,
      }),
    )

  await scheduleAlarmSoon(serviceWorker, WEBDAV_AUTO_SYNC_ALARM_NAME)

  await expect
    .poll(
      async () => {
        return uploadedPayloads.at(-1)
      },
      {
        message:
          "WebDAV auto-sync alarm should upload a current local account backup",
        timeout: 15_000,
      },
    )
    .toEqual(
      expect.objectContaining({
        accounts: expect.objectContaining({
          accounts: [
            expect.objectContaining({
              id: accountId,
              site_name: "WebDAV Alarm Hub",
            }),
          ],
        }),
      }),
    )

  expect(tempDeleteUrls).toEqual([])

  const statusResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
    data: { lastSyncStatus: string; lastSyncError: string | null }
  }>(page, WebdavAutoSyncMessageTypes.GetStatus)
  expect(statusResponse).toEqual(
    expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        lastSyncStatus: "success",
        lastSyncError: null,
      }),
    }),
  )
})

test("runs WebDAV best-effort upload when its dedicated MV3 alarm fires", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const bookmarkId = "webdav-best-effort-bookmark"
  const backupFileUrl =
    "https://webdav-best-effort.example.com/alarm-backup.json"
  const { tempDeleteUrls, uploadedPayloads } = await stubWebdavBackupRoutes(
    context,
    {
      backupFileUrl,
    },
  )

  await seedStoredBookmarks(serviceWorker, [
    createStoredBookmark({
      id: bookmarkId,
      name: "Best Effort Alarm Bookmark",
      url: "https://webdav-best-effort.example.com/docs",
    }),
  ])
  await seedUserPreferences(serviceWorker, {
    webdav: {
      ...DEFAULT_PREFERENCES.webdav,
      autoSync: true,
      url: backupFileUrl,
      username: "webdav-best-effort-user",
      password: "webdav-best-effort-password",
      syncInterval: 120,
      syncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
      syncData: {
        accounts: false,
        bookmarks: true,
        apiCredentialProfiles: false,
        preferences: false,
      },
    },
  })

  await openExtensionPage(page, extensionId)
  await scheduleAlarmSoon(serviceWorker, WEBDAV_BEST_EFFORT_UPLOAD_ALARM_NAME)

  await expect
    .poll(
      async () => {
        return uploadedPayloads.at(-1)
      },
      {
        message:
          "WebDAV best-effort alarm should upload a current local bookmark backup",
        timeout: 15_000,
      },
    )
    .toEqual(
      expect.objectContaining({
        accounts: expect.objectContaining({
          bookmarks: [
            expect.objectContaining({
              id: bookmarkId,
              name: "Best Effort Alarm Bookmark",
            }),
          ],
        }),
      }),
    )

  expect(tempDeleteUrls).toEqual([])

  const statusResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
    data: { lastSyncStatus: string; lastSyncError: string | null }
  }>(page, WebdavAutoSyncMessageTypes.GetStatus)
  expect(statusResponse).toEqual(
    expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        lastSyncStatus: "success",
        lastSyncError: null,
      }),
    }),
  )
})

test("runs auto-checkin retries when its MV3 alarm fires", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const accountId = "auto-checkin-retry-alarm-account"
  const accountName = "Retry Alarm Account"
  const baseUrl = "https://auto-checkin-retry.example.com"
  const today = getLocalDay()
  let checkinRequests = 0

  await context.route(`${baseUrl}/api/user/checkin`, (route) => {
    checkinRequests += 1
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "check-in completed on retry",
        data: { checkin_date: today, quota_awarded: 1 },
      }),
    })
  })

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: accountId,
      site_name: accountName,
      site_url: baseUrl,
      site_type: SITE_TYPES.NEW_API,
      account_info: {
        id: "74",
        username: "retry-alarm-user",
        access_token: "retry-alarm-token",
      },
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
        siteStatus: {
          isCheckedInToday: false,
        },
      },
    }),
  ])
  await seedUserPreferences(serviceWorker, {
    autoCheckin: {
      ...DEFAULT_PREFERENCES.autoCheckin!,
      globalEnabled: true,
      pretriggerDailyOnUiOpen: false,
      notifyUiOnCompletion: true,
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

  await openExtensionPage(page, extensionId)
  await seedAutoCheckinStatus(serviceWorker, {
    lastDailyRunDay: today,
    lastRunAt: new Date(Date.now() - 60_000).toISOString(),
    lastRunResult: "failed",
    perAccount: {
      [accountId]: {
        accountId,
        accountName,
        status: "failed",
        message: "initial daily failure",
        timestamp: Date.now() - 60_000,
      },
    },
    summary: {
      totalEligible: 1,
      executed: 1,
      successCount: 0,
      failedCount: 1,
      skippedCount: 0,
      needsRetry: true,
    },
    accountsSnapshot: [
      {
        accountId,
        accountName,
        siteType: SITE_TYPES.NEW_API,
        detectionEnabled: true,
        autoCheckinEnabled: true,
        providerAvailable: true,
        isCheckedInToday: false,
        lastResult: {
          accountId,
          accountName,
          status: "failed",
          message: "initial daily failure",
          timestamp: Date.now() - 60_000,
        },
      },
    ],
    retryState: {
      day: today,
      pendingAccountIds: [accountId],
      attemptsByAccount: {
        [accountId]: 1,
      },
    },
    pendingRetry: true,
    retryAlarmTargetDay: today,
  })

  await scheduleAlarmSoon(serviceWorker, AUTO_CHECKIN_RETRY_ALARM_NAME)

  await expect
    .poll(
      async () => {
        return await readJsonStorageValue<AutoCheckinStatus>(
          serviceWorker,
          AUTO_CHECKIN_STATUS_STORAGE_KEY,
        )
      },
      {
        message:
          "auto-checkin retry alarm should retry only today's pending account",
        timeout: 15_000,
      },
    )
    .toEqual(
      expect.objectContaining({
        lastRunResult: "success",
        pendingRetry: false,
        perAccount: expect.objectContaining({
          [accountId]: expect.objectContaining({
            accountId,
            accountName,
            status: "success",
            rawMessage: "check-in completed on retry",
          }),
        }),
        summary: expect.objectContaining({
          totalEligible: 1,
          executed: 1,
          successCount: 1,
          failedCount: 0,
          skippedCount: 0,
          needsRetry: false,
        }),
      }),
    )
  const statusAfterRetry = await readJsonStorageValue<AutoCheckinStatus>(
    serviceWorker,
    AUTO_CHECKIN_STATUS_STORAGE_KEY,
  )
  expect(statusAfterRetry?.retryState).toBeUndefined()
  expect(checkinRequests).toBe(1)
})

test("runs auto-checkin daily check-ins when its MV3 alarm fires", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const accountId = "auto-checkin-daily-alarm-account"
  const accountName = "Daily Alarm Account"
  const baseUrl = "https://auto-checkin-daily.example.com"
  const today = getLocalDay()
  let checkinRequests = 0

  await context.route(`${baseUrl}/api/user/checkin`, (route) => {
    checkinRequests += 1
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "check-in completed on daily alarm",
        data: { checkin_date: today, quota_awarded: 1 },
      }),
    })
  })

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: accountId,
      site_name: accountName,
      site_url: baseUrl,
      site_type: SITE_TYPES.NEW_API,
      account_info: {
        id: "75",
        username: "daily-alarm-user",
        access_token: "daily-alarm-token",
      },
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
        siteStatus: {
          isCheckedInToday: false,
        },
      },
    }),
  ])
  await seedUserPreferences(serviceWorker, {
    autoCheckin: {
      ...DEFAULT_PREFERENCES.autoCheckin!,
      globalEnabled: true,
      pretriggerDailyOnUiOpen: false,
      notifyUiOnCompletion: true,
      windowStart: "00:00",
      windowEnd: "23:59",
      scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
      deterministicTime: "23:58",
      retryStrategy: {
        enabled: false,
        intervalMinutes: 30,
        maxAttemptsPerDay: 1,
      },
    },
  })
  await seedAutoCheckinStatus(serviceWorker, {
    dailyAlarmTargetDay: today,
  })

  await openExtensionPage(page, extensionId)
  await scheduleAlarmSoon(serviceWorker, AUTO_CHECKIN_DAILY_ALARM_NAME)

  await expect
    .poll(
      async () => {
        return await readJsonStorageValue<AutoCheckinStatus>(
          serviceWorker,
          AUTO_CHECKIN_STATUS_STORAGE_KEY,
        )
      },
      {
        message:
          "auto-checkin daily alarm should run today's eligible account once",
        timeout: 15_000,
      },
    )
    .toEqual(
      expect.objectContaining({
        lastDailyRunDay: today,
        lastRunResult: "success",
        pendingRetry: false,
        perAccount: expect.objectContaining({
          [accountId]: expect.objectContaining({
            accountId,
            accountName,
            status: "success",
            rawMessage: "check-in completed on daily alarm",
          }),
        }),
        summary: expect.objectContaining({
          totalEligible: 1,
          executed: 1,
          successCount: 1,
          failedCount: 0,
          skippedCount: 0,
          needsRetry: false,
        }),
      }),
    )
  const statusAfterDailyAlarm = await readJsonStorageValue<AutoCheckinStatus>(
    serviceWorker,
    AUTO_CHECKIN_STATUS_STORAGE_KEY,
  )
  expect(statusAfterDailyAlarm?.retryState).toBeUndefined()
  expect(checkinRequests).toBe(1)
})

test("checks latest release metadata when its MV3 alarm fires for an eligible install", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  let githubReleaseRequests = 0

  await context.route(
    "https://api.github.com/repos/qixing-jk/all-api-hub/releases/latest",
    (route) => {
      githubReleaseRequests += 1
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tag_name: "v9.9.9",
          html_url:
            "https://github.com/qixing-jk/all-api-hub/releases/tag/v9.9.9",
        }),
      })
    },
  )

  await openExtensionPage(page, extensionId)
  await expect
    .poll(() => getAlarm(serviceWorker, RELEASE_UPDATE_ALARM_NAME), {
      message: "release-update service should keep its daily production alarm",
    })
    .toEqual(
      expect.objectContaining({
        name: RELEASE_UPDATE_ALARM_NAME,
        periodInMinutes: 24 * 60,
      }),
    )

  await scheduleAlarmSoon(serviceWorker, RELEASE_UPDATE_ALARM_NAME)

  await expect
    .poll(
      async () => {
        return await readJsonStorageValue<{
          eligible: boolean
          reason: string
          latestVersion: string | null
          updateAvailable: boolean
        }>(serviceWorker, STORAGE_KEYS.RELEASE_UPDATE_STATUS)
      },
      {
        message:
          "release-update alarm should fetch GitHub and persist latest release metadata",
        timeout: 15_000,
      },
    )
    .toEqual(
      expect.objectContaining({
        eligible: true,
        reason: "chromium-development",
        latestVersion: "9.9.9",
        updateAvailable: true,
      }),
    )
  expect(githubReleaseRequests).toBeGreaterThanOrEqual(1)
})

test("runs managed-site model sync when its MV3 alarm fires", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const { updatePayloads } = await stubManagedSiteAdminRoutes(context, {
    channels: [
      createManagedSiteChannel({
        id: 101,
        name: "Alarm Synced Channel",
        base_url: "https://upstream-a.example.com/v1",
        models: "gpt-4o-mini",
      }),
    ],
    fetchedModelsByChannelId: {
      101: ["gpt-4o-mini", "gpt-4.1-mini"],
    },
  })

  await seedUserPreferences(serviceWorker, {
    managedSiteType: SITE_TYPES.NEW_API,
    newApi: {
      ...DEFAULT_PREFERENCES.newApi,
      baseUrl: MANAGED_SITE_ALARM_BASE_URL,
      adminToken: MANAGED_SITE_ALARM_ADMIN_TOKEN,
      userId: MANAGED_SITE_ALARM_USER_ID,
    },
    managedSiteModelSync: {
      enabled: true,
      interval: 5 * 60 * 1000,
      concurrency: 1,
      maxRetries: 0,
      rateLimit: {
        requestsPerMinute: 60,
        burst: 10,
      },
      allowedModels: [],
      globalChannelModelFilters: [],
    },
  })

  await openExtensionPage(page, extensionId)
  await scheduleAlarmSoon(serviceWorker, MANAGED_SITE_MODEL_SYNC_ALARM_NAME)

  await expect
    .poll(
      async () => {
        return await readJsonStorageValue<ExecutionResult>(
          serviceWorker,
          "managedSiteModelSync_lastExecution",
        )
      },
      {
        message:
          "managed-site model-sync alarm should fetch upstream models and persist execution results",
        timeout: 15_000,
      },
    )
    .toEqual(
      expect.objectContaining({
        statistics: expect.objectContaining({
          total: 1,
          successCount: 1,
          failureCount: 0,
        }),
        items: [
          expect.objectContaining({
            channelId: 101,
            channelName: "Alarm Synced Channel",
            ok: true,
            oldModels: ["gpt-4o-mini"],
            newModels: ["gpt-4o-mini", "gpt-4.1-mini"],
          }),
        ],
      }),
    )

  expect(updatePayloads).toContainEqual({
    id: 101,
    models: "gpt-4o-mini,gpt-4.1-mini",
  })
})
