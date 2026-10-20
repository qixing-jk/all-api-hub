import { renderHook as rtlRenderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useOptionsOverviewData } from "~/features/OptionsOverview/workspace/useOptionsOverviewData"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/storage/profiles"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { featureGuidanceState } from "~/services/featureGuidance/featureGuidanceState"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { siteAnnouncementStorage } from "~/services/siteAnnouncements/storage"
import { sendWebdavAutoSyncMessage } from "~/services/webdav/autoSync/webdavAutoSyncMessaging"
import { SiteHealthStatus } from "~/types"
import { accountStorageTestSurface as accountStorage } from "~~/tests/test-utils/accountStorageTestSurface"
import { buildAccountStats } from "~~/tests/test-utils/accountTodayStats"
import { buildCheckInConfig } from "~~/tests/test-utils/factories"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const { loggerErrorMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
}))

vi.mock("~/services/models/modelSync/messaging", () => ({
  sendModelSyncMessage: vi.fn(),
}))
vi.mock("~/services/webdav/autoSync/webdavAutoSyncMessaging", () => ({
  sendWebdavAutoSyncMessage: vi.fn(),
}))

vi.mock("~/utils/core/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/core/logger")>()
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: loggerErrorMock,
    })),
  }
})

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: {
    getAllAccounts: vi.fn(),
  },
}))

vi.mock("~/services/accounts/accountStorage/accountStatistics", () => ({
  accountStatistics: {
    getAccountStats: vi.fn(),
  },
}))

vi.mock("~/services/accounts/accountStorage/accountPresentation", () => ({
  accountPresentation: {
    convertToDisplayData: vi.fn(),
  },
}))

vi.mock("~/services/apiCredentialProfiles/storage/profiles", () => ({
  apiCredentialProfilesStorage: {
    listProfiles: vi.fn(),
  },
}))

vi.mock("~/services/checkin/autoCheckin/storage", () => ({
  autoCheckinStorage: {
    getStatus: vi.fn(),
  },
}))

vi.mock("~/services/history/usageHistory/storage", () => ({
  usageHistoryStorage: {
    getStore: vi.fn(),
  },
}))

vi.mock(
  "~/services/featureGuidance/featureGuidanceState",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/featureGuidance/featureGuidanceState")
      >()
    return {
      ...actual,
      featureGuidanceState: { getState: vi.fn() },
    }
  },
)

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()

  return {
    ...actual,
    userPreferences: {
      getPreferences: vi.fn(),
    },
  }
})

vi.mock("~/services/siteAnnouncements/storage", () => ({
  siteAnnouncementStorage: {
    listRecords: vi.fn(),
    getStatus: vi.fn(),
  },
}))

const account = {
  id: "account-1",
  site_name: "Relay",
  site_url: "https://relay.example.com",
  site_type: SITE_TYPES.NEW_API,
  disabled: false,
  checkIn: buildCheckInConfig(),
} as any

const displayAccount = {
  id: "account-1",
  name: "Relay",
  disabled: false,
  health: { status: SiteHealthStatus.Healthy },
} as any

const accountStats = buildAccountStats({
  total_quota: 0,
  today_total_consumption: 0,
  today_total_requests: 1,
  today_total_prompt_tokens: 2,
  today_total_completion_tokens: 3,
  today_total_income: 0,
})

const usageStore = {
  schemaVersion: 1 as const,
  accounts: {},
}

