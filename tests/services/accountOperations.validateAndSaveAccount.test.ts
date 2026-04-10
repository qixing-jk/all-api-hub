import { beforeEach, describe, expect, it, vi } from "vitest"

import { SUB2API } from "~/constants/siteType"
import {
  MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS,
  validateAndSaveAccount,
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
  getApiService: () => ({
    fetchAccountData: fetchAccountDataMock,
  }),
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
      SUB2API,
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
      site_type: SUB2API,
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
})
