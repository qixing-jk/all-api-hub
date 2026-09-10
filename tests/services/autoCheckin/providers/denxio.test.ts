import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/services/accountSiteDefinitions/identifiers"
import { fetchSub2ApiProDailyCheckInStatus } from "~/services/apiService/sub2api"
import { SUB2API_AUTH_PERSISTENCE_STATUSES } from "~/services/apiService/sub2api/authSession"
import {
  DENXIO_DAILY_CHECK_IN_ERROR_CODES,
  fetchDenxioDailyCheckInStatus,
  performDenxioDailyCheckIn,
} from "~/services/apiService/sub2api/denxioCheckIn"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery"
import { denxioProvider } from "~/services/checkin/autoCheckin/providers/denxio"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/apiService/sub2api/denxioCheckIn",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiService/sub2api/denxioCheckIn")
      >()
    return {
      ...actual,
      fetchDenxioDailyCheckInStatus: vi.fn(),
      performDenxioDailyCheckIn: vi.fn(),
    }
  },
)

vi.mock("~/services/apiService/sub2api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiService/sub2api")>()),
  fetchSub2ApiProDailyCheckInStatus: vi.fn(),
}))

const createAccount = () =>
  buildSiteAccount({
    id: "sub2api-account",
    site_url: "https://checkin.example.invalid",
    site_type: SITE_TYPES.SUB2API,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: "42",
      username: "Example User",
      access_token: "example-access-token",
      quota: 0,
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
    },
  })

const executionContext = () => ({
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
})

const notCheckedStatus = {
  outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
  availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
  today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
  evidence: { source: "probe" as const, observedAt: 200 },
}

