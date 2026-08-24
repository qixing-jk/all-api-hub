import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS,
  validateAndSaveAccount,
  validateAndUpdateAccount,
} from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import { OpenRouterManagementKeyRequiredError } from "~/services/apiService/openrouter/errors"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import {
  buildCompleteTodayStatsAvailability,
  buildTodayStatsAvailabilityReplacementCases,
} from "~~/tests/test-utils/accountTodayStats"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const {
  fetchAccountDataMock,
  getSiteTypeCapabilitiesMock,
  ensureDefaultApiTokenForAccountMock,
  loggerMock,
  otherLoggerMock,
  validateManagementKeyMock,
} = vi.hoisted(() => ({
  fetchAccountDataMock: vi.fn(),
  getSiteTypeCapabilitiesMock: vi.fn(),
  ensureDefaultApiTokenForAccountMock: vi.fn(),
  loggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  otherLoggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  validateManagementKeyMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: getSiteTypeCapabilitiesMock,
}))

vi.mock("~/services/apiService/openrouter", () => ({
  validateManagementKey: validateManagementKeyMock,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: (scope: string) =>
    scope === "AccountOperations" ? loggerMock : otherLoggerMock,
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

const CHECK_IN_DISABLED = buildCheckInConfig({
  customCheckIn: {
    url: "",
    redeemUrl: "",
    openRedeemWithCheckIn: true,
    isCheckedInToday: false,
  },
})

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const availabilityReplacementCases =
  buildTodayStatsAvailabilityReplacementCases()

const addAccountWithOldTodayAvailability = () =>
  accountStorage.addAccount({
    site_name: "Old Example",
    site_url: "https://old.example.invalid",
    site_type: SITE_TYPES.NEW_API,
    health: { status: SiteHealthStatus.Healthy },
    authType: AuthTypeEnum.AccessToken,
    disabled: false,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
    exchange_rate: 7,
    notes: "",
    tagIds: [],
    checkIn: CHECK_IN_DISABLED,
    account_info: {
      id: "previous-id",
      access_token: "old-token",
      username: "old-user",
      quota: 42,
      today_prompt_tokens: 1,
      today_completion_tokens: 2,
      today_quota_consumption: 3,
      today_requests_count: 4,
      today_income: 5,
      todayStatsAvailability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
        },
      }),
    },
    last_sync_time: 123,
  })

