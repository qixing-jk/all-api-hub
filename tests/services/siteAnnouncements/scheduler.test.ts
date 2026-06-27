import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { SITE_TYPES } from "~/constants/siteType"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { SiteAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import {
  resolveSiteAnnouncementsCheckNowMessage,
  resolveSiteAnnouncementsGetStatusMessage,
  resolveSiteAnnouncementsListRecordsMessage,
  resolveSiteAnnouncementsMarkAllReadMessage,
  resolveSiteAnnouncementsMarkReadMessage,
  resolveSiteAnnouncementsUpdatePreferencesMessage,
  setupSiteAnnouncementsMessagingListeners,
  siteAnnouncementScheduler,
} from "~/services/siteAnnouncements/scheduler"
import { siteAnnouncementStorage } from "~/services/siteAnnouncements/storage"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { SITE_ANNOUNCEMENT_PROVIDER_IDS } from "~/types/siteAnnouncements"

const {
  clearAlarmMock,
  createAlarmMock,
  getAlarmMock,
  getEnabledAccountsMock,
  getAccountByIdMock,
  hasAlarmsAPIMock,
  getPreferencesMock,
  notifySiteAnnouncementsMock,
  onSiteAnnouncementsMessageMock,
  onAlarmMock,
  providerFetchMock,
  providerMarkReadMock,
  savePreferencesMock,
  siteAnnouncementsMessageHandlers,
} = vi.hoisted(() => ({
  clearAlarmMock: vi.fn(),
  createAlarmMock: vi.fn(),
  getAlarmMock: vi.fn(),
  getEnabledAccountsMock: vi.fn(),
  getAccountByIdMock: vi.fn(),
  hasAlarmsAPIMock: vi.fn(() => true),
  getPreferencesMock: vi.fn(),
  notifySiteAnnouncementsMock: vi.fn(),
  onSiteAnnouncementsMessageMock: vi.fn(),
  onAlarmMock: vi.fn(),
  providerFetchMock: vi.fn(),
  providerMarkReadMock: vi.fn(),
  savePreferencesMock: vi.fn(),
  siteAnnouncementsMessageHandlers: new Map<
    string,
    (message: { data: Record<string, unknown> }) => Promise<unknown> | unknown
  >(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
  clearAlarm: clearAlarmMock,
  createAlarm: createAlarmMock,
  getAlarm: getAlarmMock,
  hasAlarmsAPI: hasAlarmsAPIMock,
  onAlarm: onAlarmMock,
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getEnabledAccounts: getEnabledAccountsMock,
    getAccountById: getAccountByIdMock,
  },
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: getPreferencesMock,
    savePreferences: savePreferencesMock,
  },
}))

vi.mock("~/services/siteAnnouncements/notificationService", () => ({
  notifySiteAnnouncements: notifySiteAnnouncementsMock,
}))

vi.mock("~/services/siteAnnouncements/messaging", () => ({
  onSiteAnnouncementsMessage: onSiteAnnouncementsMessageMock.mockImplementation(
    (type, handler) => {
      siteAnnouncementsMessageHandlers.set(type, handler)
      return vi.fn()
    },
  ),
}))

vi.mock("~/services/siteAnnouncements/providers", () => ({
  getSiteAnnouncementProvider: (siteType: string) => ({
    id:
      siteType === "sub2api"
        ? SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api
        : SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
    createSiteKey: ({ accountId, baseUrl }: any) =>
      siteType === "sub2api"
        ? `sub2api:${accountId}:${baseUrl}`
        : `notice:${siteType}:${baseUrl}`,
    fetch: providerFetchMock,
    markRead: providerMarkReadMock,
  }),
}))

function createAccount(overrides: Partial<any> = {}) {
  return {
    id: "account-1",
    site_name: "Example",
    site_url: "https://example.com",
    site_type: "new-api",
    disabled: false,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: "1",
      access_token: "token",
      username: "user",
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    health: { status: SiteHealthStatus.Unknown },
    exchange_rate: 7,
    last_sync_time: 0,
    updated_at: 0,
    created_at: 0,
    notes: "",
    tagIds: [],
    excludeFromTotalBalance: false,
    checkIn: { enableDetection: false },
    ...overrides,
  }
}

