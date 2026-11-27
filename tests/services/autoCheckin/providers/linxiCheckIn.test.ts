import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { CURRENT_CONFIG_VERSION } from "~/services/accounts/migrations/accountDataMigration"
import {
  fetchLinxiStatus,
  performLinxiClaim,
} from "~/services/apiService/sub2api/checkin/linxiCheckIn"
import { ApiError } from "~/services/apiTransport/errors"
import { inspectCheckInMethods } from "~/services/checkin/autoCheckin/domain"
import { executeAccountCheckin } from "~/services/checkin/autoCheckin/execution/accountExecution"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { linxiProvider } from "~/services/checkin/autoCheckin/providers/linxiCheckIn"
import { AUTO_CHECKIN_METHOD_DEFINITIONS } from "~/services/checkin/autoCheckin/providers/registry"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/apiService/sub2api/checkin/linxiCheckIn",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/checkin/linxiCheckIn")
    >()),
    fetchLinxiStatus: vi.fn(),
    performLinxiClaim: vi.fn(),
  }),
)

const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.LinxiDailyCheckIn

const createAccount = () =>
  buildSiteAccount({
    id: "sub2api-checkin-account",
    site_url: "https://sub.100xlabs.space",
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
      automaticExecutionEnabled: true,
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
  requiresManualVerification: false,
  resetTimeZone: "Asia/Shanghai",
  evidence: { source: "probe" as const, observedAt: Date.now() },
}

describe("Linxi daily check-in provider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchLinxiStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: false,
      requiresManualVerification: false,
      observedAt: Date.now(),
      resetTimeZone: "Asia/Shanghai",
    })
    vi.mocked(performLinxiClaim).mockResolvedValue({
      kind: "applied",
      day: "2026-11-23",
      completedAt: Date.now(),
      resetTimeZone: "Asia/Shanghai",
      pool: "paid",
      amount: 0.25,
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it("registers the method for Sub2API accounts without selecting it for New API", () => {
    expect(
      autoCheckinMethodRegistry
        .getCandidates(
          SITE_TYPES.SUB2API,
          "https://sub.100xlabs.space/check-in",
        )
        .map((candidate) => candidate.id),
    ).toContain(METHOD_ID)
    expect(
      autoCheckinMethodRegistry
        .getCandidates(SITE_TYPES.NEW_API, "https://sub.100xlabs.space")
        .map((candidate) => candidate.id),
    ).not.toContain(METHOD_ID)
    expect(
      autoCheckinMethodRegistry
        .getCandidates(SITE_TYPES.SUB2API, "https://k40.shengqainbang.cn")
        .map((candidate) => candidate.id),
    ).toContain(METHOD_ID)
  })

  it("presents the matched method under the 100xLabs name", () => {
    expect(AUTO_CHECKIN_METHOD_DEFINITIONS[METHOD_ID].source.sourceName).toBe(
      "Linxi / 100xLabs",
    )
  })

  it("discovers with a status read and never submits during detection", async () => {
    await expect(
      linxiProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ detection: { outcome: "matched" } })
    expect(fetchLinxiStatus).toHaveBeenCalledOnce()
    expect(performLinxiClaim).not.toHaveBeenCalled()
  })

  it("requires an enabled, unchecked status before mutation", async () => {
    await expect(
      linxiProvider.checkIn(createAccount(), executionContext()),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
    })
    expect(performLinxiClaim).not.toHaveBeenCalled()

    await expect(
      linxiProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: {
          ...notCheckedStatus,
          today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
        },
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
    })
    expect(performLinxiClaim).not.toHaveBeenCalled()
  })

  it("reports a confirmed claim and only maps an authoritative reward", async () => {
    const execution = await executeSelectedCheckIn({
      account: createAccount(),
      globalAutomaticExecutionEnabled: true,
      context: { ...executionContext(), statusProof: notCheckedStatus },
    })
    expect(execution).toMatchObject({
      kind: "executed",
      result: {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        awards: [{ amount: { status: "known", value: "0.25" } }],
      },
    })
    expect(performLinxiClaim).toHaveBeenCalledOnce()
  })

  it("returns a confirmed free-pool grant as native quota", async () => {
    vi.mocked(performLinxiClaim).mockResolvedValue({
      kind: "applied",
      day: "2026-11-23",
      completedAt: Date.now(),
      resetTimeZone: "Asia/Shanghai",
      pool: "free",
      amount: 270,
    })
    await expect(
      executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      }),
    ).resolves.toMatchObject({
      kind: "executed",
      result: {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        awards: [
          {
            asset: { kind: "quota", id: "linxi-free-pool" },
            amount: {
              status: "known",
              value: "270",
              source: {
                operation: "/api/v1/check-in",
                inputs: ["reward_amount"],
              },
            },
            fulfillment: "credited",
          },
        ],
      },
    })
  })

  it("persists a prior site-day grant without marking the new site day checked", async () => {
    const account = createAccount()
    account.configVersion = CURRENT_CONFIG_VERSION
    await accountConfigStore.mutate((config) => {
      config.accounts = [account]
      return { changed: true, result: undefined }
    })
    const completedAt = Date.parse("2026-11-23T15:59:59Z")
    const receivedAt = Date.parse("2026-11-23T16:00:01Z")
    const clock = vi.spyOn(Date, "now").mockReturnValue(completedAt)
    vi.mocked(fetchLinxiStatus).mockResolvedValueOnce({
      enabled: true,
      checkedInToday: false,
      requiresManualVerification: false,
      observedAt: completedAt,
      resetTimeZone: "Asia/Shanghai",
    })
    vi.mocked(performLinxiClaim).mockImplementationOnce(async () => {
      clock.mockReturnValue(receivedAt)
      return {
        kind: "applied",
        day: "2026-11-23",
        completedAt,
        resetTimeZone: "Asia/Shanghai",
        pool: "free",
        amount: 270,
      }
    })

    const context = executionContext()
    const { result } = await executeAccountCheckin(
      account,
      "Linxi",
      context.tempWindowRequestSource,
      context.protectionBypassExecution,
    )
    expect(result).toMatchObject({
      status: "success",
      accountStateDurability: "persisted",
      awards: [{ amount: { value: "270" } }],
    })
    const saved = (await accountQueries.getAccountById(account.id))!
    expect(
      saved.checkIn.methodKnowledge.methods[METHOD_ID]?.status,
    ).toMatchObject({
      today: "checked",
      resetTimeZone: "Asia/Shanghai",
      evidence: { observedAt: completedAt },
    })
    const accountState = {
      config: saved.checkIn,
      candidateMethodIds: [METHOD_ID],
      timeZone: "UTC",
    }
    expect(
      inspectCheckInMethods({ ...accountState, now: completedAt })
        .executionEligibility,
    ).toEqual({ eligible: false, skipReason: "already_checked" })
    expect(
      inspectCheckInMethods({ ...accountState, now: receivedAt })
        .executionEligibility,
    ).toEqual({ eligible: true, methodId: METHOD_ID })
  })

  it("keeps an explicit duplicate result without replaying the claim", async () => {
    vi.mocked(performLinxiClaim).mockResolvedValue({
      kind: "already",
      day: "2026-11-23",
      completedAt: Date.now(),
      resetTimeZone: "Asia/Shanghai",
    })
    await expect(
      linxiProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED })
    expect(performLinxiClaim).toHaveBeenCalledOnce()
  })

  it("does not submit once the account loses execution eligibility", async () => {
    await expect(
      linxiProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
        beforeRecoveredMutation: async () => false,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE,
    })
    expect(performLinxiClaim).not.toHaveBeenCalled()
  })

  it("stops before POST when the site asks for verification", async () => {
    vi.mocked(fetchLinxiStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: false,
      requiresManualVerification: true,
      observedAt: Date.now(),
      resetTimeZone: "Asia/Shanghai",
    })
    const execution = await executeSelectedCheckIn({
      account: createAccount(),
      globalAutomaticExecutionEnabled: true,
      context: executionContext(),
    })
    expect(execution).toMatchObject({
      kind: "executed",
      result: {
        reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
      },
    })
    expect(performLinxiClaim).not.toHaveBeenCalled()
  })

  it.each([
    [400, "TURNSTILE_VERIFICATION_FAILED"],
    [403, undefined],
  ] as const)(
    "surfaces Turnstile HTTP %i as a manual verification step",
    async (statusCode, upstreamCode) => {
      vi.mocked(performLinxiClaim).mockRejectedValue(
        new ApiError(
          "Turnstile verification required",
          statusCode,
          "/api/v1/check-in",
          "HTTP_OTHER",
          upstreamCode,
        ),
      )
      await expect(
        linxiProvider.checkIn(createAccount(), {
          ...executionContext(),
          statusProof: notCheckedStatus,
        }),
      ).resolves.toMatchObject({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
        messageParams: {
          checkInUrl: "https://sub.100xlabs.space/check-in",
        },
      })
    },
  )
})