const updateAccountFromRemote = (accountId: string) =>
  validateAndUpdateAccount(
    accountId,
    "https://api.example.invalid",
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

const LOG_TEST_ACCOUNT_DATA = {
  quota: 100,
  today_prompt_tokens: 1,
  today_completion_tokens: 2,
  today_quota_consumption: 3,
  today_requests_count: 4,
  today_income: 5,
  checkIn: CHECK_IN_DISABLED,
}

const saveAccountForLogTest = (
  siteType: typeof SITE_TYPES.NEW_API | typeof SITE_TYPES.OPENROUTER,
  deferDataRefresh: boolean,
) =>
  validateAndSaveAccount(
    siteType === SITE_TYPES.OPENROUTER
      ? "https://openrouter.ai/private-path"
      : "https://api.example.invalid/private-path",
    siteType === SITE_TYPES.OPENROUTER
      ? " Private OpenRouter Label "
      : " Ordinary Example ",
    siteType === SITE_TYPES.OPENROUTER ? "private-user" : "ordinary-user",
    siteType === SITE_TYPES.OPENROUTER
      ? "private-management-key"
      : "ordinary-token",
    siteType === SITE_TYPES.OPENROUTER ? "private-editable-id" : "ordinary-id",
    "7",
    "",
    [],
    CHECK_IN_DISABLED,
    siteType,
    AuthTypeEnum.AccessToken,
    "",
    undefined,
    false,
    false,
    undefined,
    { deferDataRefresh },
  )

const addStoredAccountForLogTest = (
  siteType: typeof SITE_TYPES.NEW_API | typeof SITE_TYPES.OPENROUTER,
) =>
  accountStorage.addAccount({
    site_name:
      siteType === SITE_TYPES.OPENROUTER ? "OpenRouter" : "Old Example",
    site_url:
      siteType === SITE_TYPES.OPENROUTER
        ? "https://openrouter.ai"
        : "https://api.example.invalid",
    site_type: siteType,
    health: { status: SiteHealthStatus.Healthy },
    authType: AuthTypeEnum.AccessToken,
    disabled: false,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
    exchange_rate: 7,
    notes: "",
    tagIds: [],
    checkIn: CHECK_IN_DISABLED,
    account_info: {
      id:
        siteType === SITE_TYPES.OPENROUTER
          ? "private-existing-id"
          : "ordinary-id",
      access_token:
        siteType === SITE_TYPES.OPENROUTER
          ? "private-management-key"
          : "ordinary-token",
      username:
        siteType === SITE_TYPES.OPENROUTER ? "private-user" : "ordinary-user",
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    last_sync_time: 0,
  })

const updateAccountForLogTest = (
  accountId: string,
  siteType: typeof SITE_TYPES.NEW_API | typeof SITE_TYPES.OPENROUTER,
  deferDataRefresh: boolean,
) =>
  validateAndUpdateAccount(
    accountId,
    siteType === SITE_TYPES.OPENROUTER
      ? "https://openrouter.ai/private-path"
      : "https://api.example.invalid/private-path",
    siteType === SITE_TYPES.OPENROUTER
      ? " Private OpenRouter Label "
      : " Ordinary Updated Example ",
    siteType === SITE_TYPES.OPENROUTER ? "private-user" : "ordinary-user",
    siteType === SITE_TYPES.OPENROUTER
      ? "private-management-key"
      : "ordinary-token",
    siteType === SITE_TYPES.OPENROUTER ? "private-editable-id" : "ordinary-id",
    "7",
    "",
    [],
    CHECK_IN_DISABLED,
    siteType,
    AuthTypeEnum.AccessToken,
    "",
    undefined,
    false,
    false,
    undefined,
    { deferDataRefresh },
  )

describe("accountOperations validateAndSaveAccount", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await accountStorage.clearAllData()

    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: false,
      showTodayCashflow: false,
    })
    validateManagementKeyMock.mockResolvedValue({})
    getSiteTypeCapabilitiesMock.mockReturnValue({
      account: {
        data: {
          fetchData: fetchAccountDataMock,
        },
        keyManagement: {},
        tokenProvisioning: {},
      },
    })
  })

  it("validates an OpenRouter management key before deferred persistence", async () => {
    const events: string[] = []
    validateManagementKeyMock.mockImplementation(
      async ({ accessToken }: { accessToken: string }) => {
        events.push(`validate:${accessToken}`)
        return {}
      },
    )
    const addSpy = vi
      .spyOn(accountStorage, "addAccount")
      .mockImplementation(async (_data) => {
        events.push("persist")
        return "openrouter:test"
      })

    const result = await validateAndSaveAccount(
      "https://openrouter.ai",
      "OpenRouter",
      "",
      "  sk-or-v1-test  ",
      "",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(true)
    expect(validateManagementKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "sk-or-v1-test" }),
    )
    expect(events).toEqual(["validate:sk-or-v1-test", "persist"])
    expect(addSpy).toHaveBeenCalled()
  })

  it("preserves ordinary preference errors in fallback logs", async () => {
    const preferenceError = new Error("preference storage unavailable")
    vi.spyOn(userPreferences, "getPreferences").mockRejectedValue(
      preferenceError,
    )

    const result = await validateAndSaveAccount(
      "https://api.example.invalid",
      "Example",
      "user",
      "token",
      "1",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(true)
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Failed to read user preferences; falling back to defaults",
      preferenceError,
    )
  })

  it("preserves ordinary storage errors in failure logs", async () => {
    const storageError = new Error("account storage unavailable")
    vi.spyOn(accountStorage, "addAccount").mockRejectedValue(storageError)

    const result = await validateAndSaveAccount(
      "https://api.example.invalid",
      "Example",
      "user",
      "token",
      "1",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(false)
    expect(loggerMock.error).toHaveBeenCalledWith(
      "Failed to save account",
      storageError,
    )
  })

  it("preserves ordinary data-fetch errors in fallback logs", async () => {
    const fetchError = new Error("upstream unavailable")
    fetchAccountDataMock.mockRejectedValue(fetchError)

    const result = await validateAndSaveAccount(
      "https://api.example.invalid",
      "Example",
      "user",
      "token",
      "1",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Data fetch failed; saving configuration only",
      fetchError,
    )
  })

  it("keeps OpenRouter data-fetch errors out of fallback logs", async () => {
    const fetchError = new Error("credential-sensitive upstream response")
    fetchAccountDataMock.mockRejectedValue(fetchError)

    const result = await validateAndSaveAccount(
      "https://openrouter.ai",
      "OpenRouter",
      "",
      "management-key-placeholder",
      "",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Data fetch failed; saving configuration only",
      {
        siteType: SITE_TYPES.OPENROUTER,
        status: "fallback",
      },
    )
    expect(loggerMock.warn).not.toHaveBeenCalledWith(
      "Data fetch failed; saving configuration only",
      fetchError,
    )
  })

  it.each([
    {
      label: "invalid credentials",
      error: new ApiError(
        "openrouter-401-private-sentinel",
        401,
        "/credits",
        API_ERROR_CODES.HTTP_401,
      ),
      expectedReason: "messages:openrouter.credentialInvalid",
    },
    {
      label: "missing permission",
      error: new ApiError(
        "openrouter-403-private-sentinel",
        403,
        "/credits",
        API_ERROR_CODES.HTTP_403,
      ),
      expectedReason: "messages:openrouter.permissionDenied",
    },
    {
      label: "network failure",
      error: new ApiError(
        "openrouter-network-private-sentinel",
        undefined,
        "/credits",
        API_ERROR_CODES.NETWORK_ERROR,
      ),
      expectedReason: "messages:openrouter.networkFallback",
    },
    {
      label: "rate limiting",
      error: new ApiError(
        "openrouter-429-private-sentinel",
        429,
        "/credits",
        API_ERROR_CODES.HTTP_429,
      ),
      expectedReason: "account:healthStatus.unknownError",
    },
    {
      label: "server failure",
      error: new ApiError(
        "openrouter-500-private-sentinel",
        500,
        "/credits",
        API_ERROR_CODES.HTTP_OTHER,
      ),
      expectedReason: "account:healthStatus.unknownError",
    },
    {
      label: "content mismatch",
      error: new ApiError(
        "openrouter-content-private-sentinel",
        200,
        "/credits",
        API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
      ),
      expectedReason: "messages:openrouter.malformedResponse",
    },
    {
      label: "JSON parse failure",
      error: new ApiError(
        "openrouter-json-private-sentinel",
        200,
        "/credits",
        API_ERROR_CODES.JSON_PARSE_ERROR,
      ),
      expectedReason: "messages:openrouter.malformedResponse",
    },
    {
      label: "malformed key response",
      error: new ApiError("openrouter-key-private-sentinel", undefined, "/key"),
      expectedReason: "messages:openrouter.malformedResponse",
    },
    {
      label: "unknown failure",
      error: new Error("openrouter-unknown-private-sentinel"),
      expectedReason: "account:healthStatus.unknownError",
    },
  ])(
    "stores a controlled OpenRouter add health reason for $label",
    async ({ error, expectedReason }) => {
      fetchAccountDataMock.mockRejectedValueOnce(error)

      const result = await saveAccountForLogTest(SITE_TYPES.OPENROUTER, false)

      expect(result.success).toBe(true)
      const saved = await accountStorage.getAccountById(result.accountId!)
      expect(saved?.health).toMatchObject({
        status: SiteHealthStatus.Warning,
        reason: expectedReason,
      })
      expect(JSON.stringify(saved)).not.toContain(error.message)
    },
  )

  it.each([
    {
      label: "non-management key",
      error: new OpenRouterManagementKeyRequiredError(),
      expectedMessage: "messages:openrouter.managementKeyRequired",
    },
    {
      label: "rate limiting",
      error: new ApiError(
        "openrouter-key-429-private-sentinel",
        429,
        "/key",
        API_ERROR_CODES.HTTP_429,
      ),
      expectedMessage: "messages:openrouter.networkFallback",
    },
    {
      label: "server failure",
      error: new ApiError(
        "openrouter-key-500-private-sentinel",
        500,
        "/key",
        API_ERROR_CODES.HTTP_OTHER,
      ),
      expectedMessage: "messages:openrouter.networkFallback",
    },
    {
      label: "content mismatch",
      error: new ApiError(
        "openrouter-key-content-private-sentinel",
        200,
        "/key",
        API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
      ),
      expectedMessage: "messages:openrouter.malformedResponse",
    },
    {
      label: "JSON parse failure",
      error: new ApiError(
        "openrouter-key-json-private-sentinel",
        200,
        "/key",
        API_ERROR_CODES.JSON_PARSE_ERROR,
      ),
      expectedMessage: "messages:openrouter.malformedResponse",
    },
    {
      label: "local structure validation",
      error: new ApiError(
        "openrouter-key-structure-private-sentinel",
        undefined,
        "/key",
      ),
      expectedMessage: "messages:openrouter.malformedResponse",
    },
  ])(
    "classifies OpenRouter credential $label without backend text",
    async ({ error, expectedMessage }) => {
      validateManagementKeyMock.mockRejectedValueOnce(error)

      const result = await saveAccountForLogTest(SITE_TYPES.OPENROUTER, true)

      expect(result).toEqual({ success: false, message: expectedMessage })
      expect(JSON.stringify(result)).not.toContain(error.message)
    },
  )

  it("stores a controlled malformed-credits reason in an OpenRouter update", async () => {
    const privateError = new ApiError(
      "openrouter-credits-private-sentinel",
      undefined,
      "/credits",
    )
    const accountId = await addStoredAccountForLogTest(SITE_TYPES.OPENROUTER)
    fetchAccountDataMock.mockRejectedValueOnce(privateError)

    const result = await updateAccountForLogTest(
      accountId,
      SITE_TYPES.OPENROUTER,
      false,
    )

    expect(result.success).toBe(true)
    const saved = await accountStorage.getAccountById(accountId)
    expect(saved?.health).toMatchObject({
      status: SiteHealthStatus.Warning,
      reason: "messages:openrouter.malformedResponse",
    })
    expect(JSON.stringify(saved)).not.toContain(privateError.message)
  })

  it.each(["add", "update"] as const)(
    "preserves ordinary data-fetch health reasons on %s",
    async (operation) => {
      const rawReason = `ordinary-${operation}-private-diagnostic`
      fetchAccountDataMock.mockRejectedValueOnce(new Error(rawReason))

      if (operation === "add") {
        const result = await saveAccountForLogTest(SITE_TYPES.NEW_API, false)
        const saved = await accountStorage.getAccountById(result.accountId!)
        expect(saved?.health.reason).toBe(rawReason)
        return
      }

      const accountId = await addStoredAccountForLogTest(SITE_TYPES.NEW_API)
      await updateAccountForLogTest(accountId, SITE_TYPES.NEW_API, false)
      const saved = await accountStorage.getAccountById(accountId)
      expect(saved?.health.reason).toBe(rawReason)
    },
  )

  it("limits OpenRouter validation, preference, and storage failure logs", async () => {
    validateManagementKeyMock.mockRejectedValue(
      new Error("private validation response with stack"),
    )

    await saveAccountForLogTest(SITE_TYPES.OPENROUTER, true)
    expect(loggerMock.warn.mock.calls).toEqual([
      [
        "Account credential validation failed",
        { siteType: SITE_TYPES.OPENROUTER, status: "rejected" },
      ],
    ])
    expect(loggerMock.error.mock.calls).toEqual([])

    vi.clearAllMocks()
    validateManagementKeyMock.mockResolvedValue({
      userId: "private-creator-id",
    })
    vi.mocked(userPreferences.getPreferences).mockRejectedValue(
      new Error("private preference failure with stack"),
    )
    await saveAccountForLogTest(SITE_TYPES.OPENROUTER, true)
    expect(loggerMock.warn.mock.calls).toEqual([
      [
        "Failed to read user preferences; falling back to defaults",
        { status: "fallback" },
      ],
    ])
    expect(loggerMock.info.mock.calls).toEqual([
      [
        "Account saved before deferred data refresh",
        {
          siteType: SITE_TYPES.OPENROUTER,
          status: "saved_before_deferred_refresh",
        },
      ],
    ])
    expect(loggerMock.error.mock.calls).toEqual([])

    vi.clearAllMocks()
    validateManagementKeyMock.mockResolvedValue({
      userId: "private-creator-id",
    })
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: false,
      showTodayCashflow: false,
    })
    vi.spyOn(accountStorage, "addAccount").mockRejectedValue(
      new Error("private storage failure with stack"),
    )
    await saveAccountForLogTest(SITE_TYPES.OPENROUTER, true)
    expect(loggerMock.warn.mock.calls).toEqual([])
    expect(loggerMock.info.mock.calls).toEqual([])
    expect(loggerMock.error.mock.calls).toEqual([
      [
        "Failed to save account",
        { siteType: SITE_TYPES.OPENROUTER, status: "persist_failed" },
      ],
    ])
  })

  it("restores the four baseline ordinary-site success logs", async () => {
    fetchAccountDataMock.mockResolvedValue(LOG_TEST_ACCOUNT_DATA)

    await saveAccountForLogTest(SITE_TYPES.NEW_API, true)
    expect(loggerMock.info.mock.calls).toEqual([
      [
        "Account saved before deferred data refresh",
        {
          accountId: expect.any(String),
          siteName: "Ordinary Example",
          siteType: SITE_TYPES.NEW_API,
        },
      ],
    ])

    loggerMock.info.mockClear()
    await saveAccountForLogTest(SITE_TYPES.NEW_API, false)
    expect(loggerMock.info.mock.calls).toEqual([
      [
        "Account saved with data refresh",
        {
          accountId: expect.any(String),
          siteName: "Ordinary Example",
          siteType: SITE_TYPES.NEW_API,
        },
      ],
    ])

    loggerMock.info.mockClear()
    const accountId = await addStoredAccountForLogTest(SITE_TYPES.NEW_API)
    await updateAccountForLogTest(accountId, SITE_TYPES.NEW_API, true)
    expect(loggerMock.info.mock.calls).toEqual([
      [
        "Account updated before deferred data refresh",
        {
          accountId,
          siteName: "Ordinary Updated Example",
          siteType: SITE_TYPES.NEW_API,
        },
      ],
    ])

    loggerMock.info.mockClear()
    await updateAccountForLogTest(accountId, SITE_TYPES.NEW_API, false)
    expect(loggerMock.info.mock.calls).toEqual([
      [
        "Account updated with data refresh",
        {
          accountId,
          siteName: "Ordinary Updated Example",
          siteType: SITE_TYPES.NEW_API,
        },
      ],
    ])
  })

  it("limits every OpenRouter add log payload across success and fallback paths", async () => {
    fetchAccountDataMock.mockResolvedValue(LOG_TEST_ACCOUNT_DATA)

    await saveAccountForLogTest(SITE_TYPES.OPENROUTER, true)
    expect(loggerMock.debug.mock.calls).toEqual([])
    expect(loggerMock.info.mock.calls).toEqual([
      [
        "Account saved before deferred data refresh",
        {
          siteType: SITE_TYPES.OPENROUTER,
          status: "saved_before_deferred_refresh",
        },
      ],
    ])
    expect(loggerMock.warn.mock.calls).toEqual([])
    expect(loggerMock.error.mock.calls).toEqual([])

    vi.clearAllMocks()
    validateManagementKeyMock.mockResolvedValue({
      userId: "private-creator-id",
    })
    fetchAccountDataMock.mockResolvedValue(LOG_TEST_ACCOUNT_DATA)
    await saveAccountForLogTest(SITE_TYPES.OPENROUTER, false)
    expect(loggerMock.debug.mock.calls).toEqual([
      [
        "Fetching account data for new account",
        {
          authType: AuthTypeEnum.AccessToken,
          siteType: SITE_TYPES.OPENROUTER,
          status: "fetching",
        },
      ],
    ])
    expect(loggerMock.info.mock.calls).toEqual([
      [
        "Account saved with data refresh",
        {
          siteType: SITE_TYPES.OPENROUTER,
          status: "saved_with_refresh",
        },
      ],
    ])
    expect(loggerMock.warn.mock.calls).toEqual([])
    expect(loggerMock.error.mock.calls).toEqual([])

    vi.clearAllMocks()
    validateManagementKeyMock.mockResolvedValue({
      userId: "private-creator-id",
    })
    fetchAccountDataMock.mockRejectedValue(
      new Error("private backend message with stack"),
    )
    await saveAccountForLogTest(SITE_TYPES.OPENROUTER, false)
    expect(loggerMock.debug.mock.calls).toEqual([
      [
        "Fetching account data for new account",
        {
          authType: AuthTypeEnum.AccessToken,
          siteType: SITE_TYPES.OPENROUTER,
          status: "fetching",
        },
      ],
    ])
    expect(loggerMock.info.mock.calls).toEqual([])
    expect(loggerMock.warn.mock.calls).toEqual([
      [
        "Data fetch failed; saving configuration only",
        { siteType: SITE_TYPES.OPENROUTER, status: "fallback" },
      ],
      [
        "Account saved without data refresh",
        {
          siteType: SITE_TYPES.OPENROUTER,
          status: "saved_without_data_refresh",
        },
      ],
    ])
    expect(loggerMock.error.mock.calls).toEqual([])
  })

  it("limits every OpenRouter update log payload across success and fallback paths", async () => {
    fetchAccountDataMock.mockResolvedValue(LOG_TEST_ACCOUNT_DATA)
    const accountId = await addStoredAccountForLogTest(SITE_TYPES.OPENROUTER)
    loggerMock.debug.mockClear()
    loggerMock.info.mockClear()
    loggerMock.warn.mockClear()
    loggerMock.error.mockClear()

    await updateAccountForLogTest(accountId, SITE_TYPES.OPENROUTER, true)
    expect(loggerMock.debug.mock.calls).toEqual([])
    expect(loggerMock.info.mock.calls).toEqual([
      [
        "Account updated before deferred data refresh",
        {
          siteType: SITE_TYPES.OPENROUTER,
          status: "updated_before_deferred_refresh",
        },
      ],
    ])
    expect(loggerMock.warn.mock.calls).toEqual([])
    expect(loggerMock.error.mock.calls).toEqual([])

    vi.clearAllMocks()
    validateManagementKeyMock.mockResolvedValue({})
    getSiteTypeCapabilitiesMock.mockReturnValue({
      account: { data: { fetchData: fetchAccountDataMock } },
    })
    fetchAccountDataMock.mockResolvedValue(LOG_TEST_ACCOUNT_DATA)
    await updateAccountForLogTest(accountId, SITE_TYPES.OPENROUTER, false)
    expect(loggerMock.debug.mock.calls).toEqual([
      [
        "Fetching account data for update",
        {
          authType: AuthTypeEnum.AccessToken,
          siteType: SITE_TYPES.OPENROUTER,
          status: "fetching",
        },
      ],
    ])
    expect(loggerMock.info.mock.calls).toEqual([
      [
        "Account updated with data refresh",
        {
          siteType: SITE_TYPES.OPENROUTER,
          status: "updated_with_refresh",
        },
      ],
    ])
    expect(loggerMock.warn.mock.calls).toEqual([])
    expect(loggerMock.error.mock.calls).toEqual([])

    vi.clearAllMocks()
    validateManagementKeyMock.mockResolvedValue({})
    getSiteTypeCapabilitiesMock.mockReturnValue({
      account: { data: { fetchData: fetchAccountDataMock } },
    })
    fetchAccountDataMock.mockRejectedValue(
      new Error("private backend message with stack"),
    )
    await updateAccountForLogTest(accountId, SITE_TYPES.OPENROUTER, false)
    expect(loggerMock.debug.mock.calls).toEqual([
      [
        "Fetching account data for update",
        {
          authType: AuthTypeEnum.AccessToken,
          siteType: SITE_TYPES.OPENROUTER,
          status: "fetching",
        },
      ],
    ])
    expect(loggerMock.info.mock.calls).toEqual([])
    expect(loggerMock.warn.mock.calls).toEqual([
      [
        "Data fetch failed; saving configuration only",
        { siteType: SITE_TYPES.OPENROUTER, status: "fallback" },
      ],
    ])
    expect(loggerMock.error.mock.calls).toEqual([])
  })

  it("uses validated creator identity when editable OpenRouter identity is blank", async () => {
    validateManagementKeyMock.mockResolvedValue({ userId: "user-placeholder" })

    const result = await validateAndSaveAccount(
      "https://openrouter.ai",
      "OpenRouter",
      "",
      "management-key-placeholder",
      "",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(true)
    const saved = await accountStorage.getAccountById(result.accountId!)
    expect(saved).toMatchObject({
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        id: "user-placeholder",
        access_token: "management-key-placeholder",
      },
    })
    expect(saved?.account_info).not.toHaveProperty("identity_scope")
  })

  it("normalizes ordinary account identity when adding an account", async () => {
    const result = await validateAndSaveAccount(
      "https://api.example.invalid",
      "Example",
      "user",
      "token",
      "  ordinary-id  ",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(true)
    await expect(
      accountStorage.getAccountById(result.accountId!),
    ).resolves.toMatchObject({
      account_info: { id: "ordinary-id" },
    })
  })

  it("prefers entered OpenRouter identity over the validated creator on add", async () => {
    validateManagementKeyMock.mockResolvedValue({ userId: "validated-creator" })

    const result = await validateAndSaveAccount(
      "https://openrouter.ai",
      "OpenRouter",
      "",
      "management-key-placeholder",
      " edited-placeholder ",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(true)
    const saved = await accountStorage.getAccountById(result.accountId!)
    expect(saved?.account_info.id).toBe("edited-placeholder")
    expect(saved?.account_info).not.toHaveProperty("identity_scope")
  })

  it("stores a non-secret local fallback when OpenRouter has no creator identity", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000005",
    )
    const digestSpy = vi.spyOn(globalThis.crypto.subtle, "digest")
    const managementKey = "management-key-placeholder"

    const result = await validateAndSaveAccount(
      "https://openrouter.ai",
      "OpenRouter",
      "",
      managementKey,
      "",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(true)
    const savedIdentity = (await accountStorage.getAccountById(
      result.accountId!,
    ))!.account_info
    expect(savedIdentity.id).toBe(
      "openrouter:00000000-0000-4000-8000-000000000005",
    )
    expect(savedIdentity).not.toHaveProperty("identity_scope")
    expect(savedIdentity.id).not.toContain(managementKey)
    expect(digestSpy).not.toHaveBeenCalled()
  })

  it("preserves an auto-bootstrap local fallback through save-time revalidation", async () => {
    const localIdentity = "openrouter:00000000-0000-4000-8000-000000000006"

    const result = await validateAndSaveAccount(
      "https://openrouter.ai",
      "OpenRouter",
      "",
      "management-key-placeholder",
      localIdentity,
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(true)
    const saved = await accountStorage.getAccountById(result.accountId!)
    expect(saved?.account_info.id).toBe(localIdentity)
    expect(saved?.account_info).not.toHaveProperty("identity_scope")
  })

  it("keeps a site-prefixed OpenRouter creator identity as metadata", async () => {
    validateManagementKeyMock.mockResolvedValue({
      userId: "openrouter:upstream-user",
    })

    const result = await validateAndSaveAccount(
      "https://openrouter.ai",
      "OpenRouter",
      "",
      "management-key-placeholder",
      "openrouter:upstream-user",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(true)
    const saved = await accountStorage.getAccountById(result.accountId!)
    expect(saved?.account_info.id).toBe("openrouter:upstream-user")
    expect(saved?.account_info).not.toHaveProperty("identity_scope")
  })

  it.each(["add", "update"] as const)(
    "rejects OpenRouter Cookie auth for direct %s operations",
    async (operation) => {
      const existingAccountId = await accountStorage.addAccount({
        site_name: "OpenRouter",
        site_url: "https://openrouter.ai",
        site_type: SITE_TYPES.OPENROUTER,
        health: { status: SiteHealthStatus.Healthy },
        authType: AuthTypeEnum.AccessToken,
        disabled: false,
        excludeFromTotalBalance: false,
        excludeFromTodayIncome: false,
        exchange_rate: 7,
        notes: "",
        tagIds: [],
        checkIn: CHECK_IN_DISABLED,
        account_info: {
          id: "openrouter:existing",
          access_token: "old-key",
          username: "",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
        last_sync_time: 0,
      })

      const result =
        operation === "add"
          ? await validateAndSaveAccount(
              "https://openrouter.ai",
              "OpenRouter",
              "",
              "management-key",
              "",
              "7",
              "",
              [],
              CHECK_IN_DISABLED,
              SITE_TYPES.OPENROUTER,
              AuthTypeEnum.Cookie,
              "session=valid",
              undefined,
              false,
              false,
              undefined,
              { deferDataRefresh: true },
            )
          : await validateAndUpdateAccount(
              existingAccountId,
              "https://openrouter.ai",
              "OpenRouter",
              "",
              "management-key",
              "",
              "7",
              "",
              [],
              CHECK_IN_DISABLED,
              SITE_TYPES.OPENROUTER,
              AuthTypeEnum.Cookie,
              "session=valid",
              undefined,
              false,
              false,
              undefined,
              { deferDataRefresh: true },
            )

      expect(result).toMatchObject({
        success: false,
        message: "messages:errors.validation.incompleteAccountInfo",
      })
      const storedAccounts = await accountStorage.getAllAccountsOrThrow()
      expect(storedAccounts).toHaveLength(1)
      expect(storedAccounts[0]).toMatchObject({
        id: existingAccountId,
        authType: AuthTypeEnum.AccessToken,
        account_info: {
          id: "openrouter:existing",
          access_token: "old-key",
        },
      })
    },
  )

  it("rejects an unvalidated unchanged token when changing an ordinary account to OpenRouter", async () => {
    const accountId = await addStoredAccountForLogTest(SITE_TYPES.NEW_API)
    validateManagementKeyMock.mockRejectedValue(
      new ApiError(
        "runtime token is not a management key",
        401,
        "/key",
        API_ERROR_CODES.HTTP_401,
      ),
    )

    const result = await validateAndUpdateAccount(
      accountId,
      "https://openrouter.ai",
      "OpenRouter",
      "",
      " ordinary-token ",
      "",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result).toMatchObject({
      success: false,
      message: "messages:openrouter.credentialInvalid",
    })
    expect(validateManagementKeyMock).toHaveBeenCalledWith({
      accessToken: "ordinary-token",
    })
    await expect(
      accountStorage.getAccountById(accountId),
    ).resolves.toMatchObject({
      site_type: SITE_TYPES.NEW_API,
      account_info: {
        id: "ordinary-id",
        access_token: "ordinary-token",
      },
    })
  })

  it("returns a controlled failure when an OpenRouter edit account is missing", async () => {
    await expect(
      validateAndUpdateAccount(
        "missing-account",
        "https://openrouter.ai",
        "OpenRouter",
        "",
        "management-key-placeholder",
        "editable-id",
        "7",
        "",
        [],
        CHECK_IN_DISABLED,
        SITE_TYPES.OPENROUTER,
        AuthTypeEnum.AccessToken,
        "",
        undefined,
        false,
        false,
        undefined,
        { deferDataRefresh: true },
      ),
    ).resolves.toEqual({
      success: false,
      message: "messages:errors.validation.updateAccountFailed",
    })
    expect(validateManagementKeyMock).not.toHaveBeenCalled()
  })

  it("returns a controlled failure when OpenRouter account lookup fails", async () => {
    const storageError = new Error("private-storage-diagnostic")
    vi.spyOn(accountStorage, "getAllAccountsOrThrow").mockRejectedValueOnce(
      storageError,
    )

    await expect(
      validateAndUpdateAccount(
        "stored-account",
        "https://openrouter.ai",
        "OpenRouter",
        "",
        "management-key-placeholder",
        "editable-id",
        "7",
        "",
        [],
        CHECK_IN_DISABLED,
        SITE_TYPES.OPENROUTER,
        AuthTypeEnum.AccessToken,
        "",
        undefined,
        false,
        false,
        undefined,
        { deferDataRefresh: true },
      ),
    ).resolves.toEqual({
      success: false,
      message: "messages:errors.validation.updateAccountFailed",
    })
    expect(validateManagementKeyMock).not.toHaveBeenCalled()
    expect(loggerMock.error).toHaveBeenCalledWith(
      "Failed to load account for update",
      { siteType: SITE_TYPES.OPENROUTER, status: "load_failed" },
    )
    expect(JSON.stringify(loggerMock.error.mock.calls)).not.toContain(
      storageError.message,
    )
  })

  it("normalizes ordinary account identity when updating an account", async () => {
    const accountId = await addStoredAccountForLogTest(SITE_TYPES.NEW_API)

    const result = await validateAndUpdateAccount(
      accountId,
      "https://api.example.invalid",
      "Example",
      "user",
      "token",
      "  updated-ordinary-id  ",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(true)
    await expect(
      accountStorage.getAccountById(accountId),
    ).resolves.toMatchObject({
      account_info: { id: "updated-ordinary-id" },
    })
  })

  it("uses validated creator identity when an unchanged token transitions to OpenRouter", async () => {
    validateManagementKeyMock.mockResolvedValue({
      userId: "validated-creator",
    })
    const accountId = await addStoredAccountForLogTest(SITE_TYPES.NEW_API)

    const result = await validateAndUpdateAccount(
      accountId,
      "https://openrouter.ai",
      "OpenRouter",
      "",
      "ordinary-token",
      "",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(true)
    expect(validateManagementKeyMock).toHaveBeenCalledWith({
      accessToken: "ordinary-token",
    })
    await expect(
      accountStorage.getAccountById(accountId),
    ).resolves.toMatchObject({
      site_type: SITE_TYPES.OPENROUTER,
      account_info: {
        id: "validated-creator",
        access_token: "ordinary-token",
      },
    })
  })

  it("prefers entered OpenRouter identity over validation and stored identity on edit", async () => {
    validateManagementKeyMock.mockResolvedValue({ userId: "validated-creator" })
    const accountId = await accountStorage.addAccount({
      site_name: "Upstream account",
      site_url: "https://upstream.example.invalid",
      site_type: SITE_TYPES.NEW_API,
      health: { status: SiteHealthStatus.Healthy },
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      excludeFromTotalBalance: false,
      excludeFromTodayIncome: false,
      exchange_rate: 7,
      notes: "",
      tagIds: [],
      checkIn: CHECK_IN_DISABLED,
      account_info: {
        id: "upstream-user-id",
        access_token: "old-token",
        username: "upstream-user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: 0,
    })

    const result = await validateAndUpdateAccount(
      accountId,
      "https://openrouter.ai",
      "OpenRouter",
      "",
      "old-token",
      " edited-placeholder ",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(true)
    expect(validateManagementKeyMock).toHaveBeenCalledWith({
      accessToken: "old-token",
    })
    const saved = await accountStorage.getAccountById(accountId)
    expect(saved?.site_type).toBe(SITE_TYPES.OPENROUTER)
    expect(saved?.account_info.id).toBe("edited-placeholder")
    expect(saved?.account_info).not.toHaveProperty("identity_scope")
  })

  it("persists trimmed entered username when adding OpenRouter", async () => {
    const addResult = await validateAndSaveAccount(
      "https://openrouter.ai",
      "OpenRouter",
      " entered-username ",
      "management-key",
      "",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(addResult.success).toBe(true)
    await expect(
      accountStorage.getAccountById(addResult.accountId!),
    ).resolves.toMatchObject({
      account_info: { username: "entered-username" },
    })
  })

  it("uses entered OpenRouter username and preserves a generated fallback when ID is cleared", async () => {
    const generatedFallback = "openrouter:00000000-0000-4000-8000-000000000008"
    const accountId = await accountStorage.addAccount({
      site_name: "OpenRouter",
      site_url: "https://openrouter.ai",
      site_type: SITE_TYPES.OPENROUTER,
      health: { status: SiteHealthStatus.Healthy },
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      excludeFromTotalBalance: false,
      excludeFromTodayIncome: false,
      exchange_rate: 7,
      notes: "",
      tagIds: [],
      checkIn: CHECK_IN_DISABLED,
      account_info: {
        id: generatedFallback,
        access_token: "old-key",
        username: "stored-username",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: 0,
    })

    const updateResult = await validateAndUpdateAccount(
      accountId,
      "https://openrouter.ai",
      "OpenRouter",
      "entered-username",
      "new-key",
      "",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(updateResult.success).toBe(true)
    const saved = await accountStorage.getAccountById(accountId)
    expect(saved?.account_info).toMatchObject({
      id: generatedFallback,
      username: "entered-username",
    })
    expect(saved?.account_info).not.toHaveProperty("identity_scope")
  })

  it("preserves an explicitly cleared OpenRouter username over validation", async () => {
    validateManagementKeyMock.mockResolvedValue({})
    const accountId = await accountStorage.addAccount({
      site_name: "OpenRouter",
      site_url: "https://openrouter.ai",
      site_type: SITE_TYPES.OPENROUTER,
      health: { status: SiteHealthStatus.Healthy },
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      excludeFromTotalBalance: false,
      excludeFromTodayIncome: false,
      exchange_rate: 7,
      notes: "",
      tagIds: [],
      checkIn: CHECK_IN_DISABLED,
      account_info: {
        id: "openrouter:existing",
        access_token: "old-key",
        username: "stored-username",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: 0,
    })

    const updateResult = await validateAndUpdateAccount(
      accountId,
      "https://openrouter.ai",
      "OpenRouter",
      "   ",
      "new-key",
      "",
      "7",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(updateResult.success).toBe(true)
    await expect(
      accountStorage.getAccountById(accountId),
    ).resolves.toMatchObject({
      account_info: { username: "" },
    })
  })

  it("skips OpenRouter credential validation for metadata-only edits", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValue({
      account: {
        data: { fetchData: fetchAccountDataMock },
      },
    })
    const accountId = await accountStorage.addAccount({
      site_name: "OpenRouter",
      site_url: "https://openrouter.ai",
      site_type: SITE_TYPES.OPENROUTER,
      health: { status: SiteHealthStatus.Healthy },
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      excludeFromTotalBalance: false,
      excludeFromTodayIncome: false,
      exchange_rate: 7,
      notes: "old",
      tagIds: [],
      checkIn: CHECK_IN_DISABLED,
      account_info: {
        id: "openrouter:existing",
        access_token: "same-key",
        username: "",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: 0,
    })

    const result = await validateAndUpdateAccount(
      accountId,
      "https://openrouter.ai",
      "Renamed",
      "",
      " same-key ",
      "openrouter:existing",
      "7",
      "new notes",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.OPENROUTER,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(true)
    expect(validateManagementKeyMock).not.toHaveBeenCalled()
    const saved = await accountStorage.getAccountById(accountId)
    expect(saved?.account_info.id).toBe("openrouter:existing")
    expect(saved?.account_info).not.toHaveProperty("identity_scope")
  })

  it.each(availabilityReplacementCases)(
    "replaces old today availability after a successful update with $label",
    async ({ availability, expected }) => {
      const accountId = await addAccountWithOldTodayAvailability()
      fetchAccountDataMock.mockResolvedValueOnce({
        quota: 100,
        today_prompt_tokens: 10,
        today_completion_tokens: 20,
        today_quota_consumption: 30,
        today_requests_count: 40,
        today_income: 50,
        todayStatsAvailability: availability,
        checkIn: CHECK_IN_DISABLED,
      })

      const result = await updateAccountFromRemote(accountId)

      expect(result.success).toBe(true)
      expect(
        (await accountStorage.getAccountById(accountId))?.account_info
          .todayStatsAvailability,
      ).toEqual(expected)
    },
  )

  it("preserves old today availability when an update refresh fails", async () => {
    const accountId = await addAccountWithOldTodayAvailability()
    const previous = (await accountStorage.getAccountById(accountId))
      ?.account_info.todayStatsAvailability
    fetchAccountDataMock.mockRejectedValueOnce(new Error("refresh failed"))

    const result = await updateAccountFromRemote(accountId)

    expect(result).toMatchObject({
      success: true,
      feedbackLevel: "warning",
    })
    expect(
      (await accountStorage.getAccountById(accountId))?.account_info
        .todayStatsAvailability,
    ).toEqual(previous)
  })

  it("persists normalized cookie auth, tag ids, and refreshed metrics on success", async () => {
    fetchAccountDataMock.mockResolvedValueOnce({
      quota: 321,
      today_prompt_tokens: 11,
      today_completion_tokens: 22,
      today_quota_consumption: 33,
      today_requests_count: 44,
      today_income: 55,
      todayStatsAvailability: buildCompleteTodayStatsAvailability({
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
        },
      }),
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
        id: "42",
        username: "cookie-user",
        quota: 321,
        todayStatsAvailability: {
          income: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
            reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
          },
        },
      },
    })
    expect(fetchAccountDataMock).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com/console",
      siteType: SITE_TYPES.UNKNOWN,
      checkIn: CHECK_IN_DISABLED,
      accountId: undefined,
      exchangeRate: 7,
      includeTodayCashflow: false,
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "42",
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
        id: "11",
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
      excludeFromTodayIncome: false,
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
    getSiteTypeCapabilitiesMock.mockClear()

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
    expect(getSiteTypeCapabilitiesMock).toHaveBeenCalledWith(
      SITE_TYPES.AIHUBMIX,
    )

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
      false,
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
        id: "7",
        username: "",
        access_token: "access-123",
        quota: 0,
        todayStatsAvailability: {
          consumption: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
          },
        },
      },
    })
  })

  it("saves warning-only account data when accountData capability is missing", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({})

    const result = await validateAndSaveAccount(
      "https://unsupported.example.invalid",
      "Unsupported Portal",
      "tester",
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

    expect(result).toMatchObject({
      success: true,
      message: "messages:warnings.accountSavedWithoutDataRefresh",
      feedbackLevel: "warning",
    })
    expect(fetchAccountDataMock).not.toHaveBeenCalled()

    const saved = await accountStorage.getAccountById(result.accountId!)
    expect(saved).toMatchObject({
      site_name: "Unsupported Portal",
      health: {
        status: SiteHealthStatus.Warning,
        reason: "accountData is not implemented for new-api",
      },
      account_info: {
        id: "1",
        username: "tester",
        access_token: "token",
        quota: 0,
      },
    })
  })

  it("updates warning-only account data when accountData capability is missing", async () => {
    const accountId = await accountStorage.addAccount({
      site_name: "Old Example",
      site_url: "https://old.example.com",
      site_type: SITE_TYPES.NEW_API,
      health: { status: SiteHealthStatus.Healthy },
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      excludeFromTotalBalance: false,
      excludeFromTodayIncome: false,
      exchange_rate: 7,
      notes: "",
      tagIds: [],
      checkIn: CHECK_IN_DISABLED,
      account_info: {
        id: "previous-id",
        access_token: "old-token",
        username: "old-user",
        quota: 42,
        today_prompt_tokens: 1,
        today_completion_tokens: 2,
        today_quota_consumption: 3,
        today_requests_count: 4,
        today_income: 5,
        todayStatsAvailability: buildCompleteTodayStatsAvailability({
          income: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
            reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
          },
        }),
      },
      last_sync_time: 123,
    })
    getSiteTypeCapabilitiesMock.mockReturnValue({})

    const result = await validateAndUpdateAccount(
      accountId,
      "https://unsupported.example.invalid",
      "Unsupported Portal",
      "tester",
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

    expect(result).toMatchObject({
      success: true,
      message: "messages:warnings.accountUpdatedWithoutDataRefresh",
      feedbackLevel: "warning",
    })
    expect(fetchAccountDataMock).not.toHaveBeenCalled()

    const updated = await accountStorage.getAccountById(accountId)
    expect(updated).toMatchObject({
      site_name: "Unsupported Portal",
      health: {
        status: SiteHealthStatus.Warning,
        reason: "accountData is not implemented for new-api",
      },
      account_info: {
        id: "1",
        username: "tester",
        access_token: "token",
        quota: 42,
        todayStatsAvailability: {
          income: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
            reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
          },
        },
      },
    })
  })

  it("can save cookie account configuration without blocking on remote data refresh", async () => {
    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Example",
      "user",
      "",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.Cookie,
      "Cookie: session=abc123; theme=dark",
      undefined,
      false,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result).toMatchObject({
      success: true,
      message: "messages:toast.success.accountSaveSuccess",
      feedbackLevel: "success",
    })
    expect(fetchAccountDataMock).not.toHaveBeenCalled()

    const saved = await accountStorage.getAccountById(result.accountId!)
    expect(saved).toMatchObject({
      site_name: "Example",
      site_type: SITE_TYPES.NEW_API,
      health: { status: SiteHealthStatus.Unknown },
      cookieAuth: { sessionCookie: "session=abc123" },
      account_info: {
        id: "1",
        username: "user",
        access_token: "",
        quota: 0,
        todayStatsAvailability: {
          consumption: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
          },
        },
      },
    })
  })

  it("ignores Sub2API supplemental auth for non-Sub2API account sites", async () => {
    const addAccountSpy = vi.spyOn(accountStorage, "addAccount")

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
      false,
      { refreshToken: " refresh-token " },
      { deferDataRefresh: true },
    )

    expect(result).toMatchObject({
      success: true,
      feedbackLevel: "success",
    })
    expect(addAccountSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sub2apiAuth: undefined,
      }),
    )
  })

  it("returns a stable save failure when deferred account persistence fails", async () => {
    vi.spyOn(accountStorage, "addAccount").mockRejectedValueOnce(
      new Error("disk full"),
    )

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
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result).toEqual({
      success: false,
      message: "messages:errors.operation.saveFailed",
    })
    expect(fetchAccountDataMock).not.toHaveBeenCalled()
  })

  it("can update cookie account configuration without blocking on remote data refresh", async () => {
    const accountId = await accountStorage.addAccount({
      site_name: "Old Example",
      site_url: "https://old.example.com",
      site_type: SITE_TYPES.NEW_API,
      health: { status: SiteHealthStatus.Healthy },
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      excludeFromTotalBalance: false,
      excludeFromTodayIncome: false,
      exchange_rate: 7,
      notes: "",
      tagIds: [],
      checkIn: CHECK_IN_DISABLED,
      account_info: {
        id: "previous-id",
        access_token: "old-token",
        username: "old-user",
        quota: 42,
        today_prompt_tokens: 1,
        today_completion_tokens: 2,
        today_quota_consumption: 3,
        today_requests_count: 4,
        today_income: 5,
      },
      last_sync_time: 123,
    })

    const result = await validateAndUpdateAccount(
      accountId,
      "https://api.example.com",
      "Example",
      "user",
      "",
      "1",
      "7.0",
      "notes",
      [" alpha ", "alpha", "beta"],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.Cookie,
      "Cookie: session=abc123; theme=dark",
      "2.5",
      true,
      false,
      undefined,
      { deferDataRefresh: true },
    )

    expect(result).toMatchObject({
      success: true,
      message: "messages:toast.success.accountUpdateSuccess",
      accountId,
      feedbackLevel: "success",
    })
    expect(fetchAccountDataMock).not.toHaveBeenCalled()

    const updated = await accountStorage.getAccountById(accountId)
    expect(updated).toMatchObject({
      site_name: "Example",
      site_type: SITE_TYPES.NEW_API,
      excludeFromTotalBalance: true,
      tagIds: ["alpha", "beta"],
      cookieAuth: { sessionCookie: "session=abc123" },
      account_info: {
        id: "1",
        username: "user",
        access_token: "",
        quota: 1250000,
      },
    })
  })

  it("returns a stable update failure when deferred account persistence fails", async () => {
    const updateAccountSpy = vi
      .spyOn(accountStorage, "updateAccountWithCheckInDraft")
      .mockResolvedValueOnce(false)

    const result = await validateAndUpdateAccount(
      "existing-account-id",
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
      false,
      undefined,
      { deferDataRefresh: true, selectionChanged: true },
    )

    expect(result).toEqual({
      success: false,
      message: "messages:errors.validation.updateAccountFailed",
    })
    expect(updateAccountSpy).toHaveBeenCalledWith(
      "existing-account-id",
      expect.any(Object),
      CHECK_IN_DISABLED,
      expect.objectContaining({ selectionChanged: true }),
    )
    expect(fetchAccountDataMock).not.toHaveBeenCalled()
  })

  it("normalizes unsupported site types before saving", async () => {
    const { getSiteTypeCapabilities } = await import(
      "~/services/apiAdapters/registry"
    )
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
    expect(getSiteTypeCapabilities).toHaveBeenCalledWith(SITE_TYPES.UNKNOWN)

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
          id: "1",
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

  it("allows unknown account sites to save stable string user ids", async () => {
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
      "Test Site",
      "tester",
      "token",
      "user-abc-123",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)
    const saved = await accountStorage.getAccountById(result.accountId!)
    expect(saved?.account_info.id).toBe("user-abc-123")
    expect(fetchAccountDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          userId: "user-abc-123",
        }),
      }),
    )
  })

  it("allows New API-family account sites to save non-canonical string user ids", async () => {
    for (const userId of ["1.5", "1e3", "-1", "0", "001"]) {
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
        "Test Site",
        "tester",
        "token",
        userId,
        "7.0",
        "",
        [],
        CHECK_IN_DISABLED,
        SITE_TYPES.NEW_API,
        AuthTypeEnum.AccessToken,
        "",
      )

      expect(result.success).toBe(true)
      const saved = await accountStorage.getAccountById(result.accountId!)
      expect(saved?.account_info.id).toBe(userId)
    }

    expect(fetchAccountDataMock).toHaveBeenCalledTimes(5)
  })

  it("allows New API-family account sites to update non-canonical string user ids", async () => {
    getSiteTypeCapabilitiesMock.mockClear()

    for (const userId of ["1.5", "1e3", "-1", "0", "001"]) {
      const accountId = await accountStorage.addAccount({
        site_name: "Test Site",
        site_url: "https://api.example.com",
        site_type: SITE_TYPES.NEW_API,
        health: { status: SiteHealthStatus.Healthy },
        authType: AuthTypeEnum.AccessToken,
        disabled: false,
        excludeFromTotalBalance: false,
        excludeFromTodayIncome: false,
        exchange_rate: 7,
        notes: "",
        tagIds: [],
        checkIn: CHECK_IN_DISABLED,
        account_info: {
          id: "previous-id",
          access_token: "old-token",
          username: "tester",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
        last_sync_time: 0,
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

      const result = await validateAndUpdateAccount(
        accountId,
        "https://api.example.com",
        "Test Site",
        "tester",
        "token",
        userId,
        "7.0",
        "",
        [],
        CHECK_IN_DISABLED,
        SITE_TYPES.NEW_API,
        AuthTypeEnum.AccessToken,
        "",
      )

      expect(result.success).toBe(true)
      const saved = await accountStorage.getAccountById(accountId)
      expect(saved?.account_info.id).toBe(userId)
      expect(fetchAccountDataMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            userId,
          }),
        }),
      )
    }

    expect(fetchAccountDataMock).toHaveBeenCalledTimes(5)
    expect(getSiteTypeCapabilitiesMock).toHaveBeenCalledTimes(5)
    expect(getSiteTypeCapabilitiesMock).toHaveBeenCalledWith(SITE_TYPES.NEW_API)
  })

  it("allows AIHubMix to save a stable username identity", async () => {
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
      "https://aihubmix.com",
      "AIHubMix",
      "aihubmix-user",
      "access-token",
      "aihubmix-user",
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
    expect(saved?.account_info.id).toBe("aihubmix-user")
    expect(fetchAccountDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          userId: "aihubmix-user",
        }),
      }),
    )
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
          site_url: "https://api.example.com",
          site_type: SITE_TYPES.NEW_API,
        }),
      }),
    )
  })
})
