import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { getSiteCheckInDisplayState } from "~/features/AccountManagement/checkInStatus"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { CURRENT_CONFIG_VERSION } from "~/services/accounts/migrations/accountDataMigration"
import {
  fetchApiKeyCasaDailyCheckInStatus,
  performApiKeyCasaDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/apiKeyCasaCheckIn"
import { buildAutoCheckinAccountSnapshot } from "~/services/checkin/autoCheckin/accountSnapshot"
import { inspectCheckInMethods } from "~/services/checkin/autoCheckin/domain"
import { executeAccountCheckin } from "~/services/checkin/autoCheckin/execution/accountExecution"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { apiKeyCasaProvider } from "~/services/checkin/autoCheckin/providers/apiKeyCasa"
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/scheduling/refresh"
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
  "~/services/apiService/sub2api/checkin/apiKeyCasaCheckIn",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/checkin/apiKeyCasaCheckIn")
    >()),
    fetchApiKeyCasaDailyCheckInStatus: vi.fn(),
    performApiKeyCasaDailyCheckIn: vi.fn(),
  }),
)

const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.ApiKeyCasaDailyCheckIn

const createAccount = () =>
  buildSiteAccount({
    id: "apikey-casa-account",
    site_url: "https://apikey.casa",
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
  evidence: { source: "probe" as const, observedAt: 200 },
}

describe("ApiKey Casa check-in provider", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(fetchApiKeyCasaDailyCheckInStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: false,
    })
    vi.mocked(performApiKeyCasaDailyCheckIn).mockResolvedValue(undefined)
  })

  afterEach(() => vi.restoreAllMocks())

  it.each([
    ["2026-11-26T15:59Z", "2026-11-26T16:01Z", true, "outdated"],
    ["2026-11-26T23:59Z", "2026-11-27T00:01Z", false, "current"],
  ] as const)(
    "expires checked status on the Beijing day (%s to %s)",
    (start, end, eligible, display) => {
      const account = createAccount()
      const observedAt = Date.parse(start)
      const now = Date.parse(end)
      vi.spyOn(Date, "now").mockReturnValue(now)
      account.checkIn.methodKnowledge.methods[METHOD_ID]!.status = {
        ...notCheckedStatus,
        today: "checked",
        evidence: { source: "probe", observedAt },
      }
      expect(
        inspectCheckInMethods({
          config: account.checkIn,
          candidateMethodIds: [METHOD_ID],
          timeZone: "UTC",
          now,
        }).executionEligibility.eligible,
      ).toBe(eligible)
      expect(
        getSiteCheckInDisplayState({
          checkIn: account.checkIn,
          siteType: SITE_TYPES.SUB2API,
          baseUrl: account.site_url,
        })?.kind,
      ).toBe(display)
      const snapshot = buildAutoCheckinAccountSnapshot(account, "Casa")
      expect(snapshot.isCheckedInToday).toBe(eligible ? undefined : true)
      expect(snapshot.skipReason).toBe(
        eligible ? undefined : "already_checked_today",
      )
    },
  )

  it("offers the method to Sub2API accounts", () => {
    expect(
      autoCheckinMethodRegistry
        .getCandidates(SITE_TYPES.SUB2API, "https://apikey.casa/redeem")
        .map((candidate) => candidate.id),
    ).toContain(METHOD_ID)

    expect(
      autoCheckinMethodRegistry
        .getCandidates(SITE_TYPES.SUB2API, "https://another.example")
        .map((candidate) => candidate.id),
    ).toContain(METHOD_ID)

    expect(
      autoCheckinMethodRegistry
        .getCandidates(SITE_TYPES.NEW_API, "https://apikey.casa")
        .map((candidate) => candidate.id),
    ).not.toContain(METHOD_ID)
  })

  it("reads eligibility again when the admission GET crosses Beijing midnight", async () => {
    let now = Date.parse("2026-11-26T15:59:59Z")
    vi.spyOn(Date, "now").mockImplementation(() => now)
    vi.mocked(fetchApiKeyCasaDailyCheckInStatus)
      .mockImplementationOnce(async () => {
        now = Date.parse("2026-11-26T16:00:01Z")
        return { enabled: true, checkedInToday: false }
      })
      .mockResolvedValueOnce({ enabled: true, checkedInToday: true })
    const result = await executeSelectedCheckIn({
      account: createAccount(),
      globalAutomaticExecutionEnabled: true,
      context: executionContext(),
    })
    expect(result).toMatchObject({ kind: "skipped", reason: "already_checked" })
    expect(fetchApiKeyCasaDailyCheckInStatus).toHaveBeenCalledTimes(2)
    expect(performApiKeyCasaDailyCheckIn).not.toHaveBeenCalled()
  })

  it("discovers status without submitting a claim", async () => {
    await expect(
      apiKeyCasaProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ detection: { outcome: "matched" } })
    expect(fetchApiKeyCasaDailyCheckInStatus).toHaveBeenCalledOnce()
    expect(fetchApiKeyCasaDailyCheckInStatus).toHaveBeenCalledWith(
      expect.anything(),
      { allowAuthenticationRecovery: false },
    )
    expect(performApiKeyCasaDailyCheckIn).not.toHaveBeenCalled()
  })

  it("uses a single credential recovery opportunity across an explicit verification at Beijing midnight", async () => {
    const account = createAccount()
    let now = Date.parse("2026-11-26T15:59:59Z")
    vi.spyOn(Date, "now").mockImplementation(() => now)
    vi.mocked(fetchApiKeyCasaDailyCheckInStatus)
      .mockImplementationOnce(async () => {
        now = Date.parse("2026-11-26T16:00:01Z")
        return { enabled: true, checkedInToday: true }
      })
      .mockResolvedValueOnce({ enabled: true, checkedInToday: false })
    const config = await refreshSelectedStatus({
      account,
      config: account.checkIn,
      siteType: account.site_type,
      verification: userCommandExecution(
        PROTECTION_BYPASS_USER_COMMANDS.VerifyCheckinStatus,
      ),
    })
    expect(config.methodKnowledge.methods[METHOD_ID]?.status).toMatchObject({
      today: "not_checked",
      evidence: { observedAt: now },
    })
    expect(
      vi
        .mocked(fetchApiKeyCasaDailyCheckInStatus)
        .mock.calls.map(([, options]) => options?.allowAuthenticationRecovery),
    ).toEqual([true, false])
    expect(performApiKeyCasaDailyCheckIn).not.toHaveBeenCalled()
  })

  it.each(["discovery", "refresh"] as const)(
    "records a fresh observation when passive %s crosses Beijing midnight",
    async (operation) => {
      const account = createAccount()
      const beforeReset = Date.parse("2026-11-26T15:59:59Z")
      const afterReset = Date.parse("2026-11-26T16:00:01Z")
      let now = beforeReset
      vi.spyOn(Date, "now").mockImplementation(() => now)
      vi.mocked(fetchApiKeyCasaDailyCheckInStatus)
        .mockImplementationOnce(async () => {
          now = afterReset
          return { enabled: true, checkedInToday: true }
        })
        .mockResolvedValueOnce({ enabled: true, checkedInToday: false })

      const status =
        operation === "discovery"
          ? await apiKeyCasaProvider.detect!({
              account,
              observedAt: beforeReset,
            })
          : (
              await refreshSelectedStatus({
                account,
                config: account.checkIn,
                siteType: account.site_type,
                observedAt: beforeReset,
              })
            ).methodKnowledge.methods[METHOD_ID]

      expect(status).toMatchObject({
        status: { today: "not_checked", evidence: { observedAt: afterReset } },
      })
      expect(fetchApiKeyCasaDailyCheckInStatus).toHaveBeenCalledTimes(2)
      expect(performApiKeyCasaDailyCheckIn).not.toHaveBeenCalled()
    },
  )

  it("blocks submission unless the current status proves an enabled unchecked claim", async () => {
    await expect(
      apiKeyCasaProvider.checkIn(createAccount(), executionContext()),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
    })
    expect(performApiKeyCasaDailyCheckIn).not.toHaveBeenCalled()

    await expect(
      apiKeyCasaProvider.checkIn(createAccount(), {
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
    expect(performApiKeyCasaDailyCheckIn).not.toHaveBeenCalled()
  })

  it("confirms the completed day without attributing the advertised reward", async () => {
    const context = executionContext()
    const execution = await executeSelectedCheckIn({
      account: createAccount(),
      globalAutomaticExecutionEnabled: true,
      context,
    })
    expect(execution).toMatchObject({
      kind: "executed",
      result: { status: CHECKIN_RESULT_STATUS.SUCCESS },
    })
    expect(execution).not.toHaveProperty("result.awards")
    expect(performApiKeyCasaDailyCheckIn).toHaveBeenCalledOnce()
    expect(fetchApiKeyCasaDailyCheckInStatus).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        ...context,
        directRequestReason: undefined,
      }),
      expect.objectContaining({ allowAuthenticationRecovery: true }),
    )
  })

  it.each([
    { readback: "checked", imported: false },
    { readback: "checked_disabled", imported: false },
    { readback: "not_checked", imported: false },
    { readback: "not_checked", imported: true },
    { readback: "unavailable", imported: false },
  ])(
    "keeps a grant spanning Beijing midnight and saves verified status (readback=$readback, imported=$imported)",
    async ({ readback, imported }) => {
      const account = createAccount()
      account.configVersion = CURRENT_CONFIG_VERSION
      if (imported) {
        account.checkIn.selection = { mode: "manual", methodId: METHOD_ID }
        account.checkIn.methodKnowledge.methods = {}
      }
      await accountConfigStore.mutate((config) => {
        config.accounts = [account]
        return { changed: true, result: undefined }
      })

      const beforeReset = Date.parse("2026-11-26T15:59:59Z")
      const afterReset = Date.parse("2026-11-26T16:00:01Z")
      let now = beforeReset
      vi.spyOn(Date, "now").mockImplementation(() => now)
      vi.mocked(performApiKeyCasaDailyCheckIn).mockImplementationOnce(
        async () => {
          now = afterReset
        },
      )
      vi.mocked(fetchApiKeyCasaDailyCheckInStatus).mockImplementation(
        async () => {
          if (now === afterReset && readback === "unavailable")
            throw new Error("read unavailable")
          return {
            enabled: now !== afterReset || readback !== "checked_disabled",
            checkedInToday:
              now === afterReset &&
              (readback === "checked" || readback === "checked_disabled"),
          }
        },
      )
      const context = executionContext()
      const { result } = await executeAccountCheckin(
        account,
        "Casa",
        context.tempWindowRequestSource,
        context.protectionBypassExecution,
      )
      expect(result.status).toBe(CHECKIN_RESULT_STATUS.SUCCESS)
      expect(performApiKeyCasaDailyCheckIn).toHaveBeenCalledOnce()
      expect(fetchApiKeyCasaDailyCheckInStatus).toHaveBeenCalledTimes(
        imported ? 3 : 2,
      )
      const saved = await accountQueries.getAccountById(account.id)
      expect(
        saved?.checkIn.methodKnowledge.methods[METHOD_ID]?.status,
      ).toMatchObject({
        availability: readback === "checked_disabled" ? "disabled" : "enabled",
        today:
          readback === "checked" || readback === "checked_disabled"
            ? "checked"
            : "not_checked",
        evidence: {
          observedAt: readback === "unavailable" ? beforeReset : afterReset,
        },
      })
      if (readback !== "unavailable")
        expect(result.accountStateDurability).toBe("persisted")
    },
  )

  it.each([
    { enabled: true, checkedInToday: true, reason: "already_checked" },
    { enabled: false, checkedInToday: false, reason: "method_disabled" },
  ])(
    "skips the claim when the server reports $reason",
    async ({ enabled, checkedInToday, reason }) => {
      vi.mocked(fetchApiKeyCasaDailyCheckInStatus).mockResolvedValue({
        enabled,
        checkedInToday,
      })
      await expect(
        executeSelectedCheckIn({
          account: createAccount(),
          globalAutomaticExecutionEnabled: true,
          context: executionContext(),
        }),
      ).resolves.toMatchObject({ kind: "skipped", reason })
      expect(performApiKeyCasaDailyCheckIn).not.toHaveBeenCalled()
    },
  )

  it.each([true, false])(
    "does not infer the outcome of a lost claim from another Beijing day (checked=%s)",
    async (checkedInToday) => {
      let now = Date.parse("2026-11-26T15:59:59Z")
      vi.spyOn(Date, "now").mockImplementation(() => now)
      vi.mocked(fetchApiKeyCasaDailyCheckInStatus)
        .mockResolvedValueOnce({ enabled: true, checkedInToday: false })
        .mockResolvedValueOnce({ enabled: true, checkedInToday })
      vi.mocked(performApiKeyCasaDailyCheckIn).mockImplementationOnce(
        async (request) => {
          request.observer?.onDispatch()
          now = Date.parse("2026-11-26T16:00:01Z")
          throw new TypeError("Failed to fetch")
        },
      )
      const account = createAccount()
      account.configVersion = CURRENT_CONFIG_VERSION
      await accountConfigStore.mutate((config) => {
        config.accounts = [account]
        return { changed: true, result: undefined }
      })
      const context = executionContext()
      const { result } = await executeAccountCheckin(
        account,
        "Casa",
        context.tempWindowRequestSource,
        context.protectionBypassExecution,
      )
      expect(result).toMatchObject({ status: "uncertain", retryable: false })
      const saved = await accountQueries.getAccountById(account.id)
      expect(
        saved?.checkIn.methodKnowledge.methods[METHOD_ID]?.status,
      ).toMatchObject({
        today: checkedInToday ? "checked" : "not_checked",
        evidence: { observedAt: now },
      })
      expect(performApiKeyCasaDailyCheckIn).toHaveBeenCalledOnce()
    },
  )

  it.each([true, false])(
    "reads status after a lost response without replay (checked=%s)",
    async (checkedInToday) => {
      vi.mocked(fetchApiKeyCasaDailyCheckInStatus)
        .mockResolvedValueOnce({ enabled: true, checkedInToday: false })
        .mockResolvedValue({ enabled: true, checkedInToday })
      vi.mocked(performApiKeyCasaDailyCheckIn).mockImplementation(
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
      expect(result).toMatchObject({ kind: "executed", retryable: false })
      if (!checkedInToday)
        expect(result).not.toMatchObject({
          result: { status: CHECKIN_RESULT_STATUS.SUCCESS },
        })
      expect(result).not.toHaveProperty("result.awards")
      expect(
        vi.mocked(fetchApiKeyCasaDailyCheckInStatus).mock.calls.length,
      ).toBeGreaterThanOrEqual(2)
      expect(performApiKeyCasaDailyCheckIn).toHaveBeenCalledOnce()
      expect(
        vi.mocked(fetchApiKeyCasaDailyCheckInStatus).mock.calls[1]?.[1],
      ).toEqual({
        allowAuthenticationRecovery: false,
      })
    },
  )
})
