import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/services/accountSiteDefinitions/identifiers"
import { fetchSub2ApiProDailyCheckInStatus } from "~/services/apiService/sub2api"
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
    account.account_info.access_token = ""

    expect(denxioProvider.getReadiness(account)).toEqual({
      ready: false,
      reason: "credentials_missing",
    })
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