describe("useOptionsOverviewData", () => {
  it.each(["model", "webdav", "both"])(
    "finishes loading when %s status messages never respond",
    async (pending) => {
      mockSuccessfulLoad()
      vi.mocked(userPreferences.getPreferences).mockResolvedValue({
        ...DEFAULT_PREFERENCES,
        managedSiteType: SITE_TYPES.NEW_API,
        managedSiteModelSync: {
          ...DEFAULT_PREFERENCES.managedSiteModelSync!,
          enabled: true,
        },
        webdav: { ...DEFAULT_PREFERENCES.webdav, autoSync: true },
      })
      if (pending !== "webdav") {
        vi.mocked(sendModelSyncMessage).mockReturnValue(new Promise(() => {}))
      }
      if (pending !== "model") {
        vi.mocked(sendWebdavAutoSyncMessage).mockReturnValue(
          new Promise(() => {}),
        )
      }
      vi.useFakeTimers()
      try {
        const { result, unmount } = renderHook(() => useOptionsOverviewData(), {
          withReleaseUpdateStatusProvider: false,
          withThemeProvider: false,
          withUserPreferencesProvider: false,
        })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000)
        })
        expect(result.current.isLoading).toBe(false)
        expect(result.current.viewModel?.usageSnapshot.todayRequests).toBe(1)
        const items = result.current.viewModel!.automationOverview.items
        expect(
          items.find((item) => item.id === "managedSiteModelSync")?.statusLabel,
        ).toBe(pending === "webdav" ? "not_run" : "unknown")
        expect(
          items.find((item) => item.id === "webdavAutoSync")?.statusLabel,
        ).toBe(pending === "model" ? "not_run" : "unknown")
        unmount()
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it("keeps failed status reads unknown while preserving the rest of the overview", async () => {
    mockSuccessfulLoad()
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      managedSiteType: SITE_TYPES.NEW_API,
      managedSiteModelSync: {
        ...DEFAULT_PREFERENCES.managedSiteModelSync!,
        enabled: true,
      },
      webdav: { ...DEFAULT_PREFERENCES.webdav, autoSync: true },
    })
    vi.mocked(autoCheckinStorage.getStatus).mockRejectedValueOnce(
      new Error("unavailable"),
    )
    vi.mocked(siteAnnouncementStorage.getStatus).mockRejectedValueOnce(
      new Error("unavailable"),
    )
    vi.mocked(sendModelSyncMessage).mockResolvedValueOnce({
      success: false,
      error: "unavailable",
    })
    vi.mocked(sendWebdavAutoSyncMessage).mockRejectedValueOnce(
      new Error("unavailable"),
    )
    const { result } = renderHook(() => useOptionsOverviewData(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(
      result.current.viewModel!.automationOverview.items.map((item) => [
        item.id,
        item.status,
        item.statusLabel,
      ]),
    ).toEqual([
      ["autoCheckin", "info", "unknown"],
      ["siteAnnouncements", "info", "unknown"],
      ["managedSiteModelSync", "info", "unknown"],
      ["webdavAutoSync", "info", "unknown"],
    ])
  })

  it("loads sync outcomes into the overview without triggering a sync", async () => {
    mockSuccessfulLoad()
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      managedSiteType: SITE_TYPES.NEW_API,
      managedSiteModelSync: {
        ...DEFAULT_PREFERENCES.managedSiteModelSync!,
        enabled: true,
      },
      webdav: { ...DEFAULT_PREFERENCES.webdav, autoSync: true },
    })
    vi.mocked(sendModelSyncMessage).mockResolvedValue({
      success: true,
      data: {
        items: [],
        statistics: {
          total: 1,
          successCount: 0,
          failureCount: 1,
          durationMs: 1,
          startedAt: 1,
          endedAt: 2,
        },
      },
    })
    vi.mocked(sendWebdavAutoSyncMessage).mockResolvedValue({
      success: true,
      data: {
        isRunning: true,
        isInitialized: true,
        isSyncing: false,
        lastSyncTime: 2,
        lastSyncStatus: "error",
        lastSyncError: "offline",
      },
    })
    const { result } = renderHook(() => useOptionsOverviewData(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const items = result.current.viewModel!.automationOverview.items
    expect(
      items.find((item) => item.id === "managedSiteModelSync"),
    ).toMatchObject({ status: "error", statusLabel: "failed" })
    expect(items.find((item) => item.id === "webdavAutoSync")).toMatchObject({
      status: "error",
      statusLabel: "failed",
    })
    expect(sendModelSyncMessage).toHaveBeenCalledWith(
      "modelSync:getLastExecution",
    )
    expect(sendWebdavAutoSyncMessage).toHaveBeenCalledWith(
      "webdavAutoSync:getStatus",
    )
  })
  it("retranslates partial-load feedback without reloading local stores or replacing the view model", async () => {
    mockSuccessfulLoad()
    vi.mocked(accountStorage.getAllAccounts).mockRejectedValueOnce(
      new Error("offline"),
    )
    const i18n = await createResourceTestI18n({
      en: {
        optionsOverview: (await import("~/locales/en/optionsOverview.json"))
          .default,
      },
      "zh-CN": {
        optionsOverview: (await import("~/locales/zh-CN/optionsOverview.json"))
          .default,
      },
    })
    const { result } = rtlRenderHook(() => useOptionsOverviewData(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      ),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const viewModel = result.current.viewModel
    const calls = vi.mocked(accountStorage.getAllAccounts).mock.calls.length
    await act(async () => {
      await i18n.changeLanguage("zh-CN")
    })
    expect(result.current.error).toBe(
      i18n.t("optionsOverview:states.loadDetailUnavailable"),
    )
    expect(result.current.viewModel).toBe(viewModel)
    expect(accountStorage.getAllAccounts).toHaveBeenCalledTimes(calls)
  })
  it("loads the overview view model from local stores and reloads on demand", async () => {
    mockSuccessfulLoad()

    const { result } = renderHook(() => useOptionsOverviewData(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.viewModel?.usageSnapshot).toMatchObject({
      todayRequests: 1,
      todayTokens: 5,
      hasUsageData: true,
    })
    expect(accountStorage.convertToDisplayData).toHaveBeenCalledWith([account])

    act(() => {
      result.current.reload()
    })

    await waitFor(() => {
      expect(accountStorage.getAllAccounts).toHaveBeenCalledTimes(2)
    })
  })

  it("keeps available overview data but withholds guidance when source inventory fails", async () => {
    mockSuccessfulLoad()
    vi.mocked(accountStorage.getAllAccounts).mockRejectedValueOnce(
      new Error("storage unavailable"),
    )

    const { result } = renderHook(() => useOptionsOverviewData(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe(
      "optionsOverview:states.loadDetailUnavailable",
    )
    expect(result.current.viewModel).not.toBeNull()
    expect(result.current.viewModel?.usageSnapshot).toMatchObject({
      todayRequests: 1,
      todayTokens: 5,
      hasUsageData: true,
    })
    expect(result.current.viewModel?.unifiedApiGuidance).toBeNull()
    expect(
      result.current.viewModel?.statusCards.find(
        (card) => card.id === "accounts",
      )?.value,
    ).toBe("-")
    expect(
      result.current.viewModel?.attentionItems.some(
        (item) => item.kind === "addAccount",
      ),
    ).toBe(false)
  })

  it("reports rejected sources without logging or displaying their raw reasons", async () => {
    mockSuccessfulLoad()
    const sensitiveReason = "secret-token-should-not-leak"
    const accountsFailure = new Error(sensitiveReason)
    const preferencesFailure = new Error(`preferences ${sensitiveReason}`)
    vi.mocked(accountStorage.getAllAccounts).mockRejectedValueOnce(
      accountsFailure,
    )
    vi.mocked(userPreferences.getPreferences).mockRejectedValueOnce(
      preferencesFailure,
    )

    const { result } = renderHook(() => useOptionsOverviewData(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe(
      "optionsOverview:states.loadDetailUnavailable",
    )
    expect(result.current.viewModel).not.toBeNull()
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Some options overview data failed to load",
      {
        failures: [
          { source: "accounts", status: "rejected" },
          { source: "preferences", status: "rejected" },
        ],
      },
    )
    expect(JSON.stringify(loggerErrorMock.mock.calls)).not.toContain(
      sensitiveReason,
    )
  })

  it("keeps the overview unavailable when every local data source fails", async () => {
    mockSuccessfulLoad()
    const failure = new Error("local storage unavailable")
    vi.mocked(accountStorage.getAllAccounts).mockRejectedValueOnce(failure)
    vi.mocked(accountStorage.getAccountStats).mockRejectedValueOnce(failure)
    vi.mocked(usageHistoryStorage.getStore).mockRejectedValueOnce(failure)
    vi.mocked(apiCredentialProfilesStorage.listProfiles).mockRejectedValueOnce(
      failure,
    )
    vi.mocked(userPreferences.getPreferences).mockRejectedValueOnce(failure)
    vi.mocked(featureGuidanceState.getState).mockRejectedValueOnce(failure)
    vi.mocked(autoCheckinStorage.getStatus).mockRejectedValueOnce(failure)
    vi.mocked(siteAnnouncementStorage.listRecords).mockRejectedValueOnce(
      failure,
    )
    vi.mocked(siteAnnouncementStorage.getStatus).mockRejectedValueOnce(failure)

    const { result } = renderHook(() => useOptionsOverviewData(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe(
      "optionsOverview:states.loadDetailUnavailable",
    )
    expect(result.current.viewModel).toBeNull()
  })
})

function mockSuccessfulLoad() {
  vi.clearAllMocks()
  vi.mocked(sendModelSyncMessage).mockResolvedValue({
    success: true,
    data: null,
  })
  vi.mocked(sendWebdavAutoSyncMessage).mockResolvedValue({
    success: true,
    data: {
      isRunning: false,
      isInitialized: true,
      isSyncing: false,
      lastSyncTime: 0,
      lastSyncStatus: "idle",
      lastSyncError: null,
    },
  })
  vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([account])
  vi.mocked(accountStorage.getAccountStats).mockResolvedValue(accountStats)
  vi.mocked(featureGuidanceState.getState).mockResolvedValue({
    schemaVersion: 1,
    productTour: {},
    gatewayGuidance: { dismissedAtBySurface: {} },
  })
  vi.mocked(accountStorage.convertToDisplayData).mockReturnValue([
    displayAccount,
  ])
  vi.mocked(apiCredentialProfilesStorage.listProfiles).mockResolvedValue([])
  vi.mocked(usageHistoryStorage.getStore).mockResolvedValue(usageStore)
  vi.mocked(userPreferences.getPreferences).mockResolvedValue({
    ...DEFAULT_PREFERENCES,
    managedSiteType: SITE_TYPES.NEW_API,
  })
  vi.mocked(autoCheckinStorage.getStatus).mockResolvedValue(null)
  vi.mocked(siteAnnouncementStorage.listRecords).mockResolvedValue([])
  vi.mocked(siteAnnouncementStorage.getStatus).mockResolvedValue([])
}
