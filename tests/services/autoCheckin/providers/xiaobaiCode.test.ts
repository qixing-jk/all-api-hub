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
  performXiaobaiCodeDailyCheckIn,
  probeXiaobaiCodeCheckInStatus,
  XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS,
  XIAOBAI_CODE_STATUS_OUTCOMES,
} from "~/services/apiService/sub2api/xiaobaiCodeCheckIn"
import { ApiError } from "~/services/apiTransport/errors"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { xiaobaiCodeProvider } from "~/services/checkin/autoCheckin/providers/xiaobaiCode"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/apiService/sub2api/xiaobaiCodeCheckIn",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiService/sub2api/xiaobaiCodeCheckIn")
      >()
    return {
      ...actual,
      probeXiaobaiCodeCheckInStatus: vi.fn(),
      performXiaobaiCodeDailyCheckIn: vi.fn(),
    }
  },
)

const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.XiaobaiCodeDailyCheckIn
const SITE_URL = "https://relay.example"

const createAccount = (automaticExecutionEnabled = true) =>
  buildSiteAccount({
    id: "xiaobai-code-account",
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

const matched = (checkedInToday = false, enabled = true) => ({
  outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Matched,
  status: { enabled, checkedInToday },
})

const absent = { outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Absent } as const
const unknown = {
  outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Unknown,
  reason: "invalid_response",
} as const

describe("小白Code check-in integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(probeXiaobaiCodeCheckInStatus).mockResolvedValue(matched())
    vi.mocked(performXiaobaiCodeDailyCheckIn).mockResolvedValue({
      kind: XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { rewardAmount: 0.25 },
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
    expect(xiaobaiCodeProvider.getReadiness?.(account)).toMatchObject({
      ready: false,
    })
  })

  it("takes the app's own answer as read-only discovery evidence", async () => {
    await expect(
      xiaobaiCodeProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({
      detection: { outcome: "matched" },
      status: {
        availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
        today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      },
    })
    expect(performXiaobaiCodeDailyCheckIn).not.toHaveBeenCalled()
  })

  it("treats a host without the app as authoritative unsupported", async () => {
    // A deployment serving a different app, or none, answers its SPA fallback.
    vi.mocked(probeXiaobaiCodeCheckInStatus).mockResolvedValue(absent)
    await expect(
      xiaobaiCodeProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ outcome: "unsupported" })
    expect(performXiaobaiCodeDailyCheckIn).not.toHaveBeenCalled()
  })

  it.each([
    ["an unexpected shape", unknown],
    [
      "an authentication failure",
      {
        outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Unknown,
        reason: "authentication_required",
      },
    ],
  ] as const)("keeps %s unknown", async (_label, probe) => {
    vi.mocked(probeXiaobaiCodeCheckInStatus).mockResolvedValue(probe)
    await expect(
      xiaobaiCodeProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ outcome: "unknown" })
  })

  it.each([
    new ApiError("unauthorized", 401),
    new ApiError("server error", 500),
    new TypeError("Failed to fetch"),
  ])("keeps a transport failure unknown", async (error) => {
    vi.mocked(probeXiaobaiCodeCheckInStatus).mockRejectedValue(error)
    await expect(
      xiaobaiCodeProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ outcome: "unknown" })
  })

  it("reports unknown status when the app does not answer as itself", async () => {
    vi.mocked(probeXiaobaiCodeCheckInStatus).mockResolvedValue(absent)
    await expect(
      xiaobaiCodeProvider.getStatus?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
    })
  })

  it("blocks direct submission without authoritative status proof", async () => {
    await expect(
      xiaobaiCodeProvider.checkIn(createAccount(), executionContext()),
    ).resolves.toMatchObject({ reasonCode: "status_unavailable" })
    expect(performXiaobaiCodeDailyCheckIn).not.toHaveBeenCalled()
  })

  it.each([
    [true, true],
    [false, false],
  ])(
    "does not submit when checked or disabled (checked=%s enabled=%s)",
    async (checkedInToday, enabled) => {
      vi.mocked(probeXiaobaiCodeCheckInStatus).mockResolvedValue(
        matched(checkedInToday, enabled),
      )
      await executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      })
      expect(performXiaobaiCodeDailyCheckIn).not.toHaveBeenCalled()
    },
  )

  it("submits once when enabled and not checked today", async () => {
    await expect(
      executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      }),
    ).resolves.toMatchObject({ kind: "executed" })
    expect(performXiaobaiCodeDailyCheckIn).toHaveBeenCalledOnce()
  })

  it.each([
    XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS.Applied,
    XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked,
  ] as const)("maps %s from the deployment", async (kind) => {
    vi.mocked(performXiaobaiCodeDailyCheckIn).mockResolvedValue(
      kind === XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS.Applied
        ? { kind, data: { rewardAmount: 0.25 } }
        : { kind },
    )
    await expect(
      xiaobaiCodeProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status:
        kind === XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS.Applied
          ? CHECKIN_RESULT_STATUS.SUCCESS
          : CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    })
  })

  it("reports the awarded decimal amount as a quota reward", async () => {
    vi.mocked(performXiaobaiCodeDailyCheckIn).mockResolvedValue({
      kind: XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { rewardAmount: 0.25 },
    })

    await expect(
      xiaobaiCodeProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      reward: { quota: 0.25 * QUOTA_PER_USD },
    })
  })

  it.each([401, 404])(
    "classifies a failed submission HTTP %s",
    async (status) => {
      vi.mocked(performXiaobaiCodeDailyCheckIn).mockRejectedValue(
        new ApiError("unavailable", status),
      )
      await expect(
        xiaobaiCodeProvider.checkIn(createAccount(), {
          ...executionContext(),
          statusProof: notCheckedStatus,
        }),
      ).resolves.toMatchObject({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode:
          status === 401 ? "authentication_required" : "method_unsupported",
      })
    },
  )

  it("marks a dispatched malformed or lost response uncertain", async () => {
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    mutationLifecycle.onDispatch()
    vi.mocked(performXiaobaiCodeDailyCheckIn).mockRejectedValue(
      new Error("invalid response"),
    )
    await expect(
      xiaobaiCodeProvider.checkIn(createAccount(), {
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
      vi.mocked(probeXiaobaiCodeCheckInStatus).mockImplementation(async () =>
        matched(answered ? checkedInToday : false),
      )
      vi.mocked(performXiaobaiCodeDailyCheckIn).mockImplementationOnce(
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
      expect(performXiaobaiCodeDailyCheckIn).toHaveBeenCalledOnce()
      expect(
        vi.mocked(probeXiaobaiCodeCheckInStatus).mock.calls.length,
      ).toBeGreaterThanOrEqual(2)
    },
  )
})
