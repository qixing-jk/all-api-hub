import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { SiteAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { SITE_ANNOUNCEMENTS_ALARM_NAME } from "~/services/siteAnnouncements/constants"
import {
  SITE_ANNOUNCEMENT_PROVIDER_IDS,
  SITE_ANNOUNCEMENT_STATUS,
  type SiteAnnouncementStoreState,
} from "~/types/siteAnnouncements"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedSiteAnnouncementsStore,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const SITE_ANNOUNCEMENTS_URL = (extensionId: string) =>
  `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.SITE_ANNOUNCEMENTS}`
const POLLING_ACCOUNT_ID = "announcement-polling-account"
const POLLING_SITE_NAME = "Announcement Polling Hub"
const POLLING_SITE_URL = "https://announcement-polling.example.com"
const POLLING_SITE_KEY = `notice:new-api:${POLLING_SITE_URL}`
const POLLING_NOTICE_TEXT =
  "Background polling notice. Scheduler fetched this through the MV3 alarm path."
const POLLING_INTERVAL_MINUTES = 15

async function readSiteAnnouncementsStore(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<SiteAnnouncementStoreState | null> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE,
  )

  if (typeof raw !== "string") return null

  return JSON.parse(raw) as SiteAnnouncementStoreState
}

async function getSiteAnnouncementAlarm(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<{
  name: string
  scheduledTime?: number
  periodInMinutes?: number
} | null> {
  return await getAlarm(serviceWorker, SITE_ANNOUNCEMENTS_ALARM_NAME)
}

async function getAlarm(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  alarmName: string,
): Promise<{
  name: string
  scheduledTime?: number
  periodInMinutes?: number
} | null> {
  return await serviceWorker.evaluate(async (alarmName) => {
    const chromeApi = (globalThis as any).chrome
    const alarm = await chromeApi.alarms.get(alarmName)
    return alarm
      ? {
          name: alarm.name,
          scheduledTime: alarm.scheduledTime,
          periodInMinutes: alarm.periodInMinutes,
        }
      : null
  }, alarmName)
}

async function scheduleSiteAnnouncementAlarmSoon(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
) {
  await scheduleAlarmSoon(serviceWorker, SITE_ANNOUNCEMENTS_ALARM_NAME)
}

async function scheduleAlarmSoon(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  alarmName: string,
) {
  await serviceWorker.evaluate(async (alarmName) => {
    const chromeApi = (globalThis as any).chrome
    await chromeApi.alarms.create(alarmName, {
      when: Date.now() + 1_000,
    })
  }, alarmName)
}

async function clearSiteAnnouncementAlarm(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
) {
  await serviceWorker.evaluate(async (alarmName) => {
    const chromeApi = (globalThis as any).chrome
    await chromeApi.alarms.clear(alarmName)
  }, SITE_ANNOUNCEMENTS_ALARM_NAME)
}

async function seedPollingAnnouncementScenario(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
) {
  await seedUserPreferences(serviceWorker, {
    siteAnnouncementNotifications: {
      enabled: true,
      notificationEnabled: false,
      intervalMinutes: POLLING_INTERVAL_MINUTES,
    },
  })
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: POLLING_ACCOUNT_ID,
      site_name: POLLING_SITE_NAME,
      site_url: POLLING_SITE_URL,
      site_type: SITE_TYPES.NEW_API,
      account_info: {
        id: "42",
        username: "announcement-polling-user",
        access_token: "announcement-polling-token",
      },
    }),
  ])
}