describe("siteAnnouncementScheduler", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const storage = new Storage({ area: "local" })
    await storage.remove(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE)
    ;(siteAnnouncementScheduler as any).isInitialized = false
    ;(siteAnnouncementScheduler as any).isRunning = false
    hasAlarmsAPIMock.mockReturnValue(true)
    getAlarmMock.mockResolvedValue(undefined)
    getPreferencesMock.mockResolvedValue({
      siteAnnouncementNotifications: {
        enabled: true,
        notificationEnabled: true,
        intervalMinutes: 360,
      },
    })
    savePreferencesMock.mockResolvedValue(true)
    notifySiteAnnouncementsMock.mockResolvedValue({ success: true })
    getAccountByIdMock.mockResolvedValue(null)
    getEnabledAccountsMock.mockResolvedValue([])
  })

  it("initializes a six-hour alarm from preferences", async () => {
    await siteAnnouncementScheduler.initialize()

    expect(onAlarmMock).toHaveBeenCalled()
    expect(createAlarmMock).toHaveBeenCalledWith("siteAnnouncementsCheck", {
      periodInMinutes: 360,
      delayInMinutes: 1,
    })
  })

  it("falls back to the default interval when stored polling interval is invalid", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      siteAnnouncementNotifications: {
        enabled: true,
        notificationEnabled: true,
        intervalMinutes: "bad",
      },
    })

    await siteAnnouncementScheduler.initialize()

    expect(createAlarmMock).toHaveBeenCalledWith("siteAnnouncementsCheck", {
      periodInMinutes: 360,
      delayInMinutes: 1,
    })
  })

  it("preserves an existing announcement alarm when the period already matches", async () => {
    getAlarmMock.mockResolvedValueOnce({
      name: "siteAnnouncementsCheck",
      periodInMinutes: 360,
      scheduledTime: Date.now() + 60_000,
    })

    await siteAnnouncementScheduler.initialize()

    expect(clearAlarmMock).not.toHaveBeenCalled()
    expect(createAlarmMock).not.toHaveBeenCalled()
  })

  it("recreates a missing announcement alarm when status is queried", async () => {
    getAlarmMock
      .mockResolvedValueOnce({
        name: "siteAnnouncementsCheck",
        periodInMinutes: 360,
        scheduledTime: Date.now() + 60_000,
      })
      .mockResolvedValueOnce(undefined)

    await siteAnnouncementScheduler.initialize()
    expect(createAlarmMock).not.toHaveBeenCalled()

    const response = await resolveSiteAnnouncementsGetStatusMessage()

    expect(createAlarmMock).toHaveBeenCalledWith("siteAnnouncementsCheck", {
      periodInMinutes: 360,
      delayInMinutes: 1,
    })
    expect(response).toMatchObject({
      success: true,
      data: [],
    })
  })

  it("recreates a missing announcement alarm with a short delay when stored status is overdue", async () => {
    const intervalMinutes = 360
    const intervalMs = intervalMinutes * 60 * 1000
    const lastCheckedAt = 1_800_000_000_000
    const now = lastCheckedAt + intervalMs + 5 * 60 * 1000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    getAlarmMock
      .mockResolvedValueOnce({
        name: "siteAnnouncementsCheck",
        periodInMinutes: intervalMinutes,
        scheduledTime: now + 60_000,
      })
      .mockResolvedValueOnce(undefined)
    await siteAnnouncementStorage.upsertSiteStatus({
      siteKey: "notice:new-api:https://example.com",
      siteName: "Example",
      siteType: "new-api",
      baseUrl: "https://example.com",
      accountId: "account-1",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: "success",
      lastCheckedAt,
    })

    await siteAnnouncementScheduler.initialize()
    createAlarmMock.mockClear()
    clearAlarmMock.mockClear()

    const response = await resolveSiteAnnouncementsGetStatusMessage()

    expect(createAlarmMock).toHaveBeenCalledWith("siteAnnouncementsCheck", {
      periodInMinutes: intervalMinutes,
      delayInMinutes: 1,
    })
    expect(response).toMatchObject({
      success: true,
      data: [
        expect.objectContaining({
          siteKey: "notice:new-api:https://example.com",
        }),
      ],
    })
    nowSpy.mockRestore()
  })

  it("recreates a missing announcement alarm with a short delay when an enabled site has no status", async () => {
    const intervalMinutes = 360
    const now = 1_800_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    getAlarmMock
      .mockResolvedValueOnce({
        name: "siteAnnouncementsCheck",
        periodInMinutes: intervalMinutes,
        scheduledTime: now + 60_000,
      })
      .mockResolvedValueOnce(undefined)
    await siteAnnouncementStorage.upsertSiteStatus({
      siteKey: "notice:new-api:https://removed.example.com",
      siteName: "Removed",
      siteType: "new-api",
      baseUrl: "https://removed.example.com",
      accountId: "removed-account",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: "success",
      lastCheckedAt: now - 10 * 60 * 1000,
    })
    getEnabledAccountsMock.mockResolvedValue([
      createAccount({
        id: "unchecked-account",
        site_url: "https://unchecked.example.com",
      }),
    ])

    await siteAnnouncementScheduler.initialize()
    createAlarmMock.mockClear()
    clearAlarmMock.mockClear()

    await resolveSiteAnnouncementsGetStatusMessage()

    expect(createAlarmMock).toHaveBeenCalledWith("siteAnnouncementsCheck", {
      periodInMinutes: intervalMinutes,
      delayInMinutes: 1,
    })
    nowSpy.mockRestore()
  })

  it("realigns an existing same-period alarm when an enabled site has no status", async () => {
    const intervalMinutes = 360
    const now = 1_800_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    getAlarmMock
      .mockResolvedValueOnce({
        name: "siteAnnouncementsCheck",
        periodInMinutes: intervalMinutes,
        scheduledTime: now + intervalMinutes * 60 * 1000,
      })
      .mockResolvedValueOnce({
        name: "siteAnnouncementsCheck",
        periodInMinutes: intervalMinutes,
        scheduledTime: now + intervalMinutes * 60 * 1000,
      })
    await siteAnnouncementStorage.upsertSiteStatus({
      siteKey: "notice:new-api:https://checked.example.com",
      siteName: "Checked",
      siteType: "new-api",
      baseUrl: "https://checked.example.com",
      accountId: "checked-account",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: "success",
      lastCheckedAt: now - 10 * 60 * 1000,
    })
    getEnabledAccountsMock.mockResolvedValue([
      createAccount({
        id: "checked-account",
        site_url: "https://checked.example.com",
      }),
      createAccount({
        id: "unchecked-account",
        site_url: "https://unchecked.example.com",
      }),
    ])

    await siteAnnouncementScheduler.initialize()
    createAlarmMock.mockClear()
    clearAlarmMock.mockClear()

    await resolveSiteAnnouncementsGetStatusMessage()

    expect(clearAlarmMock).toHaveBeenCalledWith("siteAnnouncementsCheck")
    expect(createAlarmMock).toHaveBeenCalledWith("siteAnnouncementsCheck", {
      periodInMinutes: intervalMinutes,
      delayInMinutes: 1,
    })
    nowSpy.mockRestore()
  })

  it("ignores removed site cooldowns when realigning the next announcement alarm", async () => {
    const intervalMinutes = 360
    const now = 1_800_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    getAlarmMock
      .mockResolvedValueOnce({
        name: "siteAnnouncementsCheck",
        periodInMinutes: intervalMinutes,
        scheduledTime: now + intervalMinutes * 60 * 1000,
      })
      .mockResolvedValueOnce({
        name: "siteAnnouncementsCheck",
        periodInMinutes: intervalMinutes,
        scheduledTime: now + intervalMinutes * 60 * 1000,
      })
    await siteAnnouncementStorage.upsertSiteStatus({
      siteKey: "notice:new-api:https://active.example.com",
      siteName: "Active",
      siteType: "new-api",
      baseUrl: "https://active.example.com",
      accountId: "active-account",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: "success",
      lastCheckedAt: now,
    })
    await siteAnnouncementStorage.upsertSiteStatus({
      siteKey: "notice:new-api:https://removed.example.com",
      siteName: "Removed",
      siteType: "new-api",
      baseUrl: "https://removed.example.com",
      accountId: "removed-account",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: "success",
      lastCheckedAt: now - intervalMinutes * 60 * 1000,
    })
    getEnabledAccountsMock.mockResolvedValue([
      createAccount({
        id: "active-account",
        site_url: "https://active.example.com",
      }),
    ])

    await siteAnnouncementScheduler.initialize()
    createAlarmMock.mockClear()
    clearAlarmMock.mockClear()

    const response = await resolveSiteAnnouncementsGetStatusMessage()

    expect(clearAlarmMock).not.toHaveBeenCalled()
    expect(createAlarmMock).not.toHaveBeenCalled()
    expect(response).toMatchObject({
      success: true,
    })
    nowSpy.mockRestore()
  })

  it("keeps announcement alarm cleared when status is queried while polling is disabled", async () => {
    getPreferencesMock.mockResolvedValue({
      siteAnnouncementNotifications: {
        enabled: false,
        notificationEnabled: true,
        intervalMinutes: 360,
      },
    })

    const response = await resolveSiteAnnouncementsGetStatusMessage()

    expect(clearAlarmMock).toHaveBeenCalledWith("siteAnnouncementsCheck")
    expect(createAlarmMock).not.toHaveBeenCalled()
    expect(response).toMatchObject({
      success: true,
      data: [],
    })
  })

  it("initializes only once even when the background service runs setup twice", async () => {
    await siteAnnouncementScheduler.initialize()
    await siteAnnouncementScheduler.initialize()

    expect(onAlarmMock).toHaveBeenCalledTimes(1)
    expect(createAlarmMock).toHaveBeenCalledTimes(1)
  })

  it("ignores unrelated alarm names", async () => {
    await siteAnnouncementScheduler.initialize()

    const alarmHandler = onAlarmMock.mock.calls[0]?.[0]
    expect(alarmHandler).toBeTypeOf("function")
    getEnabledAccountsMock.mockClear()

    await alarmHandler?.({ name: "other-alarm" })

    expect(getEnabledAccountsMock).not.toHaveBeenCalled()
    expect(providerFetchMock).not.toHaveBeenCalled()
  })

  it("skips scheduling when the alarms api is unavailable", async () => {
    hasAlarmsAPIMock.mockReturnValue(false)

    await siteAnnouncementScheduler.initialize()

    expect(createAlarmMock).not.toHaveBeenCalled()
    expect(clearAlarmMock).not.toHaveBeenCalled()
  })

  it("clears the scheduled alarm when announcement polling is disabled", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      siteAnnouncementNotifications: {
        enabled: false,
        notificationEnabled: true,
        intervalMinutes: 360,
      },
    })

    await resolveSiteAnnouncementsUpdatePreferencesMessage({
      settings: { enabled: false },
    })

    expect(clearAlarmMock).toHaveBeenCalledWith("siteAnnouncementsCheck")
    expect(createAlarmMock).not.toHaveBeenCalled()
  })

  it("skips alarm-triggered checks when automatic polling is disabled", async () => {
    await siteAnnouncementScheduler.initialize()

    getPreferencesMock.mockResolvedValue({
      siteAnnouncementNotifications: {
        enabled: false,
        notificationEnabled: true,
        intervalMinutes: 360,
      },
    })

    const alarmHandler = onAlarmMock.mock.calls[0]?.[0]
    expect(alarmHandler).toBeTypeOf("function")
    getEnabledAccountsMock.mockClear()

    await alarmHandler?.({ name: "siteAnnouncementsCheck" })

    expect(getEnabledAccountsMock).not.toHaveBeenCalled()
    expect(providerFetchMock).not.toHaveBeenCalled()
  })

  it("skips alarm-triggered checks for sites checked within the configured interval", async () => {
    const now = 1_800_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    await siteAnnouncementStorage.upsertSiteStatus({
      siteKey: "notice:new-api:https://example.com",
      siteName: "Example",
      siteType: "new-api",
      baseUrl: "https://example.com",
      accountId: "account-1",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: "success",
      lastCheckedAt: now - 10 * 60 * 1000,
    })
    getEnabledAccountsMock.mockResolvedValue([createAccount()])

    await siteAnnouncementScheduler.initialize()

    const alarmHandler = onAlarmMock.mock.calls[0]?.[0]
    expect(alarmHandler).toBeTypeOf("function")
    getEnabledAccountsMock.mockClear()

    await alarmHandler?.({ name: "siteAnnouncementsCheck" })

    expect(getEnabledAccountsMock).toHaveBeenCalledTimes(1)
    expect(providerFetchMock).not.toHaveBeenCalled()
    nowSpy.mockRestore()
  })

  it("realigns the alarm to the cooldown boundary when an alarm fires just before a manual check expires", async () => {
    const intervalMinutes = 360
    const intervalMs = intervalMinutes * 60 * 1000
    const lastCheckedAt = 1_800_000_000_000
    const now = lastCheckedAt + intervalMs - 60_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    getPreferencesMock.mockResolvedValue({
      siteAnnouncementNotifications: {
        enabled: true,
        notificationEnabled: true,
        intervalMinutes,
      },
    })
    await siteAnnouncementStorage.upsertSiteStatus({
      siteKey: "notice:new-api:https://example.com",
      siteName: "Example",
      siteType: "new-api",
      baseUrl: "https://example.com",
      accountId: "account-1",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: "success",
      lastCheckedAt,
    })
    getEnabledAccountsMock.mockResolvedValue([createAccount()])

    await siteAnnouncementScheduler.initialize()

    const alarmHandler = onAlarmMock.mock.calls[0]?.[0]
    expect(alarmHandler).toBeTypeOf("function")
    createAlarmMock.mockClear()
    clearAlarmMock.mockClear()

    await alarmHandler?.({ name: "siteAnnouncementsCheck" })

    expect(providerFetchMock).not.toHaveBeenCalled()
    expect(clearAlarmMock).toHaveBeenCalledWith("siteAnnouncementsCheck")
    expect(createAlarmMock).toHaveBeenCalledWith("siteAnnouncementsCheck", {
      periodInMinutes: intervalMinutes,
      delayInMinutes: 1,
    })
    nowSpy.mockRestore()
  })

  it("filters explicit account ids down to existing enabled accounts", async () => {
    providerFetchMock.mockResolvedValue({
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      siteKey: "notice:new-api:https://example.com",
      status: "success",
      announcements: [],
    })
    getAccountByIdMock.mockImplementation(async (id: string) => {
      if (id === "enabled") {
        return createAccount({ id: "enabled" })
      }

      if (id === "disabled") {
        return createAccount({ id: "disabled", disabled: true })
      }

      return null
    })

    const response = await resolveSiteAnnouncementsCheckNowMessage({
      accountIds: ["enabled", "missing", "disabled"],
    })

    expect(providerFetchMock).toHaveBeenCalledTimes(1)
    if (response.success) {
      expect(response.data).toMatchObject({
        checked: 1,
        created: 0,
        failed: 0,
        unsupported: 0,
      })
    } else {
      expect.fail(response.error)
    }
  })

  it("uses the stored-account API context for provider requests", async () => {
    providerFetchMock.mockResolvedValue({
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api,
      siteKey: "sub2api:sub-1:https://sub.example.com",
      status: "success",
      announcements: [],
    })
    const account = createAccount({
      id: "sub-1",
      site_type: SITE_TYPES.SUB2API,
      site_url: "https://sub.example.com",
      authType: AuthTypeEnum.Cookie,
      account_info: {
        id: "stored-user",
        access_token: "stored-access-token",
        username: "stored-user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      cookieAuth: { sessionCookie: "stored-session-cookie" },
      sub2apiAuth: {
        refreshToken: "stored-refresh-token",
        tokenExpiresAt: 123456,
      },
    })
    getEnabledAccountsMock.mockResolvedValue([account])
    getAccountByIdMock.mockImplementation(async (id: string) =>
      id === account.id ? account : null,
    )

    const response = await resolveSiteAnnouncementsCheckNowMessage({})

    expect(response).toMatchObject({ success: true })
    expect(providerFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiRequest: expect.objectContaining({
          baseUrl: "https://sub.example.com",
          accountId: "sub-1",
          auth: expect.objectContaining({
            authType: AuthTypeEnum.Cookie,
            userId: "stored-user",
            accessToken: "stored-access-token",
            cookie: "stored-session-cookie",
          }),
          sub2apiAuthSession: expect.any(Object),
        }),
      }),
    )
    const providerRequest = providerFetchMock.mock.calls[0]?.[0]
    await expect(
      providerRequest.apiRequest.sub2apiAuthSession.getLatestAuth("sub-1"),
    ).resolves.toEqual(
      expect.objectContaining({
        accessToken: "stored-access-token",
        userId: "stored-user",
        sub2apiAuth: {
          refreshToken: "stored-refresh-token",
          tokenExpiresAt: 123456,
        },
      }),
    )
  })

  it("dedupes common site checks but keeps Sub2API account-scoped checks", async () => {
    providerFetchMock.mockImplementation((request) =>
      Promise.resolve({
        providerId: request.providerId,
        siteKey:
          request.providerId === "sub2api"
            ? `sub2api:${request.accountId}:${request.baseUrl}`
            : `notice:${request.siteType}:${request.baseUrl}`,
        status: "success",
        announcements: [{ content: `Notice ${request.accountId}` }],
      }),
    )
    getEnabledAccountsMock.mockResolvedValue([
      createAccount({ id: "common-1" }),
      createAccount({ id: "common-2" }),
      createAccount({
        id: "sub-1",
        site_type: SITE_TYPES.SUB2API,
        site_url: "https://sub.example.com",
      }),
      createAccount({
        id: "sub-2",
        site_type: SITE_TYPES.SUB2API,
        site_url: "https://sub.example.com",
      }),
    ])

    const response = await resolveSiteAnnouncementsCheckNowMessage({})

    expect(providerFetchMock).toHaveBeenCalledTimes(3)
    if (response.success) {
      expect(response.data).toMatchObject({
        checked: 3,
        created: 3,
        notified: 3,
      })
    } else {
      expect.fail(response.error)
    }
  })

  it("tracks unsupported and error provider results separately", async () => {
    providerFetchMock
      .mockResolvedValueOnce({
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        siteKey: "notice:new-api:https://example.com",
        status: "unsupported",
        announcements: [],
      })
      .mockResolvedValueOnce({
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        siteKey: "notice:new-api:https://second.example.com",
        status: "error",
        announcements: [],
        error: "provider failed",
      })
    getEnabledAccountsMock.mockResolvedValue([
      createAccount({ id: "account-1" }),
      createAccount({
        id: "account-2",
        site_url: "https://second.example.com",
      }),
    ])

    const response = await resolveSiteAnnouncementsCheckNowMessage({})

    if (response.success) {
      expect(response.data).toMatchObject({
        checked: 2,
        failed: 1,
        unsupported: 1,
        created: 0,
      })
    } else {
      expect.fail(response.error)
    }
  })

  it("records provider fetch failures and keeps checking remaining accounts", async () => {
    providerFetchMock
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        siteKey: "notice:new-api:https://second.example.com",
        status: "success",
        announcements: [{ content: "Recovered" }],
      })
    getEnabledAccountsMock.mockResolvedValue([
      createAccount({ id: "account-1" }),
      createAccount({
        id: "account-2",
        site_url: "https://second.example.com",
      }),
    ])

    const response = await resolveSiteAnnouncementsCheckNowMessage({})

    if (response.success) {
      expect(response.data).toMatchObject({
        checked: 2,
        failed: 1,
        created: 1,
      })
    } else {
      expect.fail(response.error)
    }
    await expect(siteAnnouncementStorage.getStatus()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          siteKey: "notice:new-api:https://example.com",
          status: "error",
          lastError: "timeout",
        }),
      ]),
    )
  })

  it("returns null when the outer account fetch fails", async () => {
    getEnabledAccountsMock.mockRejectedValueOnce(new Error("db unavailable"))

    const response = await resolveSiteAnnouncementsCheckNowMessage({})

    expect(response).toEqual({
      success: true,
      data: null,
    })
  })

  it("returns null immediately when a check is already in progress", async () => {
    ;(siteAnnouncementScheduler as any).isRunning = true

    const response = await resolveSiteAnnouncementsCheckNowMessage({})

    expect(response).toEqual({
      success: true,
      data: null,
    })
  })

  it("stores provider title and content without deriving a persisted summary", async () => {
    providerFetchMock.mockResolvedValue({
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      siteKey: "notice:new-api:https://example.com",
      status: "success",
      announcements: [{ content: "Only body text" }],
    })
    getEnabledAccountsMock.mockResolvedValue([createAccount()])

    const response = await resolveSiteAnnouncementsCheckNowMessage({})

    if (response.success) {
      expect(response.data?.records[0]).toMatchObject({
        title: "",
        content: "Only body text",
      })
      expect(response.data?.records[0]).not.toHaveProperty("summary")
    } else {
      expect.fail(response.error)
    }
  })

  it("syncs Sub2API upstream read state before marking the local record read", async () => {
    providerFetchMock.mockResolvedValue({
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api,
      siteKey: "sub2api:sub-1:https://sub.example.com",
      status: "success",
      announcements: [
        {
          id: "42",
          title: "Sub2API notice",
          content: "Body",
          fingerprint: "42",
        },
      ],
    })
    const account = createAccount({
      id: "sub-1",
      site_type: SITE_TYPES.SUB2API,
      site_url: "https://sub.example.com",
    })
    getEnabledAccountsMock.mockResolvedValue([account])
    getAccountByIdMock.mockResolvedValue(account)

    const checkResponse = await resolveSiteAnnouncementsCheckNowMessage({})

    if (!checkResponse.success) {
      expect.fail(checkResponse.error)
    }
    const recordId = checkResponse.data!.records[0]!.id
    const readResponse = await resolveSiteAnnouncementsMarkReadMessage({
      recordId,
    })

    expect(providerMarkReadMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "sub-1" }),
      [{ id: "42" }],
    )
    expect(readResponse).toEqual({ success: true })
  })

  it("stores notification errors without acknowledging upstream announcements when delivery fails", async () => {
    providerFetchMock.mockResolvedValue({
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      siteKey: "notice:new-api:https://example.com",
      status: "success",
      announcements: [{ content: "Only body text" }],
    })
    notifySiteAnnouncementsMock.mockResolvedValue({
      success: false,
      error: "notifications blocked",
    })
    getEnabledAccountsMock.mockResolvedValue([createAccount()])

    const response = await resolveSiteAnnouncementsCheckNowMessage({})

    if (response.success) {
      expect(response.data).toMatchObject({
        created: 1,
        notified: 0,
      })
    } else {
      expect.fail(response.error)
    }
    await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          notificationError: "notifications blocked",
        }),
      ]),
    )
    expect(providerMarkReadMock).not.toHaveBeenCalled()
  })

  it("skips upstream sync when mark-read targets an unknown local record", async () => {
    const response = await resolveSiteAnnouncementsMarkReadMessage({
      recordId: "missing-record",
    })

    expect(providerMarkReadMock).not.toHaveBeenCalled()
    expect(response).toEqual({
      success: false,
      error: "Failed to mark announcement as read",
    })
  })

  it("marks local Sub2API records read even when the backing account can no longer be loaded", async () => {
    await siteAnnouncementStorage.upsertDiscoveredRecords({
      site: {
        siteKey: "sub2api:sub-1:https://sub.example.com",
        siteName: "Sub",
        siteType: "sub2api",
        baseUrl: "https://sub.example.com",
        accountId: "sub-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api,
        status: "success",
      },
      records: [
        {
          siteKey: "sub2api:sub-1:https://sub.example.com",
          siteName: "Sub",
          siteType: "sub2api",
          baseUrl: "https://sub.example.com",
          accountId: "sub-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api,
          title: "Notice",
          content: "Body",
          fingerprint: "missing-account",
          upstreamId: "42",
        },
      ],
    })
    getAccountByIdMock.mockResolvedValueOnce(null)

    const [record] = await siteAnnouncementStorage.listRecords()
    const response = await resolveSiteAnnouncementsMarkReadMessage({
      recordId: record!.id,
    })

    expect(providerMarkReadMock).not.toHaveBeenCalled()
    expect(response).toEqual({ success: true })
  })

  it("resolves current status, records, and mark-all typed messages", async () => {
    await siteAnnouncementStorage.upsertDiscoveredRecords({
      site: {
        siteKey: "notice:new-api:https://example.com",
        siteName: "Example",
        siteType: "new-api",
        baseUrl: "https://example.com",
        accountId: "account-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: "success",
      },
      records: [
        {
          siteKey: "notice:new-api:https://example.com",
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.com",
          accountId: "account-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          title: "Notice",
          content: "Body",
          fingerprint: "status-record",
        },
      ],
    })

    const statusResponse = await resolveSiteAnnouncementsGetStatusMessage()
    expect(statusResponse).toMatchObject({
      success: true,
      data: [
        expect.objectContaining({
          siteKey: "notice:new-api:https://example.com",
        }),
      ],
    })

    const listResponse = await resolveSiteAnnouncementsListRecordsMessage()
    expect(listResponse).toMatchObject({
      success: true,
      data: [
        expect.objectContaining({
          fingerprint: "status-record",
        }),
      ],
    })

    const markAllResponse = await resolveSiteAnnouncementsMarkAllReadMessage({
      siteKey: "notice:new-api:https://example.com",
    })
    expect(markAllResponse).toEqual({
      success: true,
      data: 1,
    })
  })

  it("wires typed site announcement messages through registered listeners", async () => {
    await siteAnnouncementStorage.upsertDiscoveredRecords({
      site: {
        siteKey: "notice:new-api:https://example.com",
        siteName: "Example",
        siteType: "new-api",
        baseUrl: "https://example.com",
        accountId: "account-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: "success",
      },
      records: [
        {
          siteKey: "notice:new-api:https://example.com",
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.com",
          accountId: "account-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          title: "Notice",
          content: "Body",
          fingerprint: "listener-record",
        },
      ],
    })
    getEnabledAccountsMock.mockResolvedValue([createAccount()])
    providerFetchMock.mockResolvedValue({
      siteKey: "notice:new-api:https://example.com",
      status: "success",
      announcements: [{ title: "New", content: "Fresh body" }],
    })

    setupSiteAnnouncementsMessagingListeners()

    expect([...siteAnnouncementsMessageHandlers.keys()]).toEqual([
      SiteAnnouncementsMessageTypes.GetStatus,
      SiteAnnouncementsMessageTypes.ListRecords,
      SiteAnnouncementsMessageTypes.CheckNow,
      SiteAnnouncementsMessageTypes.MarkRead,
      SiteAnnouncementsMessageTypes.MarkAllRead,
      SiteAnnouncementsMessageTypes.UpdatePreferences,
    ])
    expect(onSiteAnnouncementsMessageMock).toHaveBeenCalledTimes(6)

    await expect(
      siteAnnouncementsMessageHandlers.get(
        SiteAnnouncementsMessageTypes.GetStatus,
      )?.({ data: {} }),
    ).resolves.toMatchObject({ success: true })
    await expect(
      siteAnnouncementsMessageHandlers.get(
        SiteAnnouncementsMessageTypes.ListRecords,
      )?.({ data: {} }),
    ).resolves.toMatchObject({ success: true })
    await expect(
      siteAnnouncementsMessageHandlers.get(
        SiteAnnouncementsMessageTypes.CheckNow,
      )?.({ data: { accountIds: ["account-1"] } }),
    ).resolves.toMatchObject({ success: true })
    await expect(
      siteAnnouncementsMessageHandlers.get(
        SiteAnnouncementsMessageTypes.MarkAllRead,
      )?.({ data: { siteKey: "notice:new-api:https://example.com" } }),
    ).resolves.toMatchObject({ success: true, data: expect.any(Number) })
    await expect(
      siteAnnouncementsMessageHandlers.get(
        SiteAnnouncementsMessageTypes.UpdatePreferences,
      )?.({ data: { settings: { enabled: false } } }),
    ).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({ enabled: false }),
    })
  })

  it("returns current status when schedule reconciliation fails", async () => {
    await siteAnnouncementStorage.upsertSiteStatus({
      siteKey: "notice:new-api:https://example.com",
      siteName: "Example",
      siteType: "new-api",
      baseUrl: "https://example.com",
      accountId: "account-1",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: "success",
    })
    getPreferencesMock.mockRejectedValueOnce(new Error("prefs failed"))

    const response = await resolveSiteAnnouncementsGetStatusMessage()

    expect(response).toMatchObject({
      success: true,
      data: [
        expect.objectContaining({
          siteKey: "notice:new-api:https://example.com",
        }),
      ],
    })
  })

  it("converts thrown message handler errors into error responses", async () => {
    vi.spyOn(siteAnnouncementStorage, "listRecords").mockRejectedValueOnce(
      new Error("boom"),
    )

    const response = await resolveSiteAnnouncementsListRecordsMessage()

    expect(response).toEqual({
      success: false,
      error: "boom",
    })
  })

  it("converts thrown site announcement resolver errors into failure responses", async () => {
    vi.spyOn(siteAnnouncementScheduler, "runManualCheck").mockRejectedValueOnce(
      new Error("check failed"),
    )
    await expect(resolveSiteAnnouncementsCheckNowMessage({})).resolves.toEqual({
      success: false,
      error: "check failed",
    })

    vi.spyOn(siteAnnouncementStorage, "markAllRead").mockRejectedValueOnce(
      new Error("mark all failed"),
    )
    await expect(
      resolveSiteAnnouncementsMarkAllReadMessage({
        siteKey: "notice:new-api:https://example.com",
      }),
    ).resolves.toEqual({
      success: false,
      error: "mark all failed",
    })

    vi.spyOn(siteAnnouncementScheduler, "updateSettings").mockRejectedValueOnce(
      new Error("preferences failed"),
    )
    await expect(
      resolveSiteAnnouncementsUpdatePreferencesMessage({
        settings: { enabled: true },
      }),
    ).resolves.toEqual({
      success: false,
      error: "preferences failed",
    })
  })
})
