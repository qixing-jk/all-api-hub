import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  handleSiteAnnouncementMessage,
  siteAnnouncementScheduler,
} from "~/services/siteAnnouncements/scheduler"
import { siteAnnouncementStorage } from "~/services/siteAnnouncements/storage"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { SITE_ANNOUNCEMENT_PROVIDER_IDS } from "~/types/siteAnnouncements"

const {
  clearAlarmMock,
  createAlarmMock,
  getEnabledAccountsMock,
  getAccountByIdMock,
  hasAlarmsAPIMock,
  getPreferencesMock,
  notifySiteAnnouncementsMock,
  onAlarmMock,
  providerFetchMock,
  providerMarkReadMock,
  savePreferencesMock,
} = vi.hoisted(() => ({
  clearAlarmMock: vi.fn(),
  createAlarmMock: vi.fn(),
  getEnabledAccountsMock: vi.fn(),
  getAccountByIdMock: vi.fn(),
  hasAlarmsAPIMock: vi.fn(() => true),
  getPreferencesMock: vi.fn(),
  notifySiteAnnouncementsMock: vi.fn(),
  onAlarmMock: vi.fn(),
  providerFetchMock: vi.fn(),
  providerMarkReadMock: vi.fn(),
  savePreferencesMock: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
  clearAlarm: clearAlarmMock,
  createAlarm: createAlarmMock,
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
      id: 1,
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

    await handleSiteAnnouncementMessage(
      {
        action: RuntimeActionIds.SiteAnnouncementsUpdatePreferences,
        settings: { enabled: false },
      },
      vi.fn(),
    )

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

    await alarmHandler?.({ name: "siteAnnouncementsCheck" })

    expect(getEnabledAccountsMock).not.toHaveBeenCalled()
    expect(providerFetchMock).not.toHaveBeenCalled()
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

    const response = vi.fn()
    await handleSiteAnnouncementMessage(
      {
        action: RuntimeActionIds.SiteAnnouncementsCheckNow,
        accountIds: ["enabled", "missing", "disabled"],
      },
      response,
    )

    expect(providerFetchMock).toHaveBeenCalledTimes(1)
    expect(response.mock.calls[0][0].data).toMatchObject({
      checked: 1,
      created: 0,
      failed: 0,
      unsupported: 0,
    })
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
        site_type: "sub2api",
        site_url: "https://sub.example.com",
      }),
      createAccount({
        id: "sub-2",
        site_type: "sub2api",
        site_url: "https://sub.example.com",
      }),
    ])

    const response = vi.fn()
    await handleSiteAnnouncementMessage(
      { action: RuntimeActionIds.SiteAnnouncementsCheckNow },
      response,
    )

    expect(providerFetchMock).toHaveBeenCalledTimes(3)
    expect(response.mock.calls[0][0].data).toMatchObject({
      checked: 3,
      created: 3,
      notified: 3,
    })
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

    const response = vi.fn()
    await handleSiteAnnouncementMessage(
      { action: RuntimeActionIds.SiteAnnouncementsCheckNow },
      response,
    )

    expect(response.mock.calls[0][0].data).toMatchObject({
      checked: 2,
      failed: 1,
      unsupported: 1,
      created: 0,
    })
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

    const response = vi.fn()
    await handleSiteAnnouncementMessage(
      { action: RuntimeActionIds.SiteAnnouncementsCheckNow },
      response,
    )

    expect(response.mock.calls[0][0].data).toMatchObject({
      checked: 2,
      failed: 1,
      created: 1,
    })
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

    const response = vi.fn()
    await handleSiteAnnouncementMessage(
      { action: RuntimeActionIds.SiteAnnouncementsCheckNow },
      response,
    )

    expect(response).toHaveBeenCalledWith({
      success: true,
      data: null,
    })
  })

  it("returns null immediately when a check is already in progress", async () => {
    ;(siteAnnouncementScheduler as any).isRunning = true

    const response = vi.fn()
    await handleSiteAnnouncementMessage(
      { action: RuntimeActionIds.SiteAnnouncementsCheckNow },
      response,
    )

    expect(response).toHaveBeenCalledWith({
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

    const response = vi.fn()
    await handleSiteAnnouncementMessage(
      { action: RuntimeActionIds.SiteAnnouncementsCheckNow },
      response,
    )

    expect(response.mock.calls[0][0].data.records[0]).toMatchObject({
      title: "",
      content: "Only body text",
    })
    expect(response.mock.calls[0][0].data.records[0]).not.toHaveProperty(
      "summary",
    )
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
      site_type: "sub2api",
      site_url: "https://sub.example.com",
    })
    getEnabledAccountsMock.mockResolvedValue([account])
    getAccountByIdMock.mockResolvedValue(account)

    const checkResponse = vi.fn()
    await handleSiteAnnouncementMessage(
      { action: RuntimeActionIds.SiteAnnouncementsCheckNow },
      checkResponse,
    )

    const recordId = checkResponse.mock.calls[0][0].data.records[0].id
    const readResponse = vi.fn()
    await handleSiteAnnouncementMessage(
      { action: RuntimeActionIds.SiteAnnouncementsMarkRead, recordId },
      readResponse,
    )

    expect(providerMarkReadMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "sub-1" }),
      [{ id: "42" }],
    )
    expect(readResponse).toHaveBeenCalledWith({ success: true })
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

    const response = vi.fn()
    await handleSiteAnnouncementMessage(
      { action: RuntimeActionIds.SiteAnnouncementsCheckNow },
      response,
    )

    expect(response.mock.calls[0][0].data).toMatchObject({
      created: 1,
      notified: 0,
    })
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
    const response = vi.fn()
    await handleSiteAnnouncementMessage(
      {
        action: RuntimeActionIds.SiteAnnouncementsMarkRead,
        recordId: "missing-record",
      },
      response,
    )

    expect(providerMarkReadMock).not.toHaveBeenCalled()
    expect(response).toHaveBeenCalledWith({ success: false })
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
    const response = vi.fn()
    await handleSiteAnnouncementMessage(
      {
        action: RuntimeActionIds.SiteAnnouncementsMarkRead,
        recordId: record!.id,
      },
      response,
    )

    expect(providerMarkReadMock).not.toHaveBeenCalled()
    expect(response).toHaveBeenCalledWith({ success: true })
  })

  it("returns current status, records, mark-all counts, and unknown-action errors", async () => {
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

    const statusResponse = vi.fn()
    await handleSiteAnnouncementMessage(
      { action: RuntimeActionIds.SiteAnnouncementsGetStatus },
      statusResponse,
    )
    expect(statusResponse.mock.calls[0][0]).toMatchObject({
      success: true,
      data: [
        expect.objectContaining({
          siteKey: "notice:new-api:https://example.com",
        }),
      ],
    })

    const listResponse = vi.fn()
    await handleSiteAnnouncementMessage(
      { action: RuntimeActionIds.SiteAnnouncementsListRecords },
      listResponse,
    )
    expect(listResponse.mock.calls[0][0]).toMatchObject({
      success: true,
      data: [
        expect.objectContaining({
          fingerprint: "status-record",
        }),
      ],
    })

    const markAllResponse = vi.fn()
    await handleSiteAnnouncementMessage(
      {
        action: RuntimeActionIds.SiteAnnouncementsMarkAllRead,
        siteKey: "notice:new-api:https://example.com",
      },
      markAllResponse,
    )
    expect(markAllResponse).toHaveBeenCalledWith({
      success: true,
      data: 1,
    })

    const unknownResponse = vi.fn()
    await handleSiteAnnouncementMessage(
      { action: "siteAnnouncements:unknown" },
      unknownResponse,
    )
    expect(unknownResponse).toHaveBeenCalledWith({
      success: false,
      error: "Unknown action",
    })
  })

  it("converts thrown message handler errors into error responses", async () => {
    vi.spyOn(siteAnnouncementStorage, "listRecords").mockRejectedValueOnce(
      new Error("boom"),
    )

    const response = vi.fn()
    await handleSiteAnnouncementMessage(
      { action: RuntimeActionIds.SiteAnnouncementsListRecords },
      response,
    )

    expect(response).toHaveBeenCalledWith({
      success: false,
      error: "boom",
    })
  })
})
