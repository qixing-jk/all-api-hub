import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS,
  validateAndSaveAccount,
  validateAndUpdateAccount,
} from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { AuthTypeEnum, SiteHealthStatus, type CheckInConfig } from "~/types"

const { fetchAccountDataMock, ensureDefaultApiTokenForAccountMock } =
  vi.hoisted(() => ({
    fetchAccountDataMock: vi.fn(),
    ensureDefaultApiTokenForAccountMock: vi.fn(),
  }))

vi.mock("react-hot-toast", () => ({
  default: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    fetchAccountData: fetchAccountDataMock,
  })),
}))

vi.mock(
  "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken",
  () => ({
    ensureDefaultApiTokenForAccount: ensureDefaultApiTokenForAccountMock,
    generateDefaultTokenRequest: vi.fn(() => ({
      name: "user group (auto)",
      unlimited_quota: true,
      expired_time: -1,
      remain_quota: 0,
      allow_ips: "",
      model_limits_enabled: false,
      model_limits: "",
      group: "",
    })),
  }),
)

const CHECK_IN_DISABLED: CheckInConfig = {
  enableDetection: false,
  autoCheckInEnabled: true,
  siteStatus: { isCheckedInToday: false },
  customCheckIn: {
    url: "",
    redeemUrl: "",
    openRedeemWithCheckIn: true,
    isCheckedInToday: false,
  },
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("accountOperations validateAndSaveAccount", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await accountStorage.clearAllData()

    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: false,
      showTodayCashflow: false,
    })
  })

  it("persists normalized cookie auth, tag ids, and refreshed metrics on success", async () => {
    fetchAccountDataMock.mockResolvedValueOnce({
      quota: 321,
      today_prompt_tokens: 11,
      today_completion_tokens: 22,
      today_quota_consumption: 33,
      today_requests_count: 44,
      today_income: 55,
      checkIn: CHECK_IN_DISABLED,
    })

    const result = await validateAndSaveAccount(
      " https://cookie.example.com/console ",
      " Cookie Portal ",
      " cookie-user ",
      "",
      " 42 ",
      "7.0",
      "notes",
      [" alpha ", "", "beta", "alpha", " beta "],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.Cookie,
      "Cookie: foo=1; session=abc123; theme=dark",
    )

    expect(result.success).toBe(true)
    expect(result.accountId).toBeTruthy()
    expect(result.feedbackLevel).toBe("success")

    const saved = await accountStorage.getAccountById(result.accountId!)
    expect(saved).not.toBeNull()
    expect(saved).toMatchObject({
      site_name: "Cookie Portal",
      site_url: "https://cookie.example.com/console",
      authType: AuthTypeEnum.Cookie,
      tagIds: ["alpha", "beta"],
      cookieAuth: { sessionCookie: "session=abc123" },
      health: { status: SiteHealthStatus.Healthy },
      account_info: {
        id: 42,
        username: "cookie-user",
        quota: 321,
      },
    })
    expect(fetchAccountDataMock).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com/console",
      checkIn: CHECK_IN_DISABLED,
      accountId: undefined,
      includeTodayCashflow: false,
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: 42,
        accessToken: "",
        cookie: "session=abc123",
      },
    })
    expect(ensureDefaultApiTokenForAccountMock).not.toHaveBeenCalled()
  })

  it("stores AIHubMix accounts with the canonical console origin", async () => {
    fetchAccountDataMock.mockResolvedValueOnce({
      quota: 100,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
      checkIn: CHECK_IN_DISABLED,
    })

    const result = await validateAndSaveAccount(
      "https://aihubmix.com/statistics?tab=detail",
      "AIHubMix",
      "aihubmix-user",
      "access-token",
      "11",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.AIHUBMIX,
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    const saved = await accountStorage.getAccountById(result.accountId!)
    expect(saved?.site_url).toBe("https://console.aihubmix.com")
    expect(fetchAccountDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://aihubmix.com/statistics?tab=detail",
      }),
    )
  })

  it("updates AIHubMix accounts with the canonical console origin", async () => {
    const accountId = await accountStorage.addAccount({
      site_name: "AIHubMix",
      site_url: "https://aihubmix.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.AIHUBMIX,
      exchange_rate: 7,
      account_info: {
        id: 11,
        access_token: "old-access-token",
        username: "aihubmix-user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: 0,
      notes: "",
      tagIds: [],
      disabled: false,
      excludeFromTotalBalance: false,
      authType: AuthTypeEnum.AccessToken,
      checkIn: CHECK_IN_DISABLED,
    })

    fetchAccountDataMock.mockResolvedValueOnce({
      quota: 100,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
      checkIn: CHECK_IN_DISABLED,
    })

    const result = await validateAndUpdateAccount(
      accountId,
      "https://aihubmix.com/statistics?tab=detail",
      "AIHubMix",
      "aihubmix-user",
      "access-token",
      "11",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.AIHUBMIX,
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    const saved = await accountStorage.getAccountById(accountId)
    expect(saved?.site_url).toBe("https://console.aihubmix.com")
    expect(fetchAccountDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://aihubmix.com/statistics?tab=detail",
      }),
    )
  })

  it("saves a warning-only Sub2API account when remote data refresh fails", async () => {
    fetchAccountDataMock.mockRejectedValueOnce(new Error("quota fetch failed"))

    const result = await validateAndSaveAccount(
      "https://sub2.example.com",
      " Sub2 Portal ",
      "",
      " access-123 ",
      " 7 ",
      "7.0",
      "",
      [" group-a ", "", "group-b", "group-a"],
      CHECK_IN_DISABLED,
      SITE_TYPES.SUB2API,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      true,
      {
        refreshToken: " refresh-token ",
        tokenExpiresAt: 0,
      },
    )

    expect(result).toMatchObject({
      success: true,
      message: "messages:warnings.accountSavedWithoutDataRefresh",
      feedbackLevel: "warning",
    })

    const saved = await accountStorage.getAccountById(result.accountId!)
    expect(saved).not.toBeNull()
    expect(saved).toMatchObject({
      site_name: "Sub2 Portal",
      site_type: SITE_TYPES.SUB2API,
      excludeFromTotalBalance: true,
      tagIds: ["group-a", "group-b"],
      sub2apiAuth: { refreshToken: "refresh-token" },
      health: {
        status: SiteHealthStatus.Warning,
        reason: "quota fetch failed",
      },
      account_info: {
        id: 7,
        username: "",
        access_token: "access-123",
        quota: 0,
      },
    })
  })

  it("normalizes unsupported site types before saving", async () => {
    const { getApiService } = await import("~/services/apiService")
    fetchAccountDataMock.mockResolvedValueOnce({
      quota: 12,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
      checkIn: CHECK_IN_DISABLED,
    })

    const result = await validateAndSaveAccount(
      "https://legacy.example.com",
      "Legacy Site",
      "legacy-user",
      "token",
      "5",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "legacy-invalid-site",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)
    expect(getApiService).toHaveBeenCalledWith(SITE_TYPES.UNKNOWN)

    const saved = await accountStorage.getAccountById(result.accountId!)
    expect(saved?.site_type).toBe(SITE_TYPES.UNKNOWN)
  })

  it("falls back to partial save when manual-add data refresh times out", async () => {
    vi.useFakeTimers()
    fetchAccountDataMock.mockImplementationOnce(
      () => new Promise(() => undefined),
    )

    try {
      const resultPromise = validateAndSaveAccount(
        "https://api.example.com",
        "Test Site",
        "tester",
        "token",
        "1",
        "7.0",
        "",
        [],
        CHECK_IN_DISABLED,
        "unknown",
        AuthTypeEnum.AccessToken,
        "",
      )

      await vi.advanceTimersByTimeAsync(
        MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS + 1,
      )

      const result = await resultPromise

      expect(result).toMatchObject({
        success: true,
        message: "messages:warnings.accountSavedWithoutDataRefresh",
        feedbackLevel: "warning",
      })

      const saved = await accountStorage.getAccountById(result.accountId!)
      expect(saved).not.toBeNull()
      expect(saved).toMatchObject({
        health: {
          status: SiteHealthStatus.Warning,
          reason: "messages:errors.operation.accountDataFetchTimeout",
        },
        account_info: {
          id: 1,
          username: "tester",
          access_token: "token",
          quota: 0,
        },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("returns a stable save failure when the fallback persistence also fails", async () => {
    fetchAccountDataMock.mockRejectedValueOnce(new Error("quota fetch failed"))
    const addAccountSpy = vi
      .spyOn(accountStorage, "addAccount")
      .mockRejectedValueOnce(new Error("disk full"))

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result).toEqual({
      success: false,
      message: "messages:errors.operation.saveFailed",
    })
    expect(addAccountSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        health: expect.objectContaining({
          status: SiteHealthStatus.Warning,
          reason: "quota fetch failed",
        }),
      }),
    )
  })

  it("rejects non-numeric user ids before fetching remote data", async () => {
    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "token",
      "not-a-number",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result).toEqual({
      success: false,
      message: "messages:errors.validation.userIdNumeric",
    })
    expect(fetchAccountDataMock).not.toHaveBeenCalled()
  })

  it("skips background auto-provisioning after refreshed save when requested by a foreground workflow", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValueOnce({
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: true,
      showTodayCashflow: false,
    })
    fetchAccountDataMock.mockResolvedValueOnce({
      quota: 12,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
      checkIn: CHECK_IN_DISABLED,
    })

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Example",
      "user",
      "token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      undefined,
      { skipAutoProvisionKeyOnAccountAdd: true },
    )

    expect(result.success).toBe(true)
    await flushMicrotasks()
    expect(ensureDefaultApiTokenForAccountMock).not.toHaveBeenCalled()
  })

  it("skips background auto-provisioning after fallback save when requested by a foreground workflow", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValueOnce({
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: true,
      showTodayCashflow: false,
    })
    fetchAccountDataMock.mockRejectedValueOnce(new Error("quota fetch failed"))

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Example",
      "user",
      "token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      undefined,
      { skipAutoProvisionKeyOnAccountAdd: true },
    )

    expect(result).toMatchObject({
      success: true,
      message: "messages:warnings.accountSavedWithoutDataRefresh",
      feedbackLevel: "warning",
    })
    await flushMicrotasks()
    expect(ensureDefaultApiTokenForAccountMock).not.toHaveBeenCalled()
  })

  it("runs background auto-provisioning after save when preference is enabled", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValueOnce({
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: true,
      showTodayCashflow: false,
    })
    fetchAccountDataMock.mockResolvedValueOnce({
      quota: 12,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
      checkIn: CHECK_IN_DISABLED,
    })
    ensureDefaultApiTokenForAccountMock.mockResolvedValueOnce({
      created: true,
    })

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Example",
      "user",
      "token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)
    await flushMicrotasks()
    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledTimes(1)
    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({
          site_name: "Example",
        }),
        displaySiteData: expect.objectContaining({
          name: "Example",
          baseUrl: "https://api.example.com",
        }),
      }),
    )
  })
})
