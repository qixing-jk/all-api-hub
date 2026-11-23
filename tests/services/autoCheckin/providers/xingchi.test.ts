import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_EXECUTION_RESULT_KINDS,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { ForeignCheckInContractError } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import {
  fetchXingchiDailyCheckInStatus,
  performXingchiDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/xingchiCheckIn"
import { ApiError } from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { xingchiProvider } from "~/services/checkin/autoCheckin/providers/xingchi"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/apiService/sub2api/checkin/xingchiCheckIn",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiService/sub2api/checkin/xingchiCheckIn")
      >()
    return {
      ...actual,
      fetchXingchiDailyCheckInStatus: vi.fn(),
      performXingchiDailyCheckIn: vi.fn(),
    }
  },
)

const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.XingchiDailyCheckIn

const createAccount = (automaticExecutionEnabled = true) =>
  buildSiteAccount({
    id: "xingchi-account",
    site_url: "https://xingchiapi.com",
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
    checkIn: {
      automaticExecutionEnabled,
      methodKnowledge: {
        methods: {
          [METHOD_ID]: {
            detection: {
              outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
              evidence: {
                source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
                observedAt: 100,
              },
            },
          },
        },
      },
      selection: {
        mode: CHECK_IN_SELECTION_MODES.Automatic,
        methodId: METHOD_ID,
      },
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
  evidence: {
    source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
    observedAt: 200,
  },
}

describe("Xingchi check-in integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchXingchiDailyCheckInStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: false,
    })
    vi.mocked(performXingchiDailyCheckIn).mockResolvedValue({
      rewardAmount: 12.5,
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([
    "https://xingchiapi.com",
    "https://xingchiapi.com/dashboard",
    "https://other.example",
    undefined,
  ])("offers read-only discovery across Sub2API origins: %s", (origin) => {
    expect(
      autoCheckinMethodRegistry
        .getCandidates(SITE_TYPES.SUB2API, origin)
        .map((x) => x.id),
    ).toContain(METHOD_ID)
  })

  it("limits the candidate to Sub2API accounts", () => {
    expect(
      autoCheckinMethodRegistry
        .getCandidates(SITE_TYPES.NEW_API, "https://xingchiapi.com")
        .map((x) => x.id),
    ).not.toContain(METHOD_ID)
  })

  it("requires account credentials", () => {
    const account = createAccount()
    account.account_info.access_token = ""
    expect(xingchiProvider.getReadiness?.(account)).toMatchObject({
      ready: false,
    })
  })

  it("preserves supplied transport context and overrides only the read signal", async () => {
    const originalSignal = new AbortController().signal
    const signal = new AbortController().signal
    const request = {
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: "https://provided.example",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "provided-token",
      },
      abortSignal: originalSignal,
    }
    await xingchiProvider.getStatus?.({
      account: createAccount(),
      request,
      signal,
      observedAt: 200,
    })
    expect(fetchXingchiDailyCheckInStatus).toHaveBeenCalledWith({
      ...request,
      abortSignal: signal,
    })
    expect(request.abortSignal).toBe(originalSignal)
  })

  it("discovers the confirmed status without submitting", async () => {
    await expect(
      xingchiProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({
      detection: { outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched },
    })
    expect(performXingchiDailyCheckIn).not.toHaveBeenCalled()
  })

  it("reports the observed status facts", async () => {
    await expect(
      xingchiProvider.getStatus?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toEqual(notCheckedStatus)
  })

  it.each([
    [401, CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown],
    [404, CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported],
    [405, CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported],
    [500, CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown],
  ])("classifies discovery HTTP %s as %s", async (status, outcome) => {
    vi.mocked(fetchXingchiDailyCheckInStatus).mockRejectedValue(
      new ApiError("unavailable", status),
    )
    await expect(
      xingchiProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ outcome })
  })

  it("classifies a sibling contract as unsupported", async () => {
    vi.mocked(fetchXingchiDailyCheckInStatus).mockRejectedValue(
      new ForeignCheckInContractError("/api/v1/user/checkin", {
        enabled: true,
        today_checked_in: false,
      }),
    )
    await expect(
      xingchiProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({
      outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
    })
  })

  it("blocks direct submission without authoritative status proof", async () => {
    await expect(
      xingchiProvider.checkIn(createAccount(), executionContext()),
    ).resolves.toMatchObject({
      reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
    })
    expect(performXingchiDailyCheckIn).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    "does not submit when checked or disabled (checked=%s)",
    async (checkedInToday) => {
      vi.mocked(fetchXingchiDailyCheckInStatus).mockResolvedValue({
        enabled: checkedInToday,
        checkedInToday,
      })
      await executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      })
      expect(performXingchiDailyCheckIn).not.toHaveBeenCalled()
    },
  )

  it("blocks submission when status is unreadable", async () => {
    vi.mocked(fetchXingchiDailyCheckInStatus).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(
      executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      }),
    ).resolves.toMatchObject({
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Blocked,
    })
    expect(performXingchiDailyCheckIn).not.toHaveBeenCalled()
  })

  it("maps an applied grant from the deployment", async () => {
    await expect(
      xingchiProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.SUCCESS })
  })

  it("preserves the native duplicate response as already checked", async () => {
    vi.mocked(performXingchiDailyCheckIn).mockRejectedValue(
      new ApiError(
        "Already claimed",
        409,
        "/api/v1/user/checkin",
        "BUSINESS_ERROR",
        "CHECKIN_ALREADY_CLAIMED",
      ),
    )
    await expect(
      xingchiProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    })
  })

  it("keeps the native reward without guessing its currency", async () => {
    const result = await xingchiProvider.checkIn(createAccount(), {
      ...executionContext(),
      statusProof: notCheckedStatus,
    })
    expect(result).toMatchObject({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      data: { rewardAmount: 12.5 },
    })
    expect(result.awards).toBeUndefined()
  })

  it("marks a dispatched malformed or lost response uncertain", async () => {
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    mutationLifecycle.onDispatch()
    vi.mocked(performXingchiDailyCheckIn).mockRejectedValue(
      new Error("invalid response"),
    )
    await expect(
      xingchiProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
        mutationLifecycle,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.UNCERTAIN })
  })

  it.each([true, false])(
    "reconciles a lost response without replay (checked=%s)",
    async (checkedInToday) => {
      vi.mocked(fetchXingchiDailyCheckInStatus)
        .mockResolvedValueOnce({ enabled: true, checkedInToday: false })
        .mockResolvedValue({ enabled: true, checkedInToday })
      vi.mocked(performXingchiDailyCheckIn).mockImplementation(
        async (request) => {
          request.observer?.onDispatch()
          throw new TypeError("Failed to fetch")
        },
      )
      const result = await executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      })
      // Duplicate guarantees are unverified for this deployment, so a lost
      // write never re-enters the same-day replay queue.
      expect(result).toMatchObject({
        kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed,
        retryable: false,
      })
      expect(performXingchiDailyCheckIn).toHaveBeenCalledOnce()
      expect(
        vi.mocked(fetchXingchiDailyCheckInStatus).mock.calls.length,
      ).toBeGreaterThanOrEqual(2)
    },
  )
})
