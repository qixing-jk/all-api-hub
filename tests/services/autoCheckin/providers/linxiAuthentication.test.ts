import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import type {
  Sub2ApiAuthSessionRequest,
  Sub2ApiPersistAuthUpdate,
  Sub2ApiStoredAuthSnapshot,
} from "~/services/apiService/sub2api/auth/authSession"
import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import { fetchApi, fetchApiResponse } from "~/services/apiTransport/request"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { linxiProvider } from "~/services/checkin/autoCheckin/providers/linxiCheckIn"
import {
  PROTECTION_BYPASS_AUTOMATIC_FEATURES,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
} from "~/services/protectionBypass/contracts"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { automaticExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApi: vi.fn(),
  fetchApiResponse: vi.fn(),
}))
vi.mock(
  "~/services/apiService/sub2api/auth/browserAuth",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/browserAuth")
    >()),
    recoverSub2ApiBrowserAuth: vi.fn(),
  }),
)
vi.mock(
  "~/services/apiService/sub2api/auth/tokenRefresh",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/tokenRefresh")
    >()),
    refreshSub2ApiTokens: vi.fn(),
  }),
)
vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createAccountApiRequestFromStoredAccount: () => ({ request }),
}))

const methodId = AUTO_CHECKIN_METHOD_IDS.LinxiDailyCheckIn
const day = "2026-11-24"
const baseUrl = "https://sub.100xlabs.space"
const account = () =>
  buildSiteAccount({
    id: "linxi-auth-test",
    site_type: SITE_TYPES.SUB2API,
    site_url: baseUrl,
    account_info: {
      ...buildSiteAccount().account_info,
      id: "42",
      access_token: "expired-access",
    },
    checkIn: {
      automaticExecutionEnabled: true,
      selection: { mode: "manual", methodId },
      methodKnowledge: {
        methods: {
          [methodId]: {
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: 1 },
            },
          },
        },
      },
    },
  })
const context = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: automaticExecution(
    PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin,
    PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
  ),
}
const response = (data: unknown, status = 200) => ({
  ok: status === 200,
  status,
  headers: {},
  body: { code: status === 200 ? 0 : status, message: "fixture", data },
})
const statusData = (checked = false) => ({
  enabled: true,
  checked_in_today: checked,
  check_in_date: day,
  turnstile_required: false,
})
let stored: Sub2ApiStoredAuthSnapshot
let request: Sub2ApiAuthSessionRequest
const persist = vi.fn(
  async (_accountId: string, update: Sub2ApiPersistAuthUpdate) => {
    stored = {
      ...stored,
      accessToken: update.accessToken,
      sub2apiAuth: {
        refreshToken: update.refreshToken!,
        tokenExpiresAt: update.tokenExpiresAt,
      },
    }
    return { status: "persisted" as const }
  },
)
const execute = () =>
  executeSelectedCheckIn({
    account: account(),
    globalAutomaticExecutionEnabled: true,
    context,
  })

