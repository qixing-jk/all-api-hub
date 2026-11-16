import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
import { canAutomaticallyRetryCheckinResult } from "~/services/checkin/autoCheckin/execution/resultPolicy"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import type { AutoCheckinProvider } from "~/services/checkin/autoCheckin/providers/contracts"
import { voApiV2Provider } from "~/services/checkin/autoCheckin/providers/voapiV2"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { server } from "~~/tests/msw/server"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildCheckInConfig } from "~~/tests/test-utils/factories"

const {
  mockResyncVoApiV2AuthToken,
  mockUpdateAccount,
  mockSubmitVoApiV2CheckIn,
  mockFetchVoApiV2CheckInStats,
} = vi.hoisted(() => ({
  mockResyncVoApiV2AuthToken: vi.fn(),
  mockUpdateAccount: vi.fn(),
  mockSubmitVoApiV2CheckIn: vi.fn(),
  mockFetchVoApiV2CheckInStats: vi.fn(),
}))

vi.mock("~/services/apiService/voapiV2/checkIn", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/apiService/voapiV2/checkIn")
    >()

  return {
    ...actual,
    submitVoApiV2CheckIn: (
      ...args: Parameters<typeof actual.submitVoApiV2CheckIn>
    ) => {
      mockSubmitVoApiV2CheckIn(...args)
      return actual.submitVoApiV2CheckIn(...args)
    },
    fetchVoApiV2CheckInStats: (
      ...args: Parameters<typeof actual.fetchVoApiV2CheckInStats>
    ) => {
      mockFetchVoApiV2CheckInStats(...args)
      return actual.fetchVoApiV2CheckInStats(...args)
    },
  }
})

vi.mock("~/services/apiService/voapiV2/tokenResync", () => ({
  resyncVoApiV2AuthToken: mockResyncVoApiV2AuthToken,
}))

vi.mock("~/services/accounts/accountStorage/accountMutations", () => ({
  accountMutations: {
    updateAccount: mockUpdateAccount,
  },
}))

const account = {
  id: "account-1",
  site_type: SITE_TYPES.VO_API_V2,
  site_url: "https://example.invalid",
  account_info: {
    id: "7",
    access_token: "jwt-dashboard",
  },
  checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
} as unknown as SiteAccount

const DEFAULT_PROVIDER_CONTEXT = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
} as const

const checkInForTest = (
  account: Parameters<typeof voApiV2Provider.checkIn>[0],
  context: Parameters<
    typeof voApiV2Provider.checkIn
  >[1] = DEFAULT_PROVIDER_CONTEXT,
) => voApiV2Provider.checkIn(account, context)

