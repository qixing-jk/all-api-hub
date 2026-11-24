import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  fetchLinxiStatus,
  performLinxiClaim,
} from "~/services/apiService/sub2api/checkin/linxiCheckIn"
import { ApiError } from "~/services/apiTransport/errors"
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
  evidence: { source: "probe" as const, observedAt: 200 },
}

describe("Linxi daily check-in provider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchLinxiStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: false,
      requiresManualVerification: false,
    })
    vi.mocked(performLinxiClaim).mockResolvedValue({
      kind: "applied",
      day: "2026-11-23",
      pool: "paid",
      amount: 0.25,
    })
  })

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
    ).not.toContain(METHOD_ID)
  })

  it("presents the matched method under the 100xLabs name", () => {
    expect(AUTO_CHECKIN_METHOD_DEFINITIONS[METHOD_ID].source.sourceName).toBe(
      "100xLabs",
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

  it("keeps an explicit duplicate result without replaying the claim", async () => {
    vi.mocked(performLinxiClaim).mockResolvedValue({
      kind: "already",
      day: "2026-11-23",
    })
    await expect(
      linxiProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED })
    expect(performLinxiClaim).toHaveBeenCalledOnce()
  })

  it("stops before POST when the site asks for verification", async () => {
    vi.mocked(fetchLinxiStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: false,
      requiresManualVerification: true,
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

  it("surfaces Turnstile as a manual verification step", async () => {
    vi.mocked(performLinxiClaim).mockRejectedValue(
      new ApiError(
        "Turnstile verification required",
        400,
        "/api/v1/check-in",
        "HTTP_OTHER",
        "TURNSTILE_VERIFICATION_FAILED",
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
  })
})