describe("Denxio daily check-in method Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchDenxioDailyCheckInStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: false,
    })
    vi.mocked(performDenxioDailyCheckIn).mockResolvedValue({
      kind: "applied",
      rewardAmount: 0.5,
    })
    vi.mocked(fetchSub2ApiProDailyCheckInStatus).mockRejectedValue(
      new ApiError("unsupported", 404),
    )
  })

  it("requires a persisted Sub2API access token", () => {
    const account = createAccount()
    expect(denxioProvider.getReadiness(account)).toEqual({ ready: true })
    account.account_info.access_token = ""

    expect(denxioProvider.getReadiness(account)).toEqual({
      ready: false,
      reason: "credentials_missing",
    })
  })

  it.each(["id", "site_url", "account_info.id"] as const)(
    "requires persisted account data: %s",
    (field) => {
      const account = createAccount()
      if (field === "account_info.id") account.account_info.id = ""
      else account[field] = ""

      expect(denxioProvider.getReadiness(account)).toEqual({
        ready: false,
        reason: "account_data_missing",
      })
    },
  )

  it("rejects a status read without account or request data", async () => {
    await expect(
      denxioProvider.getStatus?.({ observedAt: 300 }),
    ).rejects.toThrow("Sub2API account data is unavailable")
  })

  it("maps the deployment status to canonical discovery evidence", async () => {
    await expect(
      denxioProvider.detect?.({ account: createAccount(), observedAt: 300 }),
    ).resolves.toEqual({
      detection: {
        outcome: "matched",
        evidence: { source: "probe", observedAt: 300 },
      },
      status: {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
        today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
        evidence: { source: "probe", observedAt: 300 },
      },
    })
  })

  it.each([
    [false, false, "disabled", "not_checked"],
    [true, true, "enabled", "checked"],
  ] as const)(
    "maps enabled=%s and checked=%s status evidence",
    async (enabled, checkedInToday, availability, today) => {
      vi.mocked(fetchDenxioDailyCheckInStatus).mockResolvedValue({
        enabled,
        checkedInToday,
      })

      await expect(
        denxioProvider.getStatus?.({
          account: createAccount(),
          observedAt: 300,
        }),
      ).resolves.toMatchObject({ availability, today })
    },
  )

  it("wins Sub2API discovery only when its read-only deployment probe matches", async () => {
    const account = createAccount()
    account.checkIn = {
      automaticExecutionEnabled: false,
      methodKnowledge: { methods: {} },
      selection: { mode: "automatic" },
    }

    const result = await discoverCheckInMethods({
      account,
      config: account.checkIn,
      observedAt: 300,
    })

    expect(result.decision).toEqual({
      outcome: "resolved",
      methodId: "denxio:daily-checkin",
    })
    expect(result.config.selection).toEqual({
      mode: "automatic",
      methodId: "denxio:daily-checkin",
    })
  })

  it("requires same-cycle not-checked status before starting the challenge", async () => {
    await expect(
      denxioProvider.checkIn(createAccount(), executionContext()),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: "status_unavailable",
    })
    expect(performDenxioDailyCheckIn).not.toHaveBeenCalled()
  })

  it("forwards execution context and reports an applied claim", async () => {
    const account = createAccount()
    const context = {
      ...executionContext(),
      statusProof: notCheckedStatus,
      beforeRecoveredMutation: vi.fn(async () => true),
    }

    await expect(
      denxioProvider.checkIn(account, context),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      data: { rewardAmount: 0.5 },
    })
    expect(performDenxioDailyCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://checkin.example.invalid",
        accountId: "sub2api-account",
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: context.protectionBypassExecution,
      }),
      { beforeRecoveredMutation: context.beforeRecoveredMutation },
    )
  })

  it.each([
    [{ kind: "already_checked" as const }, "already_checked", undefined],
    [{ kind: "disabled" as const }, "failed", "method_disabled"],
    [
      { kind: "recovery_status_unavailable" as const },
      "failed",
      "status_unavailable",
    ],
    [
      { kind: "recovery_precondition_failed" as const },
      "failed",
      "account_unavailable",
    ],
  ])(
    "maps protocol result $0.kind",
    async (protocolResult, status, reasonCode) => {
      vi.mocked(performDenxioDailyCheckIn).mockResolvedValue(protocolResult)

      await expect(
        denxioProvider.checkIn(createAccount(), {
          ...executionContext(),
          statusProof: notCheckedStatus,
        }),
      ).resolves.toMatchObject({
        status,
        ...(reasonCode ? { reasonCode, retryable: false } : {}),
      })
    },
  )

  it.each([
    [
      SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH,
      "authentication_required",
    ],
    [SUB2API_AUTH_PERSISTENCE_STATUSES.ACCOUNT_MISSING, "account_unavailable"],
    [SUB2API_AUTH_PERSISTENCE_STATUSES.WRITE_FAILED, "status_unavailable"],
  ] as const)(
    "stops after auth persistence result %s",
    async (persistenceStatus, reasonCode) => {
      vi.mocked(performDenxioDailyCheckIn).mockRejectedValue(
        Object.assign(new Error("controlled persistence failure"), {
          result: { status: persistenceStatus },
        }),
      )

      await expect(
        denxioProvider.checkIn(createAccount(), {
          ...executionContext(),
          statusProof: notCheckedStatus,
        }),
      ).resolves.toMatchObject({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode,
        retryable: false,
      })
    },
  )

  it.each([
    [DENXIO_DAILY_CHECK_IN_ERROR_CODES.AlreadyChecked, "already_checked"],
    [DENXIO_DAILY_CHECK_IN_ERROR_CODES.Disabled, "failed"],
  ])("maps stable business code %s", async (upstreamCode, status) => {
    vi.mocked(performDenxioDailyCheckIn).mockRejectedValue(
      new ApiError(
        "controlled deployment error",
        409,
        "/example",
        API_ERROR_CODES.BUSINESS_ERROR,
        upstreamCode,
      ),
    )

    await expect(
      denxioProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({ status })
  })

  it("redacts secrets from a preserved deployment error", async () => {
    vi.mocked(performDenxioDailyCheckIn).mockRejectedValue(
      new ApiError(
        "Bearer example-secret-token was rejected",
        409,
        "/example",
        API_ERROR_CODES.BUSINESS_ERROR,
        DENXIO_DAILY_CHECK_IN_ERROR_CODES.SessionInvalid,
      ),
    )

    await expect(
      denxioProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: "Bearer [REDACTED] was rejected",
    })
  })

  it.each([
    [new ApiError("unauthorized", 401), "authentication_required", undefined],
    [
      Object.assign(new Error("unauthorized"), { statusCode: 401 }),
      "authentication_required",
      undefined,
    ],
    [new ApiError("missing", 404), "method_unsupported", false],
    [new ApiError("not allowed", 405), "method_unsupported", false],
    [new ApiError("forbidden", 403), "permission_denied", undefined],
    [new TypeError("Failed to fetch"), "network_error", undefined],
    [
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
      "timeout",
      undefined,
    ],
    [new ApiError("unavailable", 503), "source_unavailable", undefined],
    [new Error("unexpected"), "status_unavailable", undefined],
  ] as const)(
    "maps mutation failure to %s",
    async (error, reasonCode, retryable) => {
      vi.mocked(performDenxioDailyCheckIn).mockRejectedValue(error)

      await expect(
        denxioProvider.checkIn(createAccount(), {
          ...executionContext(),
          statusProof: notCheckedStatus,
        }),
      ).resolves.toMatchObject({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode,
        ...(typeof retryable === "boolean" ? { retryable } : {}),
      })
    },
  )

  it.each([
    DENXIO_DAILY_CHECK_IN_ERROR_CODES.NoSponsor,
    DENXIO_DAILY_CHECK_IN_ERROR_CODES.SessionPending,
  ])("maps unavailable session code %s", async (upstreamCode) => {
    vi.mocked(performDenxioDailyCheckIn).mockRejectedValue(
      new ApiError(
        "controlled session error",
        409,
        "/example",
        API_ERROR_CODES.BUSINESS_ERROR,
        upstreamCode,
      ),
    )

    await expect(
      denxioProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: "status_unavailable",
      retryable: false,
      rawMessage: "controlled session error",
    })
  })

  it("classifies a lost post-dispatch claim response as uncertain", async () => {
    vi.mocked(performDenxioDailyCheckIn).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    mutationLifecycle.onDispatch()

    await expect(
      denxioProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
        mutationLifecycle,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.UNCERTAIN })
  })
})
