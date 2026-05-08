import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
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
  hasAlarmsAPI: () => true,
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
  beforeEach(() => {
    vi.clearAllMocks()
    ;(siteAnnouncementScheduler as any).isInitialized = false
    ;(siteAnnouncementScheduler as any).isRunning = false
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
})