async function sendTypedRuntimeMessageFromPage<TResponse>(
  page: Parameters<typeof forceExtensionLanguage>[0],
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

function createAnnouncementStore(): SiteAnnouncementStoreState["sites"] {
  const now = Date.now()
  const newApiSiteKey = "notice:new-api:https://announcements-a.example.com"
  const sub2apiSiteKey = "notice:sub2api:https://announcements-b.example.com"

  return {
    [newApiSiteKey]: {
      siteKey: newApiSiteKey,
      siteName: "Announcement Hub A",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://announcements-a.example.com",
      accountId: "announcement-account-a",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: SITE_ANNOUNCEMENT_STATUS.Success,
      lastCheckedAt: now,
      lastSuccessAt: now,
      records: [
        {
          id: "announcement-record-a",
          siteKey: newApiSiteKey,
          siteName: "Announcement Hub A",
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://announcements-a.example.com",
          accountId: "announcement-account-a",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          title: "Scheduled maintenance window",
          content: "The provider will rotate billing infrastructure tonight.",
          fingerprint: "announcement-record-a-fp",
          firstSeenAt: now - 60_000,
          lastSeenAt: now,
          createdAt: now - 60_000,
          notifiedAt: now - 30_000,
          read: false,
        },
      ],
    },
    [sub2apiSiteKey]: {
      siteKey: sub2apiSiteKey,
      siteName: "Announcement Hub B",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://announcements-b.example.com",
      accountId: "announcement-account-b",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api,
      status: SITE_ANNOUNCEMENT_STATUS.Success,
      lastCheckedAt: now,
      lastSuccessAt: now,
      records: [
        {
          id: "announcement-record-b",
          siteKey: sub2apiSiteKey,
          siteName: "Announcement Hub B",
          siteType: SITE_TYPES.SUB2API,
          baseUrl: "https://announcements-b.example.com",
          accountId: "announcement-account-b",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api,
          title: "Model quota restored",
          content: "Sub2API quota has been restored for the public endpoint.",
          fingerprint: "announcement-record-b-fp",
          firstSeenAt: now - 120_000,
          lastSeenAt: now,
          createdAt: now - 120_000,
          read: true,
          readAt: now - 90_000,
        },
      ],
    },
  }
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("filters cached site announcements and marks unread items as read", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedSiteAnnouncementsStore(serviceWorker, createAnnouncementStore())

  await page.goto(SITE_ANNOUNCEMENTS_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Site Announcements" }),
  ).toBeVisible()
  await expect(page.getByText("Scheduled maintenance window")).toBeVisible()
  await expect(page.getByText("Model quota restored")).toBeVisible()
  await expect(page.getByText("Showing 2 of 2 announcements")).toBeVisible()

  await page.getByRole("combobox").nth(2).click()
  await page.getByRole("option", { name: "Unread" }).click()

  await expect(page.getByText("Scheduled maintenance window")).toBeVisible()
  await expect(page.getByText("Model quota restored")).toHaveCount(0)
  await expect(page.getByText(/Showing 1 of 2 announcement/)).toBeVisible()

  await page.getByText("Scheduled maintenance window").click()
  await expect(
    page.getByText("The provider will rotate billing infrastructure tonight."),
  ).toBeVisible()

  await page.getByRole("button", { name: "Mark read" }).click()

  await expect
    .poll(async () => {
      const store = await readSiteAnnouncementsStore(serviceWorker)
      return store?.sites[
        "notice:new-api:https://announcements-a.example.com"
      ]?.records.find((record) => record.id === "announcement-record-a")
    })
    .toMatchObject({ read: true })

  await expect(
    page.getByText("No announcements match the current filters"),
  ).toBeVisible()
})

test("polls site announcements through the MV3 alarm scheduler and stores fetched records", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  let noticeRequests = 0

  await context.route(`${POLLING_SITE_URL}/api/notice`, async (route) => {
    noticeRequests += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "ok",
        data: POLLING_NOTICE_TEXT,
      }),
    })
  })

  await seedPollingAnnouncementScenario(serviceWorker)

  await page.goto(SITE_ANNOUNCEMENTS_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const statusResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
    data?: unknown[]
    error?: string
  }>(page, SiteAnnouncementsMessageTypes.GetStatus)
  expect(statusResponse).toMatchObject({ success: true })
  const settingsResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
    data?: unknown
    error?: string
  }>(page, SiteAnnouncementsMessageTypes.UpdatePreferences, {
    settings: {
      enabled: true,
      notificationEnabled: false,
      intervalMinutes: POLLING_INTERVAL_MINUTES,
    },
  })
  expect(settingsResponse).toMatchObject({ success: true })
  const activeServiceWorker = await getServiceWorker(context)

  await expect
    .poll(() => getSiteAnnouncementAlarm(activeServiceWorker), {
      message: "site announcement scheduler should reconcile an enabled alarm",
    })
    .toMatchObject({
      name: SITE_ANNOUNCEMENTS_ALARM_NAME,
      periodInMinutes: POLLING_INTERVAL_MINUTES,
    })

  await scheduleSiteAnnouncementAlarmSoon(activeServiceWorker)

  await expect
    .poll(
      async () => {
        const store = await readSiteAnnouncementsStore(activeServiceWorker)
        return store?.sites[POLLING_SITE_KEY]?.records[0]
      },
      {
        message: "site announcement alarm should fetch and persist records",
        timeout: 15_000,
      },
    )
    .toMatchObject({
      siteName: POLLING_SITE_NAME,
      siteType: SITE_TYPES.NEW_API,
      baseUrl: POLLING_SITE_URL,
      accountId: POLLING_ACCOUNT_ID,
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      content: POLLING_NOTICE_TEXT,
      read: false,
    })
  expect(noticeRequests).toBeGreaterThanOrEqual(1)

  await page.reload()
  await waitForExtensionRoot(page)

  await expect(
    page.getByRole("heading", { name: "Background polling notice" }),
  ).toBeVisible()
  await expect(page.getByText(POLLING_SITE_NAME)).toBeVisible()
  await expect(page.getByText("Showing 1 of 1 announcement")).toBeVisible()
})

