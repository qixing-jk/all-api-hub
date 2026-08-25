import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  fetchSub2ApiProDailyCheckInStatus,
  performSub2ApiProDailyCheckIn,
} from "~/services/apiService/sub2api"
import { SUB2API_AUTH_PERSISTENCE_STATUSES } from "~/services/apiService/sub2api/authSession"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { sub2apiProProvider } from "~/services/checkin/autoCheckin/providers/sub2apiPro"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiService/sub2api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/apiService/sub2api")>()
  return {
    ...actual,
    fetchSub2ApiProDailyCheckInStatus: vi.fn(),
    performSub2ApiProDailyCheckIn: vi.fn(),
  }
})

const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn

const createAccount = (automaticExecutionEnabled = true) =>
  buildSiteAccount({
    id: "sub2api-account",
    site_url: "https://checkin.example.invalid",
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

describe("Sub2API Pro daily check-in method Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchSub2ApiProDailyCheckInStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: false,
    })
    vi.mocked(performSub2ApiProDailyCheckIn).mockResolvedValue({
      kind: "applied",
      data: {
        rewardAmount: 2,
        newBalance: 10,
        checkedInAt: "2026-08-24T00:00:00Z",
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    [
      "account ID",
      (account: ReturnType<typeof createAccount>) => (account.id = ""),
    ],
    [
      "site URL",
      (account: ReturnType<typeof createAccount>) => (account.site_url = ""),
    ],
    [
      "user ID",
      (account: ReturnType<typeof createAccount>) => {
        if (account.account_info) account.account_info.id = ""
      },
    ],
  ])("requires %s before reading status", (_field, removeField) => {
    const account = createAccount()
    removeField(account)

    expect(sub2apiProProvider.getReadiness(account)).toEqual({
      ready: false,
      reason: "account_data_missing",
    })
  })

  it("requires an access token before reading status", () => {
    const account = createAccount()
    if (account.account_info) account.account_info.access_token = ""

    expect(sub2apiProProvider.getReadiness(account)).toEqual({
      ready: false,
      reason: "credentials_missing",
    })
  })

  it("discovers only with status GET and selects the unique disabled match", async () => {
    vi.mocked(fetchSub2ApiProDailyCheckInStatus).mockResolvedValue({
      enabled: false,
      checkedInToday: false,
    })
    const account = createAccount(false)
    account.checkIn = {
      automaticExecutionEnabled: false,
      methodKnowledge: { methods: {} },
      selection: { mode: "automatic" },
    }

    const result = await discoverCheckInMethods({
      account,
      config: account.checkIn,
      observedAt: 200,
    })

    expect(result.decision).toEqual({
      outcome: "resolved",
      methodId: METHOD_ID,
    })
    expect(result.config.selection).toEqual({
      mode: "automatic",
      methodId: METHOD_ID,
    })
    expect(result.config.automaticExecutionEnabled).toBe(false)
    expect(
      result.config.methodKnowledge.methods[METHOD_ID]?.status,
    ).toMatchObject({
      availability: CHECK_IN_METHOD_AVAILABILITIES.Disabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
    })
    expect(fetchSub2ApiProDailyCheckInStatus).toHaveBeenCalledOnce()
    expect(performSub2ApiProDailyCheckIn).not.toHaveBeenCalled()
  })

  it.each([404, 405] as const)(
    "maps authoritative HTTP %s detection to unsupported",
    async (statusCode) => {
      vi.mocked(fetchSub2ApiProDailyCheckInStatus).mockRejectedValue(
        new ApiError("unsupported", statusCode),
      )

      await expect(
        sub2apiProProvider.detect?.({
          account: createAccount(),
          observedAt: 300,
        }),
      ).resolves.toMatchObject({ outcome: "unsupported" })
      expect(performSub2ApiProDailyCheckIn).not.toHaveBeenCalled()
    },
  )

  it.each([
    [new ApiError("login required", 401), "authentication_required"],
    [new ApiError("forbidden", 403), "permission_denied"],
    [new TypeError("Failed to fetch"), "network"],
    [Object.assign(new Error("timed out"), { statusCode: 408 }), "timeout"],
    [
      new ApiError(
        "invalid response",
        undefined,
        undefined,
        API_ERROR_CODES.JSON_PARSE_ERROR,
      ),
      "invalid_response",
    ],
  ] as const)(
    "keeps non-authoritative detection failure controlled as %s",
    async (error, reason) => {
      vi.mocked(fetchSub2ApiProDailyCheckInStatus).mockRejectedValue(error)

      await expect(
        sub2apiProProvider.detect?.({
          account: createAccount(),
          observedAt: 300,
        }),
      ).resolves.toEqual({ outcome: "unknown", reason, attemptedAt: 300 })
      expect(performSub2ApiProDailyCheckIn).not.toHaveBeenCalled()
    },
  )

  it("keeps a failed post-401 status recheck as a confirmed non-mutation failure", async () => {
    vi.mocked(performSub2ApiProDailyCheckIn).mockResolvedValue({
      kind: "recovery_status_unavailable",
    })

    await expect(
      sub2apiProProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: "status_unavailable",
    })
  })

  it("maps strict status fields into canonical status", async () => {
    await expect(
      sub2apiProProvider.getStatus?.({
        account: createAccount(),
        observedAt: 300,
      }),
    ).resolves.toEqual({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      evidence: { source: "probe", observedAt: 300 },
    })
  })

  it("reuses the same-cycle status proof before sending one mutation", async () => {
    const registration = autoCheckinMethodRegistry.resolveById(METHOD_ID)
    if (!registration?.provider.getStatus) throw new Error("Missing Adapter")
    const getStatus = vi
      .spyOn(registration.provider, "getStatus")
      .mockResolvedValue(notCheckedStatus)
    const checkIn = vi
      .spyOn(registration.provider, "checkIn")
      .mockImplementation(async (_account, context) => {
        expect(context.statusProof).toEqual(notCheckedStatus)
        return { status: CHECKIN_RESULT_STATUS.SUCCESS }
      })

    await expect(
      executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      }),
    ).resolves.toMatchObject({ kind: "executed", retryable: false })
    expect(getStatus).toHaveBeenCalledOnce()
    expect(checkIn).toHaveBeenCalledOnce()
  })

  it("requires authoritative status on the initial run and never posts after GET 401", async () => {
    const registration = autoCheckinMethodRegistry.resolveById(METHOD_ID)
    if (!registration?.provider.getStatus) throw new Error("Missing Adapter")
    vi.spyOn(registration.provider, "getStatus").mockRejectedValue(
      Object.assign(new Error("unauthorized"), { statusCode: 401 }),
    )
    const checkIn = vi.spyOn(registration.provider, "checkIn")

    await expect(
      executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      }),
    ).resolves.toMatchObject({
      kind: "skipped",
      reason: "authentication_required",
    })
    expect(checkIn).not.toHaveBeenCalled()
  })

  it.each([404, 405] as const)(
    "maps execution-time status HTTP %s to unsupported",
    async (statusCode) => {
      const registration = autoCheckinMethodRegistry.resolveById(METHOD_ID)
      if (!registration?.provider.getStatus) throw new Error("Missing Adapter")
      vi.spyOn(registration.provider, "getStatus").mockRejectedValue(
        new ApiError("unsupported", statusCode),
      )
      const revalidateAccount = vi.fn(async () => createAccount())

      await expect(
        executeSelectedCheckIn({
          account: createAccount(),
          globalAutomaticExecutionEnabled: true,
          context: executionContext(),
          revalidateAccount,
        }),
      ).resolves.toMatchObject({
        kind: "skipped",
        reason: "method_unsupported",
      })
      expect(revalidateAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          methodKnowledge: expect.objectContaining({
            methods: expect.objectContaining({
              [METHOD_ID]: expect.objectContaining({
                detection: expect.objectContaining({
                  outcome: "unsupported",
                }),
              }),
            }),
          }),
        }),
      )
    },
  )

  it("rejects a recovered mutation after account identity changes", async () => {
    const registration = autoCheckinMethodRegistry.resolveById(METHOD_ID)
    if (!registration?.provider.getStatus) throw new Error("Missing Adapter")
    vi.spyOn(registration.provider, "getStatus").mockResolvedValue(
      notCheckedStatus,
    )
    const reboundAccount = createAccount()
    if (!reboundAccount.account_info) throw new Error("Missing account info")
    reboundAccount.account_info.id = "84"
    const revalidateAccount = vi
      .fn()
      .mockResolvedValueOnce(createAccount())
      .mockResolvedValueOnce(reboundAccount)
    vi.spyOn(registration.provider, "checkIn").mockImplementation(
      async (_account, context) => {
        await expect(context.beforeRecoveredMutation?.()).resolves.toBe(false)
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: "account_unavailable",
        }
      },
    )

    await executeSelectedCheckIn({
      account: createAccount(),
      globalAutomaticExecutionEnabled: true,
      context: executionContext(),
      revalidateAccount,
    })
    expect(revalidateAccount).toHaveBeenCalledTimes(2)
  })

  it.each([
    [
      "account ID",
      (account: ReturnType<typeof createAccount>) => {
        account.id = "replacement-account"
      },
    ],
    [
      "site origin",
      (account: ReturnType<typeof createAccount>) => {
        account.site_url = "https://replacement.example.invalid"
      },
    ],
    [
      "automatic intent",
      (account: ReturnType<typeof createAccount>) => {
        account.checkIn.automaticExecutionEnabled = false
      },
    ],
    [
      "selected method",
      (account: ReturnType<typeof createAccount>) => {
        account.checkIn.selection = { mode: "automatic" }
      },
    ],
    [
      "credentials",
      (account: ReturnType<typeof createAccount>) => {
        if (account.account_info) account.account_info.access_token = ""
      },
    ],
  ])(
    "rejects a recovered mutation after %s changes",
    async (_field, mutateAccount) => {
      const registration = autoCheckinMethodRegistry.resolveById(METHOD_ID)
      if (!registration?.provider.getStatus) throw new Error("Missing Adapter")
      vi.spyOn(registration.provider, "getStatus").mockResolvedValue(
        notCheckedStatus,
      )
      const changedAccount = createAccount()
      mutateAccount(changedAccount)
      const revalidateAccount = vi
        .fn()
        .mockResolvedValueOnce(createAccount())
        .mockResolvedValueOnce(changedAccount)
      vi.spyOn(registration.provider, "checkIn").mockImplementation(
        async (_account, context) => {
          await expect(context.beforeRecoveredMutation?.()).resolves.toBe(false)
          return {
            status: CHECKIN_RESULT_STATUS.FAILED,
            reasonCode: "account_unavailable",
          }
        },
      )

      await executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
        revalidateAccount,
      })
      expect(revalidateAccount).toHaveBeenCalledTimes(2)
    },
  )

  it("turns authoritative not-checked reconciliation into one later safe retry", async () => {
    const registration = autoCheckinMethodRegistry.resolveById(METHOD_ID)
    if (!registration?.provider.getStatus) throw new Error("Missing Adapter")
    vi.spyOn(registration.provider, "getStatus")
      .mockResolvedValueOnce(notCheckedStatus)
      .mockResolvedValueOnce({
        ...notCheckedStatus,
        evidence: { source: "probe", observedAt: 300 },
      })
    const checkIn = vi
      .spyOn(registration.provider, "checkIn")
      .mockResolvedValue({ status: CHECKIN_RESULT_STATUS.UNCERTAIN })

    await expect(
      executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      }),
    ).resolves.toMatchObject({
      kind: "executed",
      result: {
        status: CHECKIN_RESULT_STATUS.FAILED,
        retryable: true,
        reconciliation: "not_checked",
      },
      retryable: true,
    })
    expect(checkIn).toHaveBeenCalledOnce()
  })

  it("starts the later retry with GET and sends only one new mutation", async () => {
    const registration = autoCheckinMethodRegistry.resolveById(METHOD_ID)
    if (!registration?.provider.getStatus) throw new Error("Missing Adapter")
    const order: string[] = []
    vi.spyOn(registration.provider, "getStatus").mockImplementation(
      async () => {
        order.push("GET")
        return notCheckedStatus
      },
    )
    vi.spyOn(registration.provider, "checkIn")
      .mockImplementationOnce(async () => {
        order.push("POST")
        return { status: CHECKIN_RESULT_STATUS.UNCERTAIN }
      })
      .mockImplementationOnce(async () => {
        order.push("POST")
        return { status: CHECKIN_RESULT_STATUS.SUCCESS }
      })

    const input = {
      account: createAccount(),
      globalAutomaticExecutionEnabled: true,
      context: executionContext(),
    }
    await expect(executeSelectedCheckIn(input)).resolves.toMatchObject({
      kind: "executed",
      result: {
        status: CHECKIN_RESULT_STATUS.FAILED,
        retryable: true,
      },
    })
    expect(order).toEqual(["GET", "POST", "GET"])

    await expect(executeSelectedCheckIn(input)).resolves.toMatchObject({
      kind: "executed",
      result: { status: CHECKIN_RESULT_STATUS.SUCCESS },
    })
    expect(order).toEqual(["GET", "POST", "GET", "GET", "POST"])
  })

  it.each([
    [
      { kind: "already_checked" as const },
      CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    ],
    [{ kind: "disabled" as const }, CHECKIN_RESULT_STATUS.FAILED],
    [{ kind: "role_forbidden" as const }, CHECKIN_RESULT_STATUS.FAILED],
    [
      { kind: "recovery_status_unavailable" as const },
      CHECKIN_RESULT_STATUS.FAILED,
    ],
    [
      { kind: "recovery_precondition_failed" as const },
      CHECKIN_RESULT_STATUS.FAILED,
    ],
  ])("maps protocol result $0.kind", async (protocolResult, expectedStatus) => {
    vi.mocked(performSub2ApiProDailyCheckIn).mockResolvedValue(protocolResult)

    await expect(
      sub2apiProProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
      }),
    ).resolves.toMatchObject({ status: expectedStatus })
  })

  it.each([
    [
      SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH,
      "authentication_required",
    ],
    [SUB2API_AUTH_PERSISTENCE_STATUSES.WRITE_FAILED, "status_unavailable"],
    [SUB2API_AUTH_PERSISTENCE_STATUSES.ACCOUNT_MISSING, "account_unavailable"],
  ] as const)(
    "stops a recovered mutation on auth-session result %s",
    async (status, reasonCode) => {
      vi.mocked(performSub2ApiProDailyCheckIn).mockRejectedValue(
        Object.assign(new Error("controlled auth failure"), {
          result: { status },
        }),
      )

      await expect(
        sub2apiProProvider.checkIn(createAccount(), {
          ...executionContext(),
          statusProof: notCheckedStatus,
        }),
      ).resolves.toMatchObject({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode,
      })
    },
  )

  it("classifies a lost post-dispatch response as uncertain", async () => {
    vi.mocked(performSub2ApiProDailyCheckIn).mockImplementation(
      async (request) => {
        request.observer?.onDispatch()
        throw new TypeError("Failed to fetch")
      },
    )
    const mutationLifecycle = createAutoCheckinMutationLifecycle()

    await expect(
      sub2apiProProvider.checkIn(createAccount(), {
        ...executionContext(),
        statusProof: notCheckedStatus,
        mutationLifecycle,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.UNCERTAIN })
  })

  it("classifies a confirmed pre-dispatch network failure as retryable failure", async () => {
    vi.mocked(performSub2ApiProDailyCheckIn).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    const registration = autoCheckinMethodRegistry.resolveById(METHOD_ID)
    if (!registration?.provider.getStatus) throw new Error("Missing Adapter")
    vi.spyOn(registration.provider, "getStatus").mockResolvedValue(
      notCheckedStatus,
    )

    await expect(
      executeSelectedCheckIn({
        account: createAccount(),
        globalAutomaticExecutionEnabled: true,
        context: executionContext(),
      }),
    ).resolves.toMatchObject({
      kind: "executed",
      result: {
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: "network_error",
        retryable: true,
      },
      retryable: true,
    })
  })
})
