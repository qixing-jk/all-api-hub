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
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

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

const accountStats = {
  total_quota: 0,
  today_total_consumption: 0,
  today_total_requests: 1,
  today_total_prompt_tokens: 2,
  today_total_completion_tokens: 3,
  today_total_income: 0,
}

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

  it("captures store failures without replacing the previous loading state forever", async () => {
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

    expect(result.current.error).toBe("storage unavailable")
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
