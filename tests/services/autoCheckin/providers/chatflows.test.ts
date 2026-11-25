import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  fetchChatflowsCheckInStatus,
  performChatflowsCheckIn,
} from "~/services/apiService/sub2api/checkin/chatflowsCheckIn"
import { getChatflowsCheckInPeriodBounds } from "~/services/apiService/sub2api/checkin/chatflowsCheckInProtocol"
import { ApiError } from "~/services/apiTransport/errors"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { chatflowsProvider } from "~/services/checkin/autoCheckin/providers/chatflows"
import { AUTO_CHECKIN_METHOD_DEFINITIONS } from "~/services/checkin/autoCheckin/providers/registry"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/apiService/sub2api/checkin/chatflowsCheckIn",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiService/sub2api/checkin/chatflowsCheckIn")
    >()),
    fetchChatflowsCheckInStatus: vi.fn(),
    performChatflowsCheckIn: vi.fn(),
  }),
)

const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.ChatflowsDailyCheckIn
const createAccount = () =>
  buildSiteAccount({
    id: "chatflows-account",
    site_url: "https://relay.example",
    site_type: SITE_TYPES.SUB2API,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: "42",
      username: "Example",
      access_token: "example-token",
      quota: 0,
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    checkIn: {
      automaticExecutionEnabled: true,
      selection: { mode: "automatic", methodId: METHOD_ID },
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
    },
  })
const context = () => ({
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
})
const proof = (observedAt = Date.now()) => ({
  outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
  availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
  today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
  evidence: {
    source: "probe" as const,
    observedAt,
    periodKey: getChatflowsCheckInPeriodBounds(observedAt).periodKey,
  },
})
const status = (checkedInToday = false) => ({
  enabled: true,
  checkedInToday,
  periodKey: "2026-11-23",
  nextResetAt: Date.parse("2026-11-24T04:00:00Z"),
})

