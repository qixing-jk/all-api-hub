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
  AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS,
  AI_ROUTER_STATUS_OUTCOMES,
  performAiRouterDailyCheckIn,
  probeAiRouterDailyCheckInStatus,
} from "~/services/apiService/sub2api/checkin/aiRouterCheckIn"
import { ApiError } from "~/services/apiTransport/errors"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { aiRouterProvider } from "~/services/checkin/autoCheckin/providers/aiRouter"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/apiService/sub2api/checkin/aiRouterCheckIn",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiService/sub2api/checkin/aiRouterCheckIn")
      >()
    return {
      ...actual,
      performAiRouterDailyCheckIn: vi.fn(),
      probeAiRouterDailyCheckInStatus: vi.fn(),
    }
  },
)

const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.AiRouterDailyCheckIn
const SITE_URL = "https://ai-router.dev"

const createAccount = (automaticExecutionEnabled = true) =>
  buildSiteAccount({
    id: "ai-router-account",
    site_url: SITE_URL,
    site_type: SITE_TYPES.SUB2API,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: "3725",
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

const matched = (checkedInToday = false, enabled = true) => ({
  outcome: AI_ROUTER_STATUS_OUTCOMES.Matched,
  status: { enabled, checkedInToday },
})

const absent = { outcome: AI_ROUTER_STATUS_OUTCOMES.Absent } as const
const unknown = {
  outcome: AI_ROUTER_STATUS_OUTCOMES.Unknown,
  reason: "invalid_response",
} as const

describe("AI-ROUTER check-in integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(probeAiRouterDailyCheckInStatus).mockResolvedValue(matched())
    vi.mocked(performAiRouterDailyCheckIn).mockResolvedValue({
      kind: AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { rewardAmount: 1 },
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it("offers discovery only for the registered deployment origins", () => {
    for (const origin of [
      "https://ai-router.dev",
      "https://www.ai-router.dev",
      "https://ai-router.dev/dashboard",
    ]) {
      expect(
        autoCheckinMethodRegistry
          .getCandidates(SITE_TYPES.SUB2API, origin)
          .map((candidate) => candidate.id),
      ).toContain(METHOD_ID)
    }
  })

  it("does not probe any other Sub2API deployment", () => {
    for (const origin of [
      "https://other.example",
      "https://api.ai-router.dev",
      "https://vip.ai-router.dev",
      undefined,
    ]) {
      expect(
        autoCheckinMethodRegistry
          .getCandidates(SITE_TYPES.SUB2API, origin)
          .map((candidate) => candidate.id),
      ).not.toContain(METHOD_ID)
    }
  })

  it.each([SITE_TYPES.NEW_API, SITE_TYPES.VELOERA, SITE_TYPES.UNKNOWN])(
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
    expect(aiRouterProvider.getReadiness?.(account)).toMatchObject({
      ready: false,
    })
  })

  it("takes the deployment's own answer as read-only discovery evidence", async () => {
    await expect(
      aiRouterProvider.detect?.({ account: createAccount(), observedAt: 200 }),
    ).resolves.toMatchObject({
      detection: { outcome: "matched" },
      status: {
        availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
        today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      },
    })
    expect(performAiRouterDailyCheckIn).not.toHaveBeenCalled()
  })

  it("treats a deployment without the route as authoritative unsupported", async () => {
    vi.mocked(probeAiRouterDailyCheckInStatus).mockResolvedValue(absent)
    await expect(
      aiRouterProvider.detect?.({ account: createAccount(), observedAt: 200 }),
    ).resolves.toMatchObject({ outcome: "unsupported" })
    expect(performAiRouterDailyCheckIn).not.toHaveBeenCalled()
  })

  it.each([
    ["an unexpected shape", unknown],
    [
      "an authentication failure",
      {
        outcome: AI_ROUTER_STATUS_OUTCOMES.Unknown,
        reason: "authentication_required",
      },
    ],
  ] as const)("keeps %s unknown", async (_label, probe) => {
    vi.mocked(probeAiRouterDailyCheckInStatus).mockResolvedValue(probe)
    await expect(
      aiRouterProvider.detect?.({ account: createAccount(), observedAt: 200 }),
    ).resolves.toMatchObject({ outcome: "unknown" })
  })

  it.each([
    new ApiError("unauthorized", 401),
    new ApiError("server error", 500),
    new TypeError("Failed to fetch"),
  ])("keeps a transport failure unknown", async (error) => {
    vi.mocked(probeAiRouterDailyCheckInStatus).mockRejectedValue(error)
    await expect(
      aiRouterProvider.detect?.({ account: createAccount(), observedAt: 200 }),
    ).resolves.toMatchObject({ outcome: "unknown" })
  })

  it("reports unknown status when the deployment does not answer as itself", async () => {
    vi.mocked(probeAiRouterDailyCheckInStatus).mockResolvedValue(absent)
    await expect(
      aiRouterProvider.getStatus?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
    })
  })

  it("blocks direct submission without authoritative status proof", async () => {
    await expect(
      aiRouterProvider.checkIn(createAccount(), executionContext()),
    ).resolves.toMatchObject({ reasonCode: "status_unavailable" })
    expect(performAiRouterDailyCheckIn).not.toHaveBeenCalled()
  })

  it.each([
    [true, true],
    [false, false],
  ])(
    "does not submit when checked or disabled (checked=%s enabled=%s)",
    async (checkedInToday, enabled) => {
      vi.mocked(probeAiRouterDailyCheckInStatus).mockResolvedValue(
        matched(checkedInToday, enabled),
      )
      await executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      })
      expect(performAiRouterDailyCheckIn).not.toHaveBeenCalled()
    },
  )

  // The deployment reports an account-age-gated account as unable to claim, so
  // the provider must not submit for it either.
  it("does not submit while the deployment reports the account ineligible", async () => {
    vi.mocked(probeAiRouterDailyCheckInStatus).mockResolvedValue(
      matched(false, false),
    )
    await expect(
      executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      }),
    ).resolves.toMatchObject({ kind: "skipped" })
    expect(performAiRouterDailyCheckIn).not.toHaveBeenCalled()
  })

  it("submits once when enabled and not checked today", async () => {
    await expect(
      executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      }),
    ).resolves.toMatchObject({ kind: "executed" })
    expect(performAiRouterDailyCheckIn).toHaveBeenCalledOnce()
  })

  it.each([
    AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.Applied,
    AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked,
  ] as const)("maps %s from the deployment", async (kind) => {
    vi.mocked(performAiRouterDailyCheckIn).mockResolvedValue(
      kind === AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.Applied
        ? { kind, data: { rewardAmount: 1 } }
        : { kind },
    )
    await expect(
      aiRouterProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status:
        kind === AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.Applied
          ? CHECKIN_RESULT_STATUS.SUCCESS
          : CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    })
  })

  it("reports the awarded USD amount as a quota reward", async () => {
    vi.mocked(performAiRouterDailyCheckIn).mockResolvedValue({
      kind: AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { rewardAmount: 1 },
    })
    await expect(
      aiRouterProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      reward: { quota: 1 * QUOTA_PER_USD },
    })
  })

  it.each([
    [401, "authentication_required"],
    [404, "method_unsupported"],
  ])("classifies a failed submission HTTP %s", async (status, reasonCode) => {
    vi.mocked(performAiRouterDailyCheckIn).mockRejectedValue(
      new ApiError("unavailable", status),
    )
    await expect(
      aiRouterProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode,
    })
  })

  it("marks a dispatched malformed or lost response uncertain", async () => {
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    mutationLifecycle.onDispatch()
    vi.mocked(performAiRouterDailyCheckIn).mockRejectedValue(
      new Error("invalid response"),
    )
    await expect(
      aiRouterProvider.checkIn(createAccount(), {
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
      vi.mocked(probeAiRouterDailyCheckInStatus).mockImplementation(async () =>
        matched(answered ? checkedInToday : false),
      )
      vi.mocked(performAiRouterDailyCheckIn).mockImplementationOnce(
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
      expect(performAiRouterDailyCheckIn).toHaveBeenCalledOnce()
      expect(
        vi.mocked(probeAiRouterDailyCheckInStatus).mock.calls.length,
      ).toBeGreaterThanOrEqual(2)
    },
  )
})