test("reconciles, filters, and clears site announcement MV3 alarms", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const unrelatedAlarmName = "siteAnnouncementsUnrelatedE2E"
  let noticeRequests = 0

  await context.route(`${POLLING_SITE_URL}/api/notice`, async (route) => {
    noticeRequests += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "ok",
        data: "Unrelated alarms must not fetch this notice.",
      }),
    })
  })

  await seedPollingAnnouncementScenario(serviceWorker)

  await page.goto(SITE_ANNOUNCEMENTS_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const settingsResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
  }>(page, SiteAnnouncementsMessageTypes.UpdatePreferences, {
    settings: {
      enabled: true,
      notificationEnabled: false,
      intervalMinutes: POLLING_INTERVAL_MINUTES,
    },
  })
  expect(settingsResponse).toMatchObject({ success: true })

  const statusResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
  }>(page, SiteAnnouncementsMessageTypes.GetStatus)
  expect(statusResponse).toMatchObject({ success: true })

  await expect
    .poll(() => getSiteAnnouncementAlarm(serviceWorker), {
      message:
        "enabled polling should restore a missing site announcement alarm",
    })
    .toMatchObject({
      name: SITE_ANNOUNCEMENTS_ALARM_NAME,
      periodInMinutes: POLLING_INTERVAL_MINUTES,
    })

  await clearSiteAnnouncementAlarm(serviceWorker)
  await expect
    .poll(() => getSiteAnnouncementAlarm(serviceWorker), {
      message: "test setup should remove the real alarm before reconciliation",
    })
    .toBeNull()

  const reconcileResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
  }>(page, SiteAnnouncementsMessageTypes.GetStatus)
  expect(reconcileResponse).toMatchObject({ success: true })
  await expect
    .poll(() => getSiteAnnouncementAlarm(serviceWorker), {
      message: "status queries should recreate a missing persisted alarm",
    })
    .toMatchObject({
      name: SITE_ANNOUNCEMENTS_ALARM_NAME,
      periodInMinutes: POLLING_INTERVAL_MINUTES,
    })

  await scheduleAlarmSoon(serviceWorker, unrelatedAlarmName)
  await expect
    .poll(() => getAlarm(serviceWorker, unrelatedAlarmName), {
      message: "test setup should create the unrelated one-shot alarm",
    })
    .toMatchObject({
      name: unrelatedAlarmName,
    })
  await expect
    .poll(() => getAlarm(serviceWorker, unrelatedAlarmName), {
      message: "the unrelated one-shot alarm should fire and disappear",
      timeout: 15_000,
    })
    .toBeNull()

  expect(noticeRequests).toBe(0)
  await expect
    .poll(async () => {
      const store = await readSiteAnnouncementsStore(serviceWorker)
      return store?.sites[POLLING_SITE_KEY]?.records.length ?? 0
    })
    .toBe(0)

  const disableResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
  }>(page, SiteAnnouncementsMessageTypes.UpdatePreferences, {
    settings: {
      enabled: false,
      notificationEnabled: false,
      intervalMinutes: POLLING_INTERVAL_MINUTES,
    },
  })
  expect(disableResponse).toMatchObject({ success: true })
  await expect
    .poll(() => getSiteAnnouncementAlarm(serviceWorker), {
      message: "disabling polling should clear the real MV3 alarm",
    })
    .toBeNull()
})

