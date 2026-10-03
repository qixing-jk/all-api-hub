import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  fetchToolcodeDailyCheckInStatus,
  performToolcodeDailyCheckIn,
  TOOLCODE_DAILY_CHECK_IN_RESULT_KINDS,
} from "~/services/apiService/sub2api/toolcodeCheckIn"
import { ApiError } from "~/services/apiTransport/errors"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { toolcodeProvider } from "~/services/checkin/autoCheckin/providers/toolcode"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/apiService/sub2api/toolcodeCheckIn",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiService/sub2api/toolcodeCheckIn")
      >()
    return {
      ...actual,
      fetchToolcodeDailyCheckInStatus: vi.fn(),
      performToolcodeDailyCheckIn: vi.fn(),
    }
  },
)

const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.ToolcodeDailyCheckIn

const createAccount = (automaticExecutionEnabled = true) =>
  buildSiteAccount({
    id: "sub2api-account",
    site_url: "https://toolcode.top",
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

describe("ToolCode check-in integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchToolcodeDailyCheckInStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: false,
    })
    vi.mocked(performToolcodeDailyCheckIn).mockResolvedValue({
      kind: TOOLCODE_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { pointsReward: 10, bonusAmount: 0 },
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([
    "https://other.example",
    "https://another-deployment.example",
    "http://toolcode.top",
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
        .getCandidates(SITE_TYPES.SUB2API, "https://toolcode.top/dashboard")
        .map((x) => x.id),
    ).toContain(METHOD_ID)
    expect(
      autoCheckinMethodRegistry
        .getCandidates(SITE_TYPES.NEW_API, "https://toolcode.top")
        .map((x) => x.id),
    ).not.toContain(METHOD_ID)
  })
  it("requires account credentials", () => {
    const account = createAccount()
    account.account_info.access_token = ""
    expect(toolcodeProvider.getReadiness?.(account)).toMatchObject({
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
    await toolcodeProvider.getStatus?.({
      account: createAccount(),
      request,
      signal,
      observedAt: 200,
    })
    expect(fetchToolcodeDailyCheckInStatus).toHaveBeenCalledWith({
      ...request,
      abortSignal: signal,
    })
    expect(request.abortSignal).toBe(originalSignal)
  })

  it("discovers the confirmed status without submitting", async () => {
    await expect(
      toolcodeProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ detection: { outcome: "matched" } })
    expect(performToolcodeDailyCheckIn).not.toHaveBeenCalled()
  })
  it.each([
    [401, "unknown"],
    [404, "unsupported"],
    [405, "unsupported"],
    [500, "unknown"],
  ])("classifies discovery HTTP %s as %s", async (status, outcome) => {
    vi.mocked(fetchToolcodeDailyCheckInStatus).mockRejectedValue(
      new ApiError("unavailable", status),
    )
    await expect(
      toolcodeProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ outcome })
  })
  it("blocks direct submission without authoritative status proof", async () => {
    await expect(
      toolcodeProvider.checkIn(createAccount(), executionContext()),
    ).resolves.toMatchObject({ reasonCode: "status_unavailable" })
    expect(performToolcodeDailyCheckIn).not.toHaveBeenCalled()
  })
  it.each([true, false])(
    "does not submit when checked or disabled (checked=%s)",
    async (checkedInToday) => {
      vi.mocked(fetchToolcodeDailyCheckInStatus).mockResolvedValue({
        enabled: checkedInToday,
        checkedInToday,
      })
      await executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      })
      expect(performToolcodeDailyCheckIn).not.toHaveBeenCalled()
    },
  )
  it("blocks submission when status is unreadable", async () => {
    vi.mocked(fetchToolcodeDailyCheckInStatus).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(
      executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      }),
    ).resolves.toMatchObject({ kind: "blocked" })
    expect(performToolcodeDailyCheckIn).not.toHaveBeenCalled()
  })
  it.each([
    TOOLCODE_DAILY_CHECK_IN_RESULT_KINDS.Applied,
    TOOLCODE_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked,
  ] as const)("maps %s from the deployment", async (kind) => {
    vi.mocked(performToolcodeDailyCheckIn).mockResolvedValue(
      kind === TOOLCODE_DAILY_CHECK_IN_RESULT_KINDS.Applied
        ? { kind, data: { pointsReward: 10, bonusAmount: 0 } }
        : { kind },
    )
    await expect(
      toolcodeProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status:
        kind === TOOLCODE_DAILY_CHECK_IN_RESULT_KINDS.Applied
          ? CHECKIN_RESULT_STATUS.SUCCESS
          : CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    })
  })
  it("does not misreport points or expiring bonus grants as balance quota", async () => {
    vi.mocked(performToolcodeDailyCheckIn).mockResolvedValue({
      kind: TOOLCODE_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { pointsReward: 10, bonusAmount: 0 },
    })
    const result = await toolcodeProvider.checkIn(createAccount(), {
      ...executionContext(),
      statusProof: notCheckedStatus,
    })
    expect(result.status).toBe(CHECKIN_RESULT_STATUS.SUCCESS)
    expect(result).not.toHaveProperty("reward")
  })
  it("marks a dispatched malformed or lost response uncertain", async () => {
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    mutationLifecycle.onDispatch()
    vi.mocked(performToolcodeDailyCheckIn).mockRejectedValue(
      new Error("invalid response"),
    )
    await expect(
      toolcodeProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
        mutationLifecycle,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.UNCERTAIN })
  })
  it.each([true, false])(
    "reconciles a lost response without replay (checked=%s)",
    async (checkedInToday) => {
      vi.mocked(fetchToolcodeDailyCheckInStatus)
        .mockResolvedValueOnce({ enabled: true, checkedInToday: false })
        .mockResolvedValue({ enabled: true, checkedInToday })
      vi.mocked(performToolcodeDailyCheckIn).mockImplementation(
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
      expect(result).toMatchObject({
        kind: "executed",
        retryable: !checkedInToday,
      })
      expect(performToolcodeDailyCheckIn).toHaveBeenCalledOnce()
      expect(
        vi.mocked(fetchToolcodeDailyCheckInStatus).mock.calls.length,
      ).toBeGreaterThanOrEqual(2)
    },
  )
})
