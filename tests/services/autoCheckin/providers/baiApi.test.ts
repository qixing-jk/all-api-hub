import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import {
  fetchBaiApiCheckInStatus,
  performBaiApiCheckIn,
} from "~/services/apiService/sub2api/checkin/baiApiCheckIn"
import { ApiError } from "~/services/apiTransport/errors"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { baiApiProvider } from "~/services/checkin/autoCheckin/providers/baiApi"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/apiService/sub2api/checkin/baiApiCheckIn",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiService/sub2api/checkin/baiApiCheckIn")
      >()
    return {
      ...actual,
      fetchBaiApiCheckInStatus: vi.fn(),
      performBaiApiCheckIn: vi.fn(),
    }
  },
)

const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.BaiApiDailyCheckIn
const SITE_URL = "https://relay.example"

const createAccount = (automaticExecutionEnabled = true) =>
  buildSiteAccount({
    id: "bai-api-account",
    site_url: SITE_URL,
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
  evidence: { source: "probe" as const, observedAt: 200 },
}

const notFound = () =>
  new ApiError("柏API daily check-in request failed with HTTP 404", 404)

describe("柏API check-in integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchBaiApiCheckInStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: false,
      streakDays: 0,
    })
    vi.mocked(performBaiApiCheckIn).mockResolvedValue({
      rewardAmount: 0.1,
      checkinDate: "2026-11-03",
      streakDays: 1,
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it("offers discovery for every Sub2API origin", () => {
    for (const origin of [
      SITE_URL,
      "https://other.example",
      "https://another-deployment.example",
      undefined,
    ]) {
      expect(
        autoCheckinMethodRegistry
          .getCandidates(SITE_TYPES.SUB2API, origin)
          .map((candidate) => candidate.id),
      ).toContain(METHOD_ID)
    }
  })

  it.each([SITE_TYPES.NEW_API, SITE_TYPES.VELOERA, SITE_TYPES.PMAPI])(
    "limits the candidate to Sub2API accounts: %s",
    (siteType) => {
      expect(
        autoCheckinMethodRegistry
          .getCandidates(siteType, SITE_URL)
          .map((candidate) => candidate.id),
      ).not.toContain(METHOD_ID)
    },
  )

  it("requires account credentials", () => {
    const account = createAccount()
    account.account_info.access_token = ""
    expect(baiApiProvider.getReadiness?.(account)).toMatchObject({
      ready: false,
    })
  })

  it("takes a status DTO as read-only discovery evidence", async () => {
    await expect(
      baiApiProvider.detect?.({ account: createAccount(), observedAt: 200 }),
    ).resolves.toMatchObject({
      detection: { outcome: "matched" },
      status: {
        availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
        today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      },
    })
    expect(performBaiApiCheckIn).not.toHaveBeenCalled()
  })

  it("reads an already-checked day from the same probe", async () => {
    vi.mocked(fetchBaiApiCheckInStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: true,
      streakDays: 4,
    })
    await expect(
      baiApiProvider.detect?.({ account: createAccount(), observedAt: 200 }),
    ).resolves.toMatchObject({
      detection: { outcome: "matched" },
      status: { today: CHECK_IN_METHOD_TODAY_STATUSES.Checked },
    })
  })

  it("treats a deployment without the module as authoritative unsupported", async () => {
    // Other Sub2API installations answer the route with the host's Go default
    // 404, which is this method not being served here — not an unknown probe.
    vi.mocked(fetchBaiApiCheckInStatus).mockRejectedValue(notFound())
    await expect(
      baiApiProvider.detect?.({ account: createAccount(), observedAt: 200 }),
    ).resolves.toMatchObject({ outcome: "unsupported" })
    expect(performBaiApiCheckIn).not.toHaveBeenCalled()
  })

  it.each([
    new ApiError("柏API daily check-in request failed with HTTP 401", 401),
    new ApiError("柏API daily check-in request failed with HTTP 500", 500),
    new ApiError("Invalid 柏API daily check-in response"),
    new TypeError("Failed to fetch"),
  ])("keeps an unreadable probe unknown", async (error) => {
    vi.mocked(fetchBaiApiCheckInStatus).mockRejectedValue(error)
    await expect(
      baiApiProvider.detect?.({ account: createAccount(), observedAt: 200 }),
    ).resolves.toMatchObject({ outcome: "unknown" })
  })

  it("keeps the selection while a status refresh fails", async () => {
    vi.mocked(fetchBaiApiCheckInStatus).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(
      baiApiProvider.getStatus?.({ account: createAccount(), observedAt: 200 }),
    ).resolves.toMatchObject({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
      reason: "network",
    })
  })

  it("blocks direct submission without authoritative status proof", async () => {
    await expect(
      baiApiProvider.checkIn(createAccount(), executionContext()),
    ).resolves.toMatchObject({ reasonCode: "status_unavailable" })
    expect(performBaiApiCheckIn).not.toHaveBeenCalled()
  })

  it("does not submit when today is already checked", async () => {
    vi.mocked(fetchBaiApiCheckInStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: true,
      streakDays: 3,
    })
    await executeSelectedCheckIn({
      account: createAccount(),
      globalAutomaticExecutionEnabled: true,
      context: executionContext(),
    })
    expect(performBaiApiCheckIn).not.toHaveBeenCalled()
  })

  it("submits once when the day is not checked", async () => {
    await expect(
      executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      }),
    ).resolves.toMatchObject({ kind: "executed" })
    expect(performBaiApiCheckIn).toHaveBeenCalledOnce()
  })

  it("reports the awarded USD amount as a quota reward", async () => {
    await expect(
      baiApiProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      reward: { quota: 0.1 * QUOTA_PER_USD },
    })
  })

  it("keeps a granted day without an authoritative amount reward-free", async () => {
    vi.mocked(performBaiApiCheckIn).mockResolvedValue({
      checkinDate: "2026-11-03",
    })
    const result = await baiApiProvider.checkIn(createAccount(), {
      ...executionContext(),
      statusProof: notCheckedStatus,
    })
    expect(result.status).toBe(CHECKIN_RESULT_STATUS.SUCCESS)
    expect(result).not.toHaveProperty("reward")
  })

  it.each([
    [401, "authentication_required"],
    [404, "method_unsupported"],
  ])("classifies a failed submission HTTP %s", async (status, reasonCode) => {
    vi.mocked(performBaiApiCheckIn).mockRejectedValue(
      new ApiError("柏API daily check-in failed", status),
    )
    await expect(
      baiApiProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode,
    })
  })

  it.each(["今天已经签到", "Already checked in today"])(
    "reads the site's duplicate message as already checked: %s",
    async (message) => {
      vi.mocked(performBaiApiCheckIn).mockRejectedValue(
        new ApiError(message, undefined, "/api/v1/daily-rewards/checkin"),
      )
      await expect(
        baiApiProvider.checkIn(createAccount(), {
          ...executionContext(),
          statusProof: notCheckedStatus,
        }),
      ).resolves.toMatchObject({
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      })
    },
  )

  it("marks a dispatched malformed or lost response uncertain", async () => {
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    mutationLifecycle.onDispatch()
    vi.mocked(performBaiApiCheckIn).mockRejectedValue(
      new Error("Invalid 柏API daily check-in response"),
    )
    await expect(
      baiApiProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
        mutationLifecycle,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.UNCERTAIN })
  })

  it.each([true, false])(
    "reconciles a lost response without replay (checked=%s)",
    async (checkedInToday) => {
      let answered = false
      vi.mocked(fetchBaiApiCheckInStatus).mockImplementation(async () => ({
        enabled: true,
        checkedInToday: answered ? checkedInToday : false,
      }))
      vi.mocked(performBaiApiCheckIn).mockImplementationOnce(
        async (request) => {
          answered = true
          request.observer?.onDispatch()
          throw new TypeError("Failed to fetch")
        },
      )
      const result = await executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      })
      expect(result).toMatchObject({
        kind: "executed",
        retryable: !checkedInToday,
      })
      expect(performBaiApiCheckIn).toHaveBeenCalledOnce()
      expect(
        vi.mocked(fetchBaiApiCheckInStatus).mock.calls.length,
      ).toBeGreaterThanOrEqual(2)
    },
  )
})
