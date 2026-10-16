import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { ForeignCheckInContractError } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import {
  fetchFreeApiDailyCheckInStatus,
  FREE_API_DAILY_CHECK_IN_RESULT_KINDS,
  performFreeApiDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/freeApiCheckIn"
import { ApiError } from "~/services/apiTransport/errors"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { freeApiProvider } from "~/services/checkin/autoCheckin/providers/freeApi"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/apiService/sub2api/checkin/freeApiCheckIn",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiService/sub2api/checkin/freeApiCheckIn")
      >()
    return {
      ...actual,
      fetchFreeApiDailyCheckInStatus: vi.fn(),
      performFreeApiDailyCheckIn: vi.fn(),
    }
  },
)

const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.FreeApiDailyCheckIn

const createAccount = (automaticExecutionEnabled = true) =>
  buildSiteAccount({
    id: "freeapi-account",
    site_url: "https://freeapi.site",
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
              outcome: "matched",
              evidence: { source: "probe", observedAt: 100 },
            },
          },
        },
      },
      selection: { mode: "automatic", methodId: METHOD_ID },
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

describe("FreeAPI check-in integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchFreeApiDailyCheckInStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: false,
    })
    vi.mocked(performFreeApiDailyCheckIn).mockResolvedValue({
      kind: FREE_API_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { rewardAmount: 12.5 },
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([
    "https://freeapi.site",
    "https://freeapi.site/dashboard",
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
        .getCandidates(SITE_TYPES.NEW_API, "https://freeapi.site")
        .map((x) => x.id),
    ).not.toContain(METHOD_ID)
  })

  it("requires account credentials", () => {
    const account = createAccount()
    account.account_info.access_token = ""
    expect(freeApiProvider.getReadiness?.(account)).toMatchObject({
      ready: false,
    })
  })

  it("preserves supplied transport context and overrides only the read signal", async () => {
    const originalSignal = new AbortController().signal
    const signal = new AbortController().signal
    const request = {
      baseUrl: "https://provided.example",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "provided-token",
      },
      abortSignal: originalSignal,
    }
    await freeApiProvider.getStatus?.({
      account: createAccount(),
      request,
      signal,
      observedAt: 200,
    })
    expect(fetchFreeApiDailyCheckInStatus).toHaveBeenCalledWith({
      ...request,
      abortSignal: signal,
    })
    expect(request.abortSignal).toBe(originalSignal)
  })

  it("discovers the confirmed status without submitting", async () => {
    await expect(
      freeApiProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ detection: { outcome: "matched" } })
    expect(performFreeApiDailyCheckIn).not.toHaveBeenCalled()
  })

  it("reports the observed status facts", async () => {
    await expect(
      freeApiProvider.getStatus?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toEqual(notCheckedStatus)
  })

  it.each([
    [401, "unknown"],
    [404, "unsupported"],
    [405, "unsupported"],
    [500, "unknown"],
  ])("classifies discovery HTTP %s as %s", async (status, outcome) => {
    vi.mocked(fetchFreeApiDailyCheckInStatus).mockRejectedValue(
      new ApiError("unavailable", status),
    )
    await expect(
      freeApiProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ outcome })
  })

  it("classifies a sibling contract as unsupported", async () => {
    vi.mocked(fetchFreeApiDailyCheckInStatus).mockRejectedValue(
      new ForeignCheckInContractError("/api/v1/user/checkin", {
        enabled: true,
        today_checked_in: false,
      }),
    )
    await expect(
      freeApiProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ outcome: "unsupported" })
  })

  it("blocks direct submission without authoritative status proof", async () => {
    await expect(
      freeApiProvider.checkIn(createAccount(), executionContext()),
    ).resolves.toMatchObject({ reasonCode: "status_unavailable" })
    expect(performFreeApiDailyCheckIn).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    "does not submit when checked or disabled (checked=%s)",
    async (checkedInToday) => {
      vi.mocked(fetchFreeApiDailyCheckInStatus).mockResolvedValue({
        enabled: checkedInToday,
        checkedInToday,
      })
      await executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      })
      expect(performFreeApiDailyCheckIn).not.toHaveBeenCalled()
    },
  )

  it("blocks submission when status is unreadable", async () => {
    vi.mocked(fetchFreeApiDailyCheckInStatus).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(
      executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      }),
    ).resolves.toMatchObject({ kind: "blocked" })
    expect(performFreeApiDailyCheckIn).not.toHaveBeenCalled()
  })

  it("maps an applied grant from the deployment", async () => {
    await expect(
      freeApiProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.SUCCESS })
  })

  it("reports the awarded USD amount as a quota reward", async () => {
    vi.mocked(performFreeApiDailyCheckIn).mockResolvedValue({
      kind: FREE_API_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { rewardAmount: 12.5 },
    })
    await expect(
      freeApiProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      reward: { quota: 12.5 * QUOTA_PER_USD },
    })
  })

  it("marks a dispatched malformed or lost response uncertain", async () => {
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    mutationLifecycle.onDispatch()
    vi.mocked(performFreeApiDailyCheckIn).mockRejectedValue(
      new Error("invalid response"),
    )
    await expect(
      freeApiProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
        mutationLifecycle,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.UNCERTAIN })
  })

  it.each([true, false])(
    "reconciles a lost response without replay (checked=%s)",
    async (checkedInToday) => {
      vi.mocked(fetchFreeApiDailyCheckInStatus)
        .mockResolvedValueOnce({ enabled: true, checkedInToday: false })
        .mockResolvedValue({ enabled: true, checkedInToday })
      vi.mocked(performFreeApiDailyCheckIn).mockImplementation(
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
      expect(result).toMatchObject({ kind: "executed", retryable: false })
      expect(performFreeApiDailyCheckIn).toHaveBeenCalledOnce()
      expect(
        vi.mocked(fetchFreeApiDailyCheckInStatus).mock.calls.length,
      ).toBeGreaterThanOrEqual(2)
    },
  )
})