describe("Linxi scheduled authentication", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-24T02:00:00Z"))
    vi.clearAllMocks()
    stored = {
      origin: baseUrl,
      userId: "42",
      accessToken: "expired-access",
      sub2apiAuth: {
        refreshToken: "saved-refresh",
        tokenExpiresAt: Date.now() - 1,
      },
    }
    request = {
      accountId: "linxi-auth-test",
      baseUrl,
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      auth: {
        authType: account().authType,
        accessToken: "expired-access",
        userId: "42",
      },
      sub2apiAuthSession: {
        getLatestAuth: async () => stored,
        persistAuthUpdate: persist,
      },
    }
    vi.mocked(refreshSub2ApiTokens).mockResolvedValue({
      accessToken: "renewed-access",
      refreshToken: "renewed-refresh",
      tokenExpiresAt: Date.now() + 3_600_000,
    })
    vi.mocked(fetchApi).mockResolvedValue({
      code: 0,
      message: "fixture",
      data: { id: 42 },
    })
    vi.mocked(fetchApiResponse).mockImplementation(async (next, options) => {
      if (options.options?.method === "POST") {
        next.observer?.onDispatch()
        return response({ ...statusData(true), already_checked_in: false })
      }
      if (next.auth.accessToken === "expired-access") return response(null, 401)
      return response(statusData())
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("keeps detection passive", async () => {
    await expect(
      linxiProvider.detect!({
        account: account(),
        observedAt: Date.now(),
      }),
    ).resolves.toMatchObject({
      outcome: "unknown",
      reason: "authentication_required",
    })
    expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
  })

  it("renews and persists before admission, then hydrates the new access token for one POST", async () => {
    await expect(execute()).resolves.toMatchObject({
      kind: "executed",
      result: { status: "success" },
    })
    expect(refreshSub2ApiTokens).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledExactlyOnceWith(
      "linxi-auth-test",
      expect.objectContaining({
        accessToken: "renewed-access",
        refreshToken: "renewed-refresh",
        expectedAuth: {
          accessToken: "expired-access",
          refreshToken: "saved-refresh",
        },
      }),
    )
    expect(persist.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(fetchApiResponse).mock.invocationCallOrder[0]!,
    )
    const calls = vi.mocked(fetchApiResponse).mock.calls
    expect(calls.map(([, options]) => options.options?.method)).toEqual([
      "GET",
      "POST",
    ])
    expect(calls[0]?.[0]).toMatchObject({
      ...context,
      directRequestReason: undefined,
      auth: { accessToken: "renewed-access" },
    })
    expect(calls[1]?.[0].auth.accessToken).toBe("renewed-access")
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
  })

  it("skips a completed day after renewal without submitting", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(statusData(true)))
    await expect(execute()).resolves.toMatchObject({
      kind: "skipped",
      reason: "already_checked",
    })
    expect(refreshSub2ApiTokens).toHaveBeenCalledOnce()
    expect(fetchApiResponse).toHaveBeenCalledOnce()
    expect(vi.mocked(fetchApiResponse).mock.calls[0]?.[1].options?.method).toBe(
      "GET",
    )
  })

  it("recovers a status GET rejected with 401 before the single POST", async () => {
    stored.sub2apiAuth!.tokenExpiresAt = Date.now() + 3_600_000
    await expect(execute()).resolves.toMatchObject({
      kind: "executed",
      result: { status: "success" },
    })
    expect(
      vi
        .mocked(fetchApiResponse)
        .mock.calls.map(([, options]) => options.options?.method),
    ).toEqual(["GET", "GET", "POST"])
    expect(
      vi.mocked(fetchApiResponse).mock.calls[2]?.[0].auth.accessToken,
    ).toBe("renewed-access")
    expect(refreshSub2ApiTokens).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledOnce()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
  })

  it("stops before status or POST when the renewed pair cannot be saved", async () => {
    persist.mockRejectedValueOnce(new Error("fixture storage failure"))
    const result = await execute()
    expect(result.kind).not.toBe("executed")
    expect(fetchApiResponse).not.toHaveBeenCalled()
    expect(refreshSub2ApiTokens).toHaveBeenCalledOnce()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
  })

  it("reads back an uncertain POST without replay or another renewal", async () => {
    vi.mocked(fetchApiResponse).mockImplementation(async (next, options) => {
      if (options.options?.method === "POST") {
        next.observer?.onDispatch()
        throw new TypeError("Lost response")
      }
      return response(
        statusData(vi.mocked(fetchApiResponse).mock.calls.length > 1),
      )
    })
    await expect(execute()).resolves.toMatchObject({
      kind: "executed",
      result: { status: "success" },
    })
    expect(
      vi
        .mocked(fetchApiResponse)
        .mock.calls.map(([, options]) => options.options?.method),
    ).toEqual(["GET", "POST", "GET"])
    expect(refreshSub2ApiTokens).toHaveBeenCalledOnce()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
  })

  it("keeps a successful prior-day receipt when the POST spans Shanghai midnight", async () => {
    const submittedAt = new Date("2026-11-24T15:59:59Z")
    const receivedAt = new Date("2026-11-24T16:00:01Z")
    vi.setSystemTime(submittedAt)
    vi.mocked(fetchApiResponse).mockImplementation(async (next, options) => {
      if (options.options?.method === "POST") {
        next.observer?.onDispatch()
        vi.setSystemTime(receivedAt)
        return response({
          ...statusData(true),
          already_checked_in: false,
          reward_amount: 270,
          today_pool: "free",
        })
      }
      return response({
        ...statusData(),
        check_in_date: Date.now() === +receivedAt ? "2026-11-25" : day,
      })
    })
    await expect(execute()).resolves.toMatchObject({
      kind: "executed",
      completedAt: +submittedAt,
      result: {
        status: "success",
        awards: [{ amount: { status: "known", value: "270" } }],
      },
    })
    expect(
      vi
        .mocked(fetchApiResponse)
        .mock.calls.map(([, call]) => call.options?.method),
    ).toEqual(["GET", "POST"])
  })

  it("refreshes a pre-midnight GET before relying on the site's new day", async () => {
    vi.setSystemTime(new Date("2026-11-24T15:59:59Z"))
    vi.mocked(fetchApiResponse).mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-11-24T16:00:01Z"))
      return response(statusData(true))
    })
    vi.mocked(fetchApiResponse).mockImplementation(async (next, options) => {
      const data = { ...statusData(), check_in_date: "2026-11-25" }
      if (options.options?.method === "POST") {
        next.observer?.onDispatch()
        return response({
          ...data,
          checked_in_today: true,
          already_checked_in: false,
        })
      }
      return response(data)
    })

    await expect(execute()).resolves.toMatchObject({
      kind: "executed",
      result: { status: "success" },
    })
    const methods = vi
      .mocked(fetchApiResponse)
      .mock.calls.map(([, call]) => call.options?.method)
    expect(methods.at(-1)).toBe("POST")
    expect(methods.slice(0, -1)).toEqual(
      Array.from({ length: methods.length - 1 }, () => "GET"),
    )
    expect(methods.length).toBeGreaterThanOrEqual(3)
    expect(methods.length).toBeLessThanOrEqual(4)
  })

  it("uses the site's reported timezone for a receipt that omits it", async () => {
    const submittedAt = new Date("2026-11-24T07:59:59Z")
    vi.setSystemTime(submittedAt)
    vi.mocked(fetchApiResponse).mockImplementation(async (next, options) => {
      if (options.options?.method === "POST") {
        next.observer?.onDispatch()
        vi.setSystemTime(new Date("2026-11-24T08:00:01Z"))
        return response({
          check_in_date: "2026-11-23",
          checked_in_today: true,
          already_checked_in: false,
        })
      }
      return response({
        ...statusData(),
        check_in_date: "2026-11-23",
        timezone: "America/Los_Angeles",
      })
    })
    await expect(execute()).resolves.toMatchObject({
      kind: "executed",
      completedAt: +submittedAt,
      confirmation: { resetTimeZone: "America/Los_Angeles" },
      result: { status: "success" },
    })
  })

  it("claims once when the GET returns the requested day's date without a timezone", async () => {
    vi.setSystemTime(new Date("2026-11-23T16:01:00Z"))
    const deviceOptions = new Intl.DateTimeFormat().resolvedOptions()
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...deviceOptions,
      timeZone: "America/Los_Angeles",
    })
    vi.mocked(fetchApiResponse).mockImplementation(async (next, call) => {
      if (call.options?.method === "POST") {
        next.observer?.onDispatch()
        return response({ ...statusData(true), already_checked_in: false })
      }
      const timezone = new URL(call.endpoint, baseUrl).searchParams.get(
        "timezone",
      )
      return response({
        ...statusData(),
        check_in_date: timezone === "Asia/Shanghai" ? day : "2026-11-23",
      })
    })

    await expect(execute()).resolves.toMatchObject({
      kind: "executed",
      result: { status: "success" },
      confirmation: { resetTimeZone: "Asia/Shanghai" },
    })
    expect(
      vi
        .mocked(fetchApiResponse)
        .mock.calls.map(([, call]) => call.options?.method),
    ).toEqual(["GET", "POST"])
  })

  it.each([
    {
      phase: "admission",
      nextStatus: {},
      outcome: { status: "success" },
      submit: true,
    },
    {
      phase: "admission",
      initialStatus: { checked_in_today: true },
      nextStatus: {},
      outcome: { status: "success" },
      submit: true,
    },
    {
      phase: "dispatch",
      nextStatus: {},
      outcome: { status: "success" },
      submit: true,
    },
    {
      phase: "dispatch",
      nextStatus: { turnstile_required: true },
      outcome: { status: "failed", reasonCode: "manual_verification_required" },
      submit: false,
    },
    {
      phase: "dispatch",
      nextStatus: { enabled: false },
      outcome: { status: "failed", reasonCode: "method_disabled" },
      submit: false,
    },
    {
      phase: "dispatch",
      nextStatus: { checked_in_today: true },
      outcome: { status: "already_checked" },
      submit: false,
    },
    {
      phase: "dispatch",
      nextStatus: {},
      cancelAfterRead: true,
      outcome: { status: "failed", reasonCode: "account_unavailable" },
      submit: false,
    },
    {
      phase: "dispatch",
      nextStatus: {},
      losePostResponse: true,
      outcome: { status: "success" },
      submit: true,
    },
  ])(
    "rechecks a new site's day before POST at $phase ($outcome.status, $outcome.reasonCode)",
    async ({
      phase,
      initialStatus,
      nextStatus,
      cancelAfterRead,
      losePostResponse,
      outcome,
      submit,
    }) => {
      vi.setSystemTime(new Date("2026-11-24T15:59:59Z"))
      const nextDay = new Date("2026-11-24T16:00:01Z")
      const selectedAccount = account()
      let submitted = false
      vi.mocked(fetchApiResponse).mockImplementation(async (next, call) => {
        const data =
          Date.now() === +nextDay
            ? {
                ...statusData(submitted),
                ...nextStatus,
                check_in_date: "2026-11-25",
              }
            : { ...statusData(), ...initialStatus }
        if (call.options?.method === "POST") {
          next.observer?.onDispatch()
          submitted = true
          if (losePostResponse) throw new TypeError("Lost response")
          return response({
            ...data,
            checked_in_today: true,
            already_checked_in: false,
          })
        }
        return response(data)
      })
      const afterMidnight = async (): Promise<
        typeof selectedAccount | null
      > => {
        vi.setSystemTime(nextDay)
        return selectedAccount
      }
      const revalidateAccount = vi.fn(afterMidnight)
      if (phase === "dispatch")
        revalidateAccount.mockResolvedValueOnce(selectedAccount)
      if (cancelAfterRead)
        revalidateAccount
          .mockImplementationOnce(afterMidnight)
          .mockResolvedValueOnce(null)
      await expect(
        executeSelectedCheckIn({
          account: selectedAccount,
          globalAutomaticExecutionEnabled: true,
          context,
          revalidateAccount,
        }),
      ).resolves.toMatchObject({
        kind: "executed",
        result: outcome,
      })
      const calls = vi
        .mocked(fetchApiResponse)
        .mock.calls.map(([, call]) => call.options?.method)
      expect(calls).toEqual([
        "GET",
        "GET",
        ...(submit ? ["POST"] : []),
        ...(losePostResponse ? ["GET"] : []),
      ])
    },
  )

  it.each(["before", "after"])(
    "does not resolve a lost claim from the next day when transport reports dispatch %s midnight",
    async (notification) => {
      vi.setSystemTime(new Date("2026-11-24T15:59:59Z"))
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(response(statusData()))
        .mockImplementationOnce(async (next) => {
          if (notification === "before") next.observer?.onDispatch()
          vi.setSystemTime(new Date("2026-11-24T16:00:01Z"))
          if (notification === "after") next.observer?.onDispatch()
          throw new TypeError("Lost response")
        })
        .mockResolvedValueOnce(
          response({ ...statusData(), check_in_date: "2026-11-25" }),
        )
      await expect(execute()).resolves.toMatchObject({
        kind: "executed",
        result: { status: "uncertain" },
        confirmation: { kind: "observed", status: { today: "not_checked" } },
      })
      expect(
        vi
          .mocked(fetchApiResponse)
          .mock.calls.map(([, call]) => call.options?.method),
      ).toEqual(["GET", "POST", "GET"])
    },
  )

  it("does not replay a POST rejected with 401", async () => {
    vi.mocked(fetchApiResponse).mockImplementation(async (next, options) => {
      if (options.options?.method === "POST") {
        next.observer?.onDispatch()
        return response(null, 401)
      }
      return response(statusData())
    })
    await expect(execute()).resolves.toMatchObject({
      kind: "executed",
      result: { reasonCode: "authentication_required" },
    })
    expect(
      vi
        .mocked(fetchApiResponse)
        .mock.calls.filter(([, options]) => options.options?.method === "POST"),
    ).toHaveLength(1)
    expect(refreshSub2ApiTokens).toHaveBeenCalledOnce()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
  })
})