describe("ChatflowsAI check-in integration", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-24T03:59:00Z"))
    vi.mocked(fetchChatflowsCheckInStatus)
      .mockReset()
      .mockResolvedValue(status())
    vi.mocked(performChatflowsCheckIn)
      .mockReset()
      .mockResolvedValue({ kind: "applied", amount: 50 })
  })
  afterEach(() => vi.useRealTimers())

  it("discovers the protocol on Sub2API deployments without a hostname gate", () => {
    expect(
      autoCheckinMethodRegistry
        .getCandidates(SITE_TYPES.SUB2API, "https://another.example")
        .map(({ id }) => id),
    ).toContain(METHOD_ID)
    expect(
      autoCheckinMethodRegistry
        .getCandidates(SITE_TYPES.NEW_API)
        .map(({ id }) => id),
    ).not.toContain(METHOD_ID)
    expect(
      AUTO_CHECKIN_METHOD_DEFINITIONS[METHOD_ID].feedbackStatusRoutes,
    ).toEqual([{ path: "/api/checkin/status" }])
  })

  it("requires a saved credential", () => {
    const account = createAccount()
    account.account_info.access_token = ""
    expect(chatflowsProvider.getReadiness(account)).toMatchObject({
      ready: false,
    })
  })

  it("discovers by GET only and forwards cancellation", async () => {
    const signal = new AbortController().signal
    expect(
      await chatflowsProvider.detect?.({
        account: createAccount(),
        observedAt: Date.now(),
        signal,
      }),
    ).toMatchObject({
      detection: { outcome: "matched" },
      status: { today: "not_checked" },
    })
    expect(fetchChatflowsCheckInStatus).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: signal }),
      { allowAuthenticationRecovery: false },
    )
    expect(performChatflowsCheckIn).not.toHaveBeenCalled()
  })

  it("timestamps status evidence when the response completes across noon", async () => {
    const beforeNoon = Date.parse("2026-11-24T03:59:59.000Z")
    const afterNoon = Date.parse("2026-11-24T04:00:01.000Z")
    vi.setSystemTime(beforeNoon)
    vi.mocked(fetchChatflowsCheckInStatus).mockImplementationOnce(async () => {
      vi.setSystemTime(afterNoon)
      return {
        ...status(),
        periodKey: "2026-11-24",
        nextResetAt: Date.parse("2026-11-25T04:00:00.000Z"),
      }
    })

    const result = await chatflowsProvider.getStatus?.({
      account: createAccount(),
      observedAt: beforeNoon,
    })

    expect(result).toMatchObject({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      evidence: { observedAt: afterNoon, periodKey: "2026-11-24" },
    })
  })

  it("distinguishes unsupported from unreadable status", async () => {
    vi.mocked(fetchChatflowsCheckInStatus).mockRejectedValueOnce(
      new ApiError("absent", 404),
    )
    expect(
      await chatflowsProvider.detect?.({
        account: createAccount(),
        observedAt: Date.now(),
      }),
    ).toMatchObject({ outcome: "unsupported" })
    vi.mocked(fetchChatflowsCheckInStatus).mockRejectedValueOnce(
      new TypeError("network"),
    )
    expect(
      await chatflowsProvider.getStatus?.({
        account: createAccount(),
        observedAt: Date.now(),
      }),
    ).toMatchObject({ outcome: "unknown" })
  })

  it("does not submit when the current period is already checked", async () => {
    vi.mocked(fetchChatflowsCheckInStatus).mockResolvedValue(status(true))
    await executeSelectedCheckIn({
      account: createAccount(),
      globalAutomaticExecutionEnabled: true,
      context: context(),
    })
    expect(performChatflowsCheckIn).not.toHaveBeenCalled()
  })

  it("submits once through the selected method", async () => {
    expect(
      await executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: context(),
      }),
    ).toMatchObject({ kind: "executed", result: { status: "success" } })
    expect(performChatflowsCheckIn).toHaveBeenCalledOnce()
    expect(fetchChatflowsCheckInStatus).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ ...context(), directRequestReason: undefined }),
      { allowAuthenticationRecovery: true },
    )
  })

  it("attributes a successful claim to the server period when the response crosses noon", async () => {
    const beforeNoon = Date.parse("2026-11-24T03:59:59.000Z")
    const afterNoon = Date.parse("2026-11-24T04:00:01.000Z")
    vi.setSystemTime(beforeNoon)
    vi.mocked(performChatflowsCheckIn).mockImplementationOnce(async () => {
      vi.setSystemTime(afterNoon)
      return { kind: "applied", amount: 50 }
    })

    const execution = await executeSelectedCheckIn({
      account: createAccount(),
      globalAutomaticExecutionEnabled: true,
      context: context(),
    })

    expect(execution).toMatchObject({
      kind: "executed",
      completedAt: Date.parse("2026-11-23T04:00:00.000Z"),
      result: { status: "success" },
    })
    expect(performChatflowsCheckIn).toHaveBeenCalledOnce()
  })

  it("keeps discovery passive even when given execution recovery context", async () => {
    await chatflowsProvider.detect?.({
      account: createAccount(),
      observedAt: Date.now(),
      authenticationRecovery: context(),
    })
    expect(fetchChatflowsCheckInStatus).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { allowAuthenticationRecovery: false },
    )
  })

  it("rejects a missing or previous-period proof at Beijing noon", async () => {
    expect(
      await chatflowsProvider.checkIn(createAccount(), context()),
    ).toMatchObject({ reasonCode: "status_unavailable" })
    const previous = proof()
    vi.setSystemTime(new Date("2026-11-24T04:00:00Z"))
    expect(
      await chatflowsProvider.checkIn(createAccount(), {
        ...context(),
        statusProof: previous,
      }),
    ).toMatchObject({ reasonCode: "status_unavailable" })
    expect(performChatflowsCheckIn).not.toHaveBeenCalled()
  })

  it("refreshes a cached checked period before executing after noon", async () => {
    const account = createAccount()
    account.checkIn.methodKnowledge.methods[METHOD_ID]!.status = {
      ...proof(),
      today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
    }
    vi.setSystemTime(new Date("2026-11-24T04:01:00Z"))
    vi.mocked(fetchChatflowsCheckInStatus).mockResolvedValue({
      ...status(),
      periodKey: "2026-11-24",
      nextResetAt: Date.parse("2026-11-25T04:00:00Z"),
    })
    expect(
      await executeSelectedCheckIn({
        account,
        globalAutomaticExecutionEnabled: true,
        context: context(),
      }),
    ).toMatchObject({ kind: "executed", result: { status: "success" } })
    expect(performChatflowsCheckIn).toHaveBeenCalledOnce()
  })

  it.each([0, "50.25"])(
    "retains native credit amount %s without a USD conversion",
    async (amount) => {
      vi.mocked(performChatflowsCheckIn).mockResolvedValue({
        kind: "applied",
        amount,
      })
      expect(
        await chatflowsProvider.checkIn(createAccount(), {
          ...context(),
          statusProof: proof(),
        }),
      ).toMatchObject({
        status: "success",
        awards: [
          {
            asset: {
              kind: "quota",
              id: "chatflows:https://relay.example:credits",
            },
            amount: { status: "known", value: String(amount) },
          },
        ],
      })
    },
  )

  it("confirms a 409 duplicate by status without a second POST", async () => {
    vi.mocked(performChatflowsCheckIn).mockResolvedValue({
      kind: "already_checked",
    })
    vi.mocked(fetchChatflowsCheckInStatus).mockResolvedValue(status(true))
    expect(
      await chatflowsProvider.checkIn(createAccount(), {
        ...context(),
        statusProof: proof(),
      }),
    ).toMatchObject({
      status: "already_checked",
      confirmation: { kind: "observed" },
    })
    expect(performChatflowsCheckIn).toHaveBeenCalledOnce()
    expect(fetchChatflowsCheckInStatus).toHaveBeenCalledOnce()
    expect(fetchChatflowsCheckInStatus).toHaveBeenLastCalledWith(
      expect.anything(),
      { allowAuthenticationRecovery: false },
    )
  })

  it.each([false, "unavailable"])(
    "keeps a conflict unconfirmed when readback is %s",
    async (readback) => {
      vi.mocked(performChatflowsCheckIn).mockResolvedValue({
        kind: "already_checked",
      })
      if (readback === false)
        vi.mocked(fetchChatflowsCheckInStatus).mockResolvedValue(status())
      else
        vi.mocked(fetchChatflowsCheckInStatus).mockRejectedValue(
          new Error("unavailable"),
        )
      expect(
        await chatflowsProvider.checkIn(createAccount(), {
          ...context(),
          statusProof: proof(),
        }),
      ).toMatchObject({ status: "uncertain" })
      expect(performChatflowsCheckIn).toHaveBeenCalledOnce()
    },
  )

  it("leaves a dispatched lost response for status reconciliation", async () => {
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    mutationLifecycle.dispatched = true
    vi.mocked(performChatflowsCheckIn).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    expect(
      await chatflowsProvider.checkIn(createAccount(), {
        ...context(),
        statusProof: proof(),
        mutationLifecycle,
      }),
    ).toMatchObject({ status: "uncertain" })
    expect(performChatflowsCheckIn).toHaveBeenCalledOnce()
  })
})