test("preserves matching site announcement alarms across repeated reconciliations", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)

  await seedPollingAnnouncementScenario(serviceWorker)

  await page.goto(SITE_ANNOUNCEMENTS_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const settingsResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
  }>(page, SiteAnnouncementsMessageTypes.UpdatePreferences, {
    settings: {
      enabled: true,
      notificationEnabled: false,
      intervalMinutes: POLLING_INTERVAL_MINUTES,
    },
  })
  expect(settingsResponse).toMatchObject({ success: true })

  await expect
    .poll(() => getSiteAnnouncementAlarm(serviceWorker), {
      message: "enabled polling should schedule the site announcement alarm",
    })
    .toMatchObject({
      name: SITE_ANNOUNCEMENTS_ALARM_NAME,
      periodInMinutes: POLLING_INTERVAL_MINUTES,
    })

  const initialAlarm = await getSiteAnnouncementAlarm(serviceWorker)
  expect(initialAlarm?.scheduledTime).toBeTruthy()

  const statusResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
  }>(page, SiteAnnouncementsMessageTypes.GetStatus)
  expect(statusResponse).toMatchObject({ success: true })

  await expect
    .poll(() => getSiteAnnouncementAlarm(serviceWorker), {
      message: "status reconciliation should preserve the matching alarm",
    })
    .toMatchObject({
      name: SITE_ANNOUNCEMENTS_ALARM_NAME,
      scheduledTime: initialAlarm?.scheduledTime,
      periodInMinutes: POLLING_INTERVAL_MINUTES,
    })

  const repeatedSettingsResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
  }>(page, SiteAnnouncementsMessageTypes.UpdatePreferences, {
    settings: {
      enabled: true,
      notificationEnabled: false,
      intervalMinutes: POLLING_INTERVAL_MINUTES,
    },
  })
  expect(repeatedSettingsResponse).toMatchObject({ success: true })

  await expect
    .poll(() => getSiteAnnouncementAlarm(serviceWorker), {
      message: "saving unchanged settings should not drift the alarm schedule",
    })
    .toMatchObject({
      name: SITE_ANNOUNCEMENTS_ALARM_NAME,
      scheduledTime: initialAlarm?.scheduledTime,
      periodInMinutes: POLLING_INTERVAL_MINUTES,
    })
})

test("skips early site announcement alarms while persisted cooldown is active", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const lastCheckedAt = Date.now()
  let noticeRequests = 0

  await context.route(`${POLLING_SITE_URL}/api/notice`, async (route) => {
    noticeRequests += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "ok",
        data: "Early alarms should not bypass persisted cooldown.",
      }),
    })
  })

  await seedPollingAnnouncementScenario(serviceWorker)
  await seedSiteAnnouncementsStore(serviceWorker, {
    [POLLING_SITE_KEY]: {
      siteKey: POLLING_SITE_KEY,
      siteName: POLLING_SITE_NAME,
      siteType: SITE_TYPES.NEW_API,
      baseUrl: POLLING_SITE_URL,
      accountId: POLLING_ACCOUNT_ID,
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: SITE_ANNOUNCEMENT_STATUS.Success,
      lastCheckedAt,
      lastSuccessAt: lastCheckedAt,
      records: [],
    },
  })

  await page.goto(SITE_ANNOUNCEMENTS_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const settingsResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
  }>(page, SiteAnnouncementsMessageTypes.UpdatePreferences, {
    settings: {
      enabled: true,
      notificationEnabled: false,
      intervalMinutes: POLLING_INTERVAL_MINUTES,
    },
  })
  expect(settingsResponse).toMatchObject({ success: true })

  await expect
    .poll(() => getSiteAnnouncementAlarm(serviceWorker), {
      message: "cooldown-aware reconciliation should keep a periodic alarm",
    })
    .toMatchObject({
      name: SITE_ANNOUNCEMENTS_ALARM_NAME,
      periodInMinutes: POLLING_INTERVAL_MINUTES,
    })

  await scheduleSiteAnnouncementAlarmSoon(serviceWorker)

  await expect
    .poll(() => getSiteAnnouncementAlarm(serviceWorker), {
      message:
        "an early alarm should fire, skip fetching, and restore the periodic schedule",
      timeout: 15_000,
    })
    .toMatchObject({
      name: SITE_ANNOUNCEMENTS_ALARM_NAME,
      periodInMinutes: POLLING_INTERVAL_MINUTES,
    })

  expect(noticeRequests).toBe(0)
  await expect
    .poll(async () => {
      const store = await readSiteAnnouncementsStore(serviceWorker)
      return store?.sites[POLLING_SITE_KEY]
    })
    .toMatchObject({
      lastCheckedAt,
      records: [],
    })
})