describe("voApiV2Provider", () => {
  it.each([0, 1])(
    "keeps unavailable stats uncertain when both final reads cross local days for submit code %s",
    async (code) => {
      const startedAt = new Date(2026, 0, 31, 23, 59, 59).getTime()
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(startedAt)
      let reads = 0
      try {
        server.use(
          http.post("https://example.invalid/api/check_in", () =>
            HttpResponse.json({
              code,
              data: { amount: "0.1", bonusAmount: "0" },
            }),
          ),
          http.get("https://example.invalid/api/check_in/stats", () => {
            reads++
            if (reads === 2) {
              vi.setSystemTime(new Date(2026, 1, 1, 23, 59, 59))
            } else if (reads === 3) {
              vi.setSystemTime(new Date(2026, 1, 2, 0, 0, 1))
            }
            return HttpResponse.json({
              code: 0,
              data: { todaySigned: reads > 1 },
            })
          }),
        )
        const outcome = await executeSelectedCheckIn({
          account: {
            ...account,
            checkIn: createCompatibilityCheckInConfig({
              siteType: SITE_TYPES.VO_API_V2,
              supported: true,
              automaticExecutionEnabled: true,
            }),
          },
          globalAutomaticExecutionEnabled: true,
          context: DEFAULT_PROVIDER_CONTEXT,
        })
        expect(outcome).toMatchObject({
          kind: "executed",
          result: {
            status: "uncertain",
            reasonCode: "checkin_unconfirmed",
            reconciliation: "unavailable",
          },
          confirmation: { kind: "unavailable" },
        })
        if (outcome.kind === "executed") {
          expect(
            canAutomaticallyRetryCheckinResult(
              outcome.result,
              outcome.methodId,
            ),
          ).toBe(true)
        }
        expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledOnce()
        expect(mockResyncVoApiV2AuthToken).not.toHaveBeenCalled()
        expect(reads).toBe(3)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it.each([0, 1])(
    "keeps accepted submit code %s uncertain when final stats omit todaySigned",
    async (code) => {
      let reads = 0
      server.use(
        http.post("https://example.invalid/api/check_in", () =>
          HttpResponse.json({
            code,
            data: { amount: "0.1", bonusAmount: "0" },
          }),
        ),
        http.get("https://example.invalid/api/check_in/stats", () =>
          HttpResponse.json({
            code: 0,
            data: ++reads === 1 ? { todaySigned: false } : {},
          }),
        ),
      )
      const outcome = await executeSelectedCheckIn({
        account: {
          ...account,
          checkIn: createCompatibilityCheckInConfig({
            siteType: SITE_TYPES.VO_API_V2,
            supported: true,
            automaticExecutionEnabled: true,
          }),
        },
        globalAutomaticExecutionEnabled: true,
        context: DEFAULT_PROVIDER_CONTEXT,
      })
      expect(outcome).toMatchObject({
        kind: "executed",
        result: {
          status: "uncertain",
          reasonCode: "checkin_unconfirmed",
          reconciliation: "unavailable",
        },
        confirmation: { kind: "unavailable" },
      })
      if (outcome.kind === "executed") {
        expect(
          canAutomaticallyRetryCheckinResult(outcome.result, outcome.methodId),
        ).toBe(true)
      }
      expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledOnce()
      expect(mockResyncVoApiV2AuthToken).not.toHaveBeenCalled()
      expect(reads).toBe(2)
    },
  )

  it.each([0, 1])(
    "keeps observed completion scoped across rollover for submit code %s",
    async (code) => {
      const startedAt = new Date(2026, 0, 31, 23, 59, 59).getTime()
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(startedAt)
      let reads = 0
      try {
        server.use(
          http.post("https://example.invalid/api/check_in", () =>
            HttpResponse.json({
              code,
              data: { amount: "0.1", bonusAmount: "0" },
            }),
          ),
          http.get("https://example.invalid/api/check_in/stats", () => {
            reads++
            if (reads === 2) {
              vi.setSystemTime(startedAt + 2_000)
              return HttpResponse.json({ code: 0, data: { todaySigned: true } })
            }
            return HttpResponse.json({ code: 0, data: { todaySigned: false } })
          }),
        )
        const outcome = await executeSelectedCheckIn({
          account: {
            ...account,
            checkIn: createCompatibilityCheckInConfig({
              siteType: SITE_TYPES.VO_API_V2,
              supported: true,
              automaticExecutionEnabled: true,
            }),
          },
          globalAutomaticExecutionEnabled: true,
          context: DEFAULT_PROVIDER_CONTEXT,
        })
        expect(outcome).toMatchObject({
          kind: "executed",
          result: { status: "failed", reasonCode: "upstream_rejected" },
          confirmation: { kind: "observed" },
        })
        expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledOnce()
        expect(reads).toBe(3)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it("carries current VoAPI stats confirmation without a redundant outer GET", async () => {
    let reads = 0
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({ code: 1 }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 0, data: { todaySigned: ++reads > 1 } }),
      ),
    )
    const outcome = await executeSelectedCheckIn({
      account: {
        ...account,
        checkIn: createCompatibilityCheckInConfig({
          siteType: SITE_TYPES.VO_API_V2,
          supported: true,
          automaticExecutionEnabled: true,
        }),
      },
      globalAutomaticExecutionEnabled: true,
      context: DEFAULT_PROVIDER_CONTEXT,
    })
    expect(outcome).toMatchObject({
      kind: "executed",
      result: { status: "already_checked" },
      confirmation: { kind: "observed" },
    })
    expect(reads).toBe(2)
    expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledOnce()
  })

  it("does not replay a completed submit when only its stats read rejects authentication", async () => {
    mockResyncVoApiV2AuthToken.mockResolvedValue({
      accessToken: "renewed",
      userId: "7",
      source: "existing_tab",
    })
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({
          code: 0,
          data: { amount: "0.1", bonusAmount: "0" },
        }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 2, data: null, msg: "Auth expire" }),
      ),
    )
    const result = await checkInForTest(account)
    expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledOnce()
    expect(mockResyncVoApiV2AuthToken).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: "failed",
      confirmation: { kind: "unavailable" },
    })
  })

  it("preserves uncertainty when a dispatched submit's stats response is lost", async () => {
    let reads = 0
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({
          code: 0,
          data: { amount: "0.1", bonusAmount: "0" },
        }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        ++reads === 1
          ? HttpResponse.json({ code: 0, data: { todaySigned: false } })
          : HttpResponse.error(),
      ),
    )
    const outcome = await executeSelectedCheckIn({
      account: {
        ...account,
        checkIn: createCompatibilityCheckInConfig({
          siteType: SITE_TYPES.VO_API_V2,
          supported: true,
          automaticExecutionEnabled: true,
        }),
      },
      globalAutomaticExecutionEnabled: true,
      context: DEFAULT_PROVIDER_CONTEXT,
    })
    expect(outcome).toMatchObject({
      kind: "executed",
      result: { status: "uncertain", reconciliation: "unavailable" },
      confirmation: { kind: "unavailable" },
    })
    expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledOnce()
    expect(reads).toBe(2)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockResyncVoApiV2AuthToken.mockResolvedValue(null)
    mockUpdateAccount.mockResolvedValue(true)
  })

  it("registers the VoAPI v2 auto-check-in provider", () => {
    expect(
      autoCheckinMethodRegistry.resolveById(
        AUTO_CHECKIN_METHOD_IDS.VoApiV2DailyCheckIn,
      )?.provider,
    ).toBe(voApiV2Provider as AutoCheckinProvider)
  })

  it("accepts only a boolean GET status and treats malformed data as unknown", async () => {
    server.use(
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 0, data: { todaySigned: false } }),
      ),
    )
    await expect(
      voApiV2Provider.detect!({ account, observedAt: 230 }),
    ).resolves.toMatchObject({
      detection: { outcome: "matched" },
      status: { outcome: "known", today: "not_checked" },
    })
    expect(mockSubmitVoApiV2CheckIn).not.toHaveBeenCalled()

    server.use(
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 0, data: {} }),
      ),
    )
    await expect(
      voApiV2Provider.detect!({ account, observedAt: 231 }),
    ).resolves.toEqual({
      outcome: "unknown",
      reason: "invalid_response",
      attemptedAt: 231,
    })
  })

  it("propagates the discovery abort signal to the stats request", async () => {
    server.use(
      http.get(
        "https://example.invalid/api/check_in/stats",
        async () => new Promise<never>(() => undefined),
      ),
    )
    const controller = new AbortController()

    const detection = voApiV2Provider.detect!({
      account,
      observedAt: 232,
      signal: controller.signal,
    })

    await vi.waitFor(() => {
      expect(mockFetchVoApiV2CheckInStats).toHaveBeenCalled()
    })
    controller.abort()

    expect(mockFetchVoApiV2CheckInStats).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    )
    await expect(detection).resolves.toEqual({
      outcome: "unknown",
      reason: "invalid_response",
      attemptedAt: 232,
    })
  })

  it("propagates the popup source through VoAPI v2 check-in and stats requests", async () => {
    server.use(
      http.post("https://example.invalid/api/check_in", ({ request }) => {
        expect(request.headers.get("authorization")).toBe("jwt-dashboard")
        return HttpResponse.json({
          code: 0,
          data: { amount: "0.1", bonusAmount: "0" },
        })
      }),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 0, data: { todaySigned: true } }),
      ),
    )

    await expect(
      checkInForTest(account, {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        ),
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.SUCCESS })
    expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }),
    )
    expect(mockFetchVoApiV2CheckInStats).toHaveBeenCalledWith(
      expect.objectContaining({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }),
    )
  })

  it("treats repeated same-day sign-in as already checked", async () => {
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({ code: 1, data: null, msg: "No action performed" }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 0, data: { todaySigned: true } }),
      ),
    )

    await expect(checkInForTest(account)).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    })
    expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      }),
    )
  })

  it("does not treat protocol code 1 as already checked without status confirmation", async () => {
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({ code: 1, data: null, msg: "Request rejected" }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 0, data: { todaySigned: false } }),
      ),
    )

    await expect(checkInForTest(account)).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
    })
  })

  it("does not run without the saved dashboard JWT", () => {
    expect(
      voApiV2Provider.getReadiness({
        ...account,
        account_info: { ...account.account_info, access_token: "" },
      } as SiteAccount),
    ).toEqual({ ready: false, reason: "credentials_missing" })
  })

  it("leaves automatic-execution intent to the Module", () => {
    expect(
      voApiV2Provider.getReadiness({
        ...account,
        checkIn: {
          ...account.checkIn,
          automaticExecutionEnabled: false,
        },
      }),
    ).toEqual({ ready: true })
  })

  it.each([0, 1])(
    "preserves failed classification for submit code %s with explicit final todaySigned=false",
    async (code) => {
      let reads = 0
      server.use(
        http.post("https://example.invalid/api/check_in", () =>
          HttpResponse.json({
            code,
            data: { amount: "0.1", bonusAmount: "0" },
          }),
        ),
        http.get("https://example.invalid/api/check_in/stats", () => {
          reads++
          return HttpResponse.json({ code: 0, data: { todaySigned: false } })
        }),
      )

      const outcome = await executeSelectedCheckIn({
        account: {
          ...account,
          checkIn: createCompatibilityCheckInConfig({
            siteType: SITE_TYPES.VO_API_V2,
            supported: true,
            automaticExecutionEnabled: true,
          }),
        },
        globalAutomaticExecutionEnabled: true,
        context: DEFAULT_PROVIDER_CONTEXT,
      })
      expect(outcome).toMatchObject({
        kind: "executed",
        result: { status: "failed", reasonCode: "upstream_rejected" },
        confirmation: {
          kind: "observed",
          status: { outcome: "known", today: "not_checked" },
        },
      })
      expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledOnce()
      expect(mockResyncVoApiV2AuthToken).not.toHaveBeenCalled()
      expect(reads).toBe(2)
    },
  )

  it("returns a provider error result when an expired JWT cannot be resynced", async () => {
    mockResyncVoApiV2AuthToken.mockResolvedValueOnce(null)
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({
          code: 2,
          data: null,
          msg: "Auth expire",
        }),
      ),
    )

    await expect(checkInForTest(account)).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
      rawMessage: "Auth expire",
      confirmation: { kind: "unavailable", userId: "7" },
    })
    expect(mockResyncVoApiV2AuthToken).toHaveBeenCalledWith(
      "https://example.invalid",
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      DEFAULT_PROVIDER_CONTEXT.protectionBypassExecution,
      "7",
    )
    expect(mockUpdateAccount).not.toHaveBeenCalled()
    expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledOnce()
    expect(mockFetchVoApiV2CheckInStats).not.toHaveBeenCalled()
  })

  it("keeps a failed token resync retryable after an auth-expired refusal", async () => {
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    mockResyncVoApiV2AuthToken.mockRejectedValueOnce(
      new Error("dashboard token resync unavailable"),
    )
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({ code: 2, data: null, msg: "Auth expire" }),
      ),
    )

    const result = await checkInForTest(account, {
      ...DEFAULT_PROVIDER_CONTEXT,
      mutationLifecycle,
    })
    expect(result).toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: "dashboard token resync unavailable",
    })
    expect(
      canAutomaticallyRetryCheckinResult(
        result,
        AUTO_CHECKIN_METHOD_IDS.VoApiV2DailyCheckIn,
      ),
    ).toBe(true)
    expect(mutationLifecycle.dispatched).toBe(false)
  })

  it.each([
    { entrypoint: "provider", resyncedUserId: "8" },
    { entrypoint: "executor", resyncedUserId: "8" },
    { entrypoint: "provider", resyncedUserId: null },
    { entrypoint: "executor", resyncedUserId: null },
  ])(
    "rejects unusable browser recovery without updating auth or replaying: %j",
    async ({ entrypoint, resyncedUserId }) => {
      const mutationLifecycle = createAutoCheckinMutationLifecycle()
      const postAuthorizations: (string | null)[] = []
      let statsReads = 0
      mockResyncVoApiV2AuthToken.mockResolvedValueOnce(
        resyncedUserId
          ? {
              accessToken: "foreign-dashboard-token",
              userId: resyncedUserId,
              username: "foreign-owner",
              source: "existing_tab",
            }
          : null,
      )
      server.use(
        http.post("https://example.invalid/api/check_in", ({ request }) => {
          postAuthorizations.push(request.headers.get("authorization"))
          return HttpResponse.json({ code: 2, data: null, msg: "Auth expire" })
        }),
        http.get("https://example.invalid/api/check_in/stats", () => {
          statsReads++
          return HttpResponse.json({ code: 0, data: { todaySigned: false } })
        }),
      )

      const outcome =
        entrypoint === "provider"
          ? await checkInForTest(account, {
              ...DEFAULT_PROVIDER_CONTEXT,
              mutationLifecycle,
            })
          : await executeSelectedCheckIn({
              account: {
                ...account,
                checkIn: createCompatibilityCheckInConfig({
                  siteType: SITE_TYPES.VO_API_V2,
                  supported: true,
                  automaticExecutionEnabled: true,
                }),
              },
              globalAutomaticExecutionEnabled: true,
              context: DEFAULT_PROVIDER_CONTEXT,
            })
      const result = (() => {
        if (!("kind" in outcome)) return outcome
        expect(outcome).toMatchObject({ kind: "executed", retryable: false })
        if (outcome.kind !== "executed") throw new Error("Check-in was skipped")
        return outcome.result
      })()
      expect(result).toMatchObject({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
        rawMessage: "Auth expire",
      })
      expect(mockResyncVoApiV2AuthToken).toHaveBeenCalledWith(
        "https://example.invalid",
        TEMP_WINDOW_REQUEST_SOURCES.Background,
        DEFAULT_PROVIDER_CONTEXT.protectionBypassExecution,
        "7",
      )
      expect(
        canAutomaticallyRetryCheckinResult(
          result,
          AUTO_CHECKIN_METHOD_IDS.VoApiV2DailyCheckIn,
        ),
      ).toBe(false)
      expect(postAuthorizations).toEqual(["jwt-dashboard"])
      // The executor's admission read happens before the rejected submit.
      expect(statsReads).toBe(entrypoint === "executor" ? 1 : 0)
      expect(mockUpdateAccount).not.toHaveBeenCalled()
      expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledOnce()
      expect(mutationLifecycle).toMatchObject({
        dispatched: false,
        responseReceived: false,
      })
    },
  )

  it("keeps a failed auth persistence step retryable after an auth-expired refusal", async () => {
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    mockResyncVoApiV2AuthToken.mockResolvedValueOnce({
      accessToken: "resynced-dashboard-token",
      userId: "7",
      username: "resynced-owner",
      source: "existing_tab",
    })
    mockUpdateAccount.mockRejectedValueOnce(
      new Error("account auth persistence unavailable"),
    )
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({ code: 2, data: null, msg: "Auth expire" }),
      ),
    )

    const result = await checkInForTest(account, {
      ...DEFAULT_PROVIDER_CONTEXT,
      mutationLifecycle,
    })
    expect(result).toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: "account auth persistence unavailable",
    })
    expect(
      canAutomaticallyRetryCheckinResult(
        result,
        AUTO_CHECKIN_METHOD_IDS.VoApiV2DailyCheckIn,
      ),
    ).toBe(true)
    expect(mutationLifecycle.dispatched).toBe(false)
    expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledTimes(1)
  })

  it("reports generic backend failures without dashboard JWT re-sync", async () => {
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json(
          { code: 500, data: null, msg: "Backend unavailable" },
          { status: 500 },
        ),
      ),
    )

    await expect(checkInForTest(account)).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
    })
    expect(mockResyncVoApiV2AuthToken).not.toHaveBeenCalled()
  })

  it.each(["provider", "executor"])(
    "re-syncs the same user's expired dashboard JWT before retrying through the %s",
    async (entrypoint) => {
      const mutationLifecycle = createAutoCheckinMutationLifecycle()
      const postAuthorizations: (string | null)[] = []
      const statsAuthorizations: (string | null)[] = []
      mockResyncVoApiV2AuthToken.mockResolvedValueOnce({
        accessToken: "resynced-dashboard-token",
        userId: "7",
        username: "resynced-owner",
        source: "existing_tab",
      })

      server.use(
        http.post("https://example.invalid/api/check_in", ({ request }) => {
          const authorization = request.headers.get("authorization")
          postAuthorizations.push(authorization)
          if (authorization === "jwt-dashboard") {
            return HttpResponse.json({
              code: 2,
              data: null,
              msg: "Auth expire",
            })
          }

          return HttpResponse.json({
            code: 0,
            data: { amount: "0.1", bonusAmount: "0" },
          })
        }),
        http.get(
          "https://example.invalid/api/check_in/stats",
          ({ request }) => {
            const authorization = request.headers.get("authorization")
            statsAuthorizations.push(authorization)
            return HttpResponse.json({
              code: 0,
              data: {
                todaySigned: authorization === "resynced-dashboard-token",
              },
            })
          },
        ),
      )

      const context = {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        ),
        mutationLifecycle,
      }
      const outcome =
        entrypoint === "provider"
          ? await checkInForTest(account, context)
          : await executeSelectedCheckIn({
              account: {
                ...account,
                checkIn: createCompatibilityCheckInConfig({
                  siteType: SITE_TYPES.VO_API_V2,
                  supported: true,
                  automaticExecutionEnabled: true,
                }),
              },
              globalAutomaticExecutionEnabled: true,
              context,
            })
      const result = (() => {
        if (!("kind" in outcome)) return outcome
        expect(outcome.kind).toBe("executed")
        if (outcome.kind !== "executed") throw new Error("Check-in was skipped")
        return outcome.result
      })()
      expect(result).toMatchObject({ status: CHECKIN_RESULT_STATUS.SUCCESS })
      expect(outcome).toMatchObject({
        confirmation: { kind: "observed", userId: "7" },
      })

      expect(postAuthorizations).toEqual([
        "jwt-dashboard",
        "resynced-dashboard-token",
      ])
      expect(statsAuthorizations).toEqual(
        entrypoint === "executor"
          ? ["jwt-dashboard", "resynced-dashboard-token"]
          : ["resynced-dashboard-token"],
      )
      expect(mockResyncVoApiV2AuthToken).toHaveBeenCalledWith(
        "https://example.invalid",
        TEMP_WINDOW_REQUEST_SOURCES.Popup,
        DEFAULT_PROVIDER_CONTEXT.protectionBypassExecution,
        "7",
      )
      expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledTimes(2)
      for (const [request] of mockSubmitVoApiV2CheckIn.mock.calls) {
        expect(request).toMatchObject({
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
          protectionBypassExecution:
            DEFAULT_PROVIDER_CONTEXT.protectionBypassExecution,
        })
      }
      const replayRequest = mockSubmitVoApiV2CheckIn.mock.calls[1]?.[0]
      expect(replayRequest).toBeDefined()
      if (!replayRequest) throw new Error("Check-in replay request was missing")
      expect(mockFetchVoApiV2CheckInStats).toHaveBeenCalledWith(
        expect.objectContaining({
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
          auth: expect.objectContaining({ userId: "7" }),
          observer: replayRequest.observer,
        }),
      )
      expect(mockUpdateAccount).toHaveBeenCalledWith(
        "account-1",
        expect.objectContaining({
          account_info: expect.objectContaining({
            access_token: "resynced-dashboard-token",
            id: "7",
            username: "resynced-owner",
          }),
        }),
        expect.any(Object),
      )
    },
  )
})
