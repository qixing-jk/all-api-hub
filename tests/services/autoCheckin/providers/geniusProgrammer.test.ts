import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  fetchGeniusProgrammerDailyCheckInStatus,
  GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS,
  performGeniusProgrammerDailyCheckIn,
} from "~/services/apiService/sub2api/geniusProgrammerCheckIn"
import { ApiError } from "~/services/apiTransport/errors"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { geniusProgrammerProvider } from "~/services/checkin/autoCheckin/providers/geniusProgrammer"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/apiService/sub2api/geniusProgrammerCheckIn",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiService/sub2api/geniusProgrammerCheckIn")
      >()
    return {
      ...actual,
      fetchGeniusProgrammerDailyCheckInStatus: vi.fn(),
      performGeniusProgrammerDailyCheckIn: vi.fn(),
    }
  },
)

const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn

const createAccount = (automaticExecutionEnabled = true) =>
  buildSiteAccount({
    id: "sub2api-account",
    site_url: "https://codexcli.club",
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

describe("Genius Programmer check-in integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchGeniusProgrammerDailyCheckInStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: false,
    })
    vi.mocked(performGeniusProgrammerDailyCheckIn).mockResolvedValue({
      kind: GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { rewardAmount: 0.05 },
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([
    "https://other.example",
    "https://another-deployment.example",
    "http://codexcli.club",
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
        .getCandidates(SITE_TYPES.SUB2API, "https://codexcli.club/dashboard")
        .map((x) => x.id),
    ).toContain(METHOD_ID)
    expect(
      autoCheckinMethodRegistry
        .getCandidates(SITE_TYPES.NEW_API, "https://codexcli.club")
        .map((x) => x.id),
    ).not.toContain(METHOD_ID)
  })
  it("requires account credentials", () => {
    const account = createAccount()
    account.account_info.access_token = ""
    expect(geniusProgrammerProvider.getReadiness?.(account)).toMatchObject({
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
    await geniusProgrammerProvider.getStatus?.({
      account: createAccount(),
      request,
      signal,
      observedAt: 200,
    })
    expect(fetchGeniusProgrammerDailyCheckInStatus).toHaveBeenCalledWith({
      ...request,
      abortSignal: signal,
    })
    expect(request.abortSignal).toBe(originalSignal)
  })

  it("discovers the confirmed status without submitting", async () => {
    await expect(
      geniusProgrammerProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ detection: { outcome: "matched" } })
    expect(performGeniusProgrammerDailyCheckIn).not.toHaveBeenCalled()
  })
  it.each([
    [401, "unknown"],
    [404, "unsupported"],
    [405, "unsupported"],
    [500, "unknown"],
  ])("classifies discovery HTTP %s as %s", async (status, outcome) => {
    vi.mocked(fetchGeniusProgrammerDailyCheckInStatus).mockRejectedValue(
      new ApiError("unavailable", status),
    )
    await expect(
      geniusProgrammerProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ outcome })
  })
  it("blocks direct submission without authoritative status proof", async () => {
    await expect(
      geniusProgrammerProvider.checkIn(createAccount(), executionContext()),
    ).resolves.toMatchObject({ reasonCode: "status_unavailable" })
    expect(performGeniusProgrammerDailyCheckIn).not.toHaveBeenCalled()
  })
  it.each([true, false])(
    "does not submit when checked or disabled (checked=%s)",
    async (checkedInToday) => {
      vi.mocked(fetchGeniusProgrammerDailyCheckInStatus).mockResolvedValue({
        enabled: checkedInToday,
        checkedInToday,
      })
      await executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      })
      expect(performGeniusProgrammerDailyCheckIn).not.toHaveBeenCalled()
    },
  )
  it("blocks submission when status is unreadable", async () => {
    vi.mocked(fetchGeniusProgrammerDailyCheckInStatus).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(
      executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      }),
    ).resolves.toMatchObject({ kind: "blocked" })
    expect(performGeniusProgrammerDailyCheckIn).not.toHaveBeenCalled()
  })
  it.each([
    GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS.Applied,
    GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked,
  ] as const)("maps %s from the deployment", async (kind) => {
    vi.mocked(performGeniusProgrammerDailyCheckIn).mockResolvedValue(
      kind === GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS.Applied
        ? { kind, data: { rewardAmount: 0.05 } }
        : { kind },
    )
    await expect(
      geniusProgrammerProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status:
        kind === GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS.Applied
          ? CHECKIN_RESULT_STATUS.SUCCESS
          : CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    })
  })
  it("marks a dispatched malformed or lost response uncertain", async () => {
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    mutationLifecycle.onDispatch()
    vi.mocked(performGeniusProgrammerDailyCheckIn).mockRejectedValue(
      new Error("invalid response"),
    )
    await expect(
      geniusProgrammerProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
        mutationLifecycle,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.UNCERTAIN })
  })
  it.each([true, false])(
    "reconciles a lost response without replay (checked=%s)",
    async (checkedInToday) => {
      vi.mocked(fetchGeniusProgrammerDailyCheckInStatus)
        .mockResolvedValueOnce({ enabled: true, checkedInToday: false })
        .mockResolvedValue({ enabled: true, checkedInToday })
      vi.mocked(performGeniusProgrammerDailyCheckIn).mockImplementation(
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
      expect(performGeniusProgrammerDailyCheckIn).toHaveBeenCalledOnce()
      expect(
        vi.mocked(fetchGeniusProgrammerDailyCheckInStatus).mock.calls.length,
      ).toBeGreaterThanOrEqual(2)
    },
  )
})
