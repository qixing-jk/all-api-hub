import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useOptionsOverviewData } from "~/features/OptionsOverview/useOptionsOverviewData"
import { accountStorage } from "~/services/accounts/accountStorage"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { siteAnnouncementStorage } from "~/services/siteAnnouncements/storage"
import { SiteHealthStatus } from "~/types"
import { buildAccountStats } from "~~/tests/test-utils/accountTodayStats"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const { loggerErrorMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
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

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAllAccounts: vi.fn(),
    getAccountStats: vi.fn(),
    convertToDisplayData: vi.fn(),
  },
}))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      listProfiles: vi.fn(),
    },
  }),
)

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
  vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([account])
  vi.mocked(accountStorage.getAccountStats).mockResolvedValue(accountStats)
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
