import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { type newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { canAutomaticallyRetryCheckinResult } from "~/services/checkin/autoCheckin/execution/resultPolicy"
import { freeggProvider } from "~/services/checkin/autoCheckin/providers/freegg"
import {
  getAutoCheckinCandidateMethodIds,
  supportsCheckInStatusReadback,
} from "~/services/checkin/autoCheckin/providers/registry"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: {
    envelope: async (
      ...args: Parameters<typeof newApiFamilyRequests.envelope>
    ) => {
      const [request, options] = args
      if (options.endpoint === "/api/user/self") {
        vi.setSystemTime(Date.now() + transportDelayMs)
        request.observer?.onDispatch()
        request.abortSignal?.throwIfAborted()
      }
      const response = await envelope(...args)
      if (options.endpoint === "/api/user/self") request.observer?.onResponse()
      return response
    },
  },
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiResponse: async (request: unknown, options: unknown) => ({
    ok: serverHttpStatus === 200,
    status: serverHttpStatus,
    headers: serverDateMissing
      ? {}
      : { date: new Date(Date.now() + serverClockOffsetMs).toUTCString() },
    body: await envelope(request as never, options as never),
  }),
}))
let serverClockOffsetMs = 0
let serverHttpStatus = 200
let serverDateMissing = false
let transportDelayMs = 0
const envelope = vi.fn<typeof newApiFamilyRequests.envelope>()
const now = Date.parse("2026-11-24T00:00:00.000Z")
const account = () =>
  buildSiteAccount({
    site_url: "https://freegg.app",
    site_type: SITE_TYPES.NEW_API,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      ...buildSiteAccount().account_info,
      id: "17",
      access_token: "test-account-token",
    },
  })
const context = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
}
const log = (extra: Record<string, unknown> = {}) => ({
  id: 51,
  user_id: 17,
  type: 1,
  created_at: now / 1000,
  content: "Daily allowance ＄20.000000",
  quota: 0,
  other: JSON.stringify({
    content_parts: [
      { key: "Daily allowance {{quota}}", params: { quota: "＄20.000000" } },
    ],
  }),
  ...extra,
})
// Successful execution fixtures model a grant two seconds after dispatch.
// A grant in the dispatch second has insufficient timestamp precision.
const grant = (extra: Record<string, unknown> = {}) =>
  log({ created_at: now / 1000 + 2, ...extra })
const logs = (items: unknown[]) => ({
  success: true,
  message: "",
  data: { items, page: 1, page_size: 100, total: items.length },
})
const mockExecution = (
  before: unknown[],
  after: unknown[],
  selfId: unknown = 17,
) => {
  envelope
    .mockResolvedValueOnce(logs(before))
    .mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 2000)
      return {
        success: true,
        message: "",
        data: { id: selfId, quota: 100000 },
      }
    })
    .mockResolvedValueOnce(logs(after))
}

beforeEach(() => {
  serverClockOffsetMs = 0
  serverHttpStatus = 200
  serverDateMissing = false
  transportDelayMs = 0
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(now)
})
afterEach(() => vi.useRealTimers())

describe("FreeGG daily allowance", () => {
  it.each([
    ["2026-11-24T15:59:55Z", "uncertain"],
    ["2026-11-24T15:59:59Z", "success"],
    ["2026-11-24T16:00:01Z", "uncertain"],
  ])(
    "confirms only the baseline day's grant at %s after readback crosses midnight",
    async (grantAt, status) => {
      vi.setSystemTime("2026-11-24T15:59:55Z")
      envelope
        .mockResolvedValueOnce(logs([]))
        .mockImplementationOnce(async () => {
          vi.setSystemTime("2026-11-24T16:00:02Z")
          return { success: true, message: "", data: { id: 17 } }
        })
        .mockResolvedValueOnce(
          logs([log({ created_at: Date.parse(grantAt) / 1000 })]),
        )
      expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
        status,
      })
    },
  )
  it("does not dispatch when the projected server clock has reached tomorrow", async () => {
    vi.setSystemTime("2026-11-24T15:59:55Z")
    serverClockOffsetMs = 3000
    transportDelayMs = 3000
    mockExecution([], [grant()])
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "uncertain",
    })
    expect(
      envelope.mock.calls.some(
        ([, options]) => options.endpoint === "/api/user/self",
      ),
    ).toBe(false)
  })
  it("reports today as already claimed when a grant arrives while the trigger waits in transport", async () => {
    transportDelayMs = 5000
    mockExecution([], [grant()])

    const result = await freeggProvider.checkIn(account(), context)

    expect(result).toMatchObject({
      status: "already_checked",
      confirmation: { kind: "observed", status: { today: "checked" } },
    })
    expect(result.awards).toBeUndefined()
    expect(
      envelope.mock.calls.filter(
        ([, options]) => options.endpoint === "/api/user/self",
      ),
    ).toHaveLength(1)
  })
  it("cancels a queued trigger when transport reaches the next business day", async () => {
    vi.setSystemTime("2026-11-24T15:59:59Z")
    transportDelayMs = 2000
    mockExecution([], [grant()])
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "uncertain",
    })
    expect(
      envelope.mock.calls.some(
        ([, options]) => options.endpoint === "/api/user/self",
      ),
    ).toBe(false)
  })
  it.each([401, 429])(
    "does not claim or renew credentials when ledger reads return HTTP %i",
    async (status) => {
      serverHttpStatus = status
      envelope.mockResolvedValueOnce(logs([]))
      expect(
        (await freeggProvider.checkIn(account(), context)).status,
      ).not.toBe("success")
      expect(envelope).toHaveBeenCalledTimes(1)
    },
  )
  it("uses local time conservatively when the server omits Date", async () => {
    serverDateMissing = true
    mockExecution([log({ created_at: now / 1000 - 86400 })], [grant()])
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "success",
    })
  })
  it("does not claim after account intent changes while baseline reads are pending", async () => {
    mockExecution([], [log()])
    const beforeRecoveredMutation = vi.fn(async () => false)
    expect(
      await freeggProvider.checkIn(account(), {
        ...context,
        beforeRecoveredMutation,
      }),
    ).toMatchObject({ status: "uncertain" })
    expect(beforeRecoveredMutation).toHaveBeenCalledOnce()
    expect(envelope).toHaveBeenCalledTimes(1)
  })
  it("does not claim with yesterday's baseline after admission crosses midnight", async () => {
    vi.setSystemTime("2026-11-24T15:59:59Z")
    mockExecution([], [log()])
    expect(
      await freeggProvider.checkIn(account(), {
        ...context,
        beforeRecoveredMutation: async () => {
          vi.setSystemTime("2026-11-24T16:00:01Z")
          return true
        },
      }),
    ).toMatchObject({ status: "uncertain" })
    expect(envelope).toHaveBeenCalledTimes(1)
  })
  it("keeps a readback on the server's next business day uncertain", async () => {
    vi.setSystemTime("2026-11-24T15:59:50Z")
    envelope
      .mockResolvedValueOnce(logs([]))
      .mockImplementationOnce(async () => {
        serverClockOffsetMs = 15000
        return { success: true, message: "", data: { id: 17 } }
      })
      .mockResolvedValueOnce(
        logs([log({ created_at: Date.now() / 1000 + 15 })]),
      )
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "uncertain",
    })
    expect(envelope).toHaveBeenCalledTimes(3)
  })
  it("does not probe without a site or status identity", async () => {
    expect(await freeggProvider.detect?.({ observedAt: now })).toMatchObject({
      outcome: "unsupported",
    })
    expect(
      await freeggProvider.getStatus?.({ observedAt: now }),
    ).toBeUndefined()
    expect(envelope).not.toHaveBeenCalled()
  })
  it("rejects legacy cookie-only execution input without dispatching", async () => {
    expect(
      await freeggProvider.checkIn(
        { site_url: "https://freegg.app", account_info: { id: 17 } },
        context,
      ),
    ).toMatchObject({ status: "failed" })
    expect(envelope).not.toHaveBeenCalled()
  })
  it("reads a saved grant conservatively without a server Date header", async () => {
    serverDateMissing = true
    envelope.mockResolvedValueOnce(logs([log()]))
    expect(
      await freeggProvider.getStatus?.({ account: account(), observedAt: now }),
    ).toMatchObject({ today: "checked" })
  })
  it("rejects a non-object ledger envelope before dispatch", async () => {
    envelope.mockResolvedValueOnce(null as never)
    expect((await freeggProvider.checkIn(account(), context)).status).not.toBe(
      "success",
    )
    expect(envelope).toHaveBeenCalledTimes(1)
  })
  it("preserves confirmed status when structured allowance parameters are absent", async () => {
    mockExecution(
      [],
      [
        grant({
          other: { content_parts: [{ key: "Daily allowance {{quota}}" }] },
        }),
      ],
    )
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "success",
      awards: [{ amount: { status: "unknown" } }],
    })
  })
  it("does not confirm an award from a contradictory readback page", async () => {
    mockExecution([], [grant(), grant()])
    const result = await freeggProvider.checkIn(account(), context)
    expect(result).toMatchObject({ status: "uncertain" })
    expect(result.awards).toBeUndefined()
    expect(envelope).toHaveBeenCalledTimes(3)
  })
  it.each([1, 5])(
    "reports already claimed without awarding a grant at second %i before or indistinguishable from dispatch",
    async (grantSecond) => {
      mockExecution([], [log({ created_at: now / 1000 + grantSecond })])
      const result = await freeggProvider.checkIn(account(), {
        ...context,
        beforeRecoveredMutation: async () => {
          vi.setSystemTime(now + 5000)
          return true
        },
      })
      expect(result).toMatchObject({ status: "already_checked" })
      expect(result.awards).toBeUndefined()
      expect(envelope).toHaveBeenCalledTimes(3)
    },
  )
  it.each([401, 429])(
    "keeps the claim uncertain when readback returns HTTP %i",
    async (status) => {
      envelope
        .mockResolvedValueOnce(logs([]))
        .mockImplementationOnce(async () => {
          serverHttpStatus = status
          return { success: true, message: "", data: { id: 17 } }
        })
        .mockResolvedValueOnce(logs([log()]))
      const result = await freeggProvider.checkIn(account(), context)
      expect(result).toMatchObject({ status: "uncertain" })
      expect(
        canAutomaticallyRetryCheckinResult(
          result,
          AUTO_CHECKIN_METHOD_IDS.FreeGgDailyAllowance,
        ),
      ).toBe(false)
      expect(envelope).toHaveBeenCalledTimes(3)
    },
  )
  it("does not assign a grant to the wrong day when server and browser straddle midnight", async () => {
    vi.setSystemTime("2026-11-24T15:59:59Z")
    serverClockOffsetMs = 3000
    envelope.mockResolvedValue(
      logs([log({ created_at: Date.now() / 1000 + 3 })]),
    )
    expect(
      await freeggProvider.getStatus?.({
        account: account(),
        observedAt: Date.now(),
      }),
    ).toMatchObject({ outcome: "unknown" })
    envelope.mockClear()
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "uncertain",
    })
    expect(envelope).toHaveBeenCalledTimes(1)
  })
  it("confirms a later grant with the observed three-second server clock offset", async () => {
    serverClockOffsetMs = 3000
    mockExecution([], [grant({ created_at: now / 1000 + 5 })])
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "success",
      awards: [{ amount: { value: "20" } }],
    })
    envelope
      .mockReset()
      .mockResolvedValueOnce(logs([grant({ created_at: now / 1000 + 5 })]))
    expect(
      await freeggProvider.getStatus?.({ account: account(), observedAt: now }),
    ).toMatchObject({ today: "checked" })
  })
  it.each([undefined, 20, "n/a", "$0"])(
    "preserves a confirmed grant with an unreadable amount: %j",
    async (amount) => {
      mockExecution(
        [],
        [
          grant({
            other: {
              content_parts: [
                { key: "Daily allowance {{quota}}", params: { quota: amount } },
              ],
            },
          }),
        ],
      )
      expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
        status: "success",
        awards: [{ amount: { status: "unknown" } }],
      })
    },
  )
  it.each([
    "{broken",
    { allowance_date: "invalid" },
    { allowance_date: "2026-11-24" },
  ])(
    "uses account-matched logs when optional receipt settings are absent or valid: %j",
    async (setting) => {
      envelope
        .mockResolvedValueOnce(logs([]))
        .mockImplementationOnce(async () => {
          vi.setSystemTime(now + 2000)
          return { success: true, message: "", data: { id: 17, setting } }
        })
        .mockResolvedValueOnce(logs([grant()]))
      expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
        status: "success",
      })
    },
  )
  it("does not accept a rejected self envelope as identity evidence", async () => {
    envelope.mockResolvedValueOnce(logs([])).mockResolvedValueOnce({
      success: false,
      message: "denied",
      data: undefined,
    })
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "uncertain",
    })
    expect(envelope).toHaveBeenCalledTimes(2)
  })
  it("reads status from an explicit matching request without saved-account recovery", async () => {
    envelope.mockResolvedValueOnce(logs([log()]))
    expect(
      await freeggProvider.getStatus?.({
        observedAt: now,
        request: {
          baseUrl: "https://freegg.app",
          auth: {
            authType: AuthTypeEnum.AccessToken,
            userId: "17",
            accessToken: "test",
          },
          directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
        },
      }),
    ).toMatchObject({ today: "checked" })
  })
  it("keeps a repeatedly crossing observation unknown", async () => {
    vi.setSystemTime("2026-11-24T15:59:59Z")
    envelope
      .mockImplementationOnce(async () => {
        vi.setSystemTime("2026-11-25T15:59:59Z")
        return logs([])
      })
      .mockImplementationOnce(async () => {
        vi.setSystemTime("2026-11-26T15:59:59Z")
        return logs([])
      })
    expect(
      await freeggProvider.getStatus?.({ account: account(), observedAt: now }),
    ).toMatchObject({ outcome: "unknown" })
    expect(envelope).toHaveBeenCalledTimes(2)
  })
  it("does not treat malformed unrelated metadata as absence of a grant", async () => {
    envelope.mockResolvedValueOnce(
      logs([log({ content: "Other event", other: "{broken" })]),
    )
    expect(
      await freeggProvider.getStatus?.({ account: account(), observedAt: now }),
    ).toMatchObject({ outcome: "unknown" })
  })
  it("cancels an in-flight status read when either caller aborts", async () => {
    const caller = new AbortController()
    const request = new AbortController()
    envelope.mockImplementationOnce(async () => {
      request.abort(new Error("request cancelled"))
      return logs([])
    })
    await expect(
      freeggProvider.getStatus?.({
        observedAt: now,
        signal: caller.signal,
        request: {
          baseUrl: "https://freegg.app",
          auth: {
            authType: AuthTypeEnum.AccessToken,
            userId: "17",
            accessToken: "test",
          },
          abortSignal: request.signal,
          directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
        },
      }),
    ).rejects.toThrow("request cancelled")
    expect(envelope).toHaveBeenCalledTimes(1)
  })
  it.each([
    { data: { items: [], page: 1, page_size: 100, total: 2 } },
    {
      data: {
        items: [
          log({ created_at: now / 1000 - 86400 }),
          log({ created_at: now / 1000 - 86400 }),
        ],
        page: 1,
        page_size: 100,
        total: 2,
      },
    },
  ])(
    "leaves truncated and duplicate pages unknown and never claims: %j",
    async (data) => {
      envelope.mockResolvedValue({ success: true, message: "", ...data })
      expect(
        await freeggProvider.getStatus?.({
          account: account(),
          observedAt: now,
        }),
      ).toMatchObject({ outcome: "unknown" })
      envelope.mockClear()
      expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
        status: "uncertain",
      })
      expect(
        envelope.mock.calls.every(([, o]) =>
          o.endpoint.startsWith("/api/log/self"),
        ),
      ).toBe(true)
    },
  )
  it("bounds pagination even when a complete ledger is unavailable", async () => {
    envelope.mockImplementation(async (_r, o) => {
      const page = Number(
        new URL(o.endpoint, "https://freegg.app").searchParams.get("p"),
      )
      return {
        success: true,
        message: "",
        data: {
          items: [log({ id: page, created_at: now / 1000 - 86400 })],
          page,
          page_size: 1,
          total: 11,
        },
      }
    })
    expect(
      await freeggProvider.getStatus?.({ account: account(), observedAt: now }),
    ).toMatchObject({ outcome: "unknown" })
    expect(envelope).toHaveBeenCalledTimes(10)
  })
  it("leaves changing page totals unknown", async () => {
    envelope
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: {
          items: [log({ created_at: now / 1000 - 86400 })],
          page: 1,
          page_size: 1,
          total: 2,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: {
          items: [log({ id: 52, created_at: now / 1000 - 86400 })],
          page: 2,
          page_size: 1,
          total: 3,
        },
      })
    expect(
      await freeggProvider.getStatus?.({ account: account(), observedAt: now }),
    ).toMatchObject({ outcome: "unknown" })
  })
  it.each([
    {},
    { items: [] },
    { items: [null], page: 1, page_size: 100, total: 1 },
    { items: [], page: 1, page_size: 100, total: -1 },
  ])(
    "rejects malformed ledger envelopes without claiming: %j",
    async (data) => {
      envelope.mockResolvedValueOnce({ success: true, message: "", data })
      expect(
        (await freeggProvider.checkIn(account(), context)).status,
      ).not.toBe("success")
      expect(envelope).toHaveBeenCalledTimes(1)
    },
  )
  it.each([
    "",
    "https://other.example",
    "https://name:password@freegg.app",
    "not-a-url",
  ])("does not execute on unverified origins: %s", async (site_url) => {
    expect(
      await freeggProvider.checkIn({ ...account(), site_url }, context),
    ).toMatchObject({ status: "uncertain" })
    expect(envelope).not.toHaveBeenCalled()
  })
  it.each([AuthTypeEnum.None, AuthTypeEnum.Cookie])(
    "requires a saved account token for %s authentication",
    async (authType) => {
      const saved = { ...account(), authType }
      expect(freeggProvider.getReadiness(saved)).toMatchObject({
        ready: false,
        reason: "credentials_missing",
      })
      expect(
        await freeggProvider.getStatus?.({ account: saved, observedAt: now }),
      ).toBeUndefined()
      expect(envelope).not.toHaveBeenCalled()
    },
  )
  it("does not probe a cancelled or mismatched read context", async () => {
    const controller = new AbortController()
    controller.abort()
    expect(
      await freeggProvider.getStatus?.({
        account: account(),
        observedAt: now,
        signal: controller.signal,
      }),
    ).toBeUndefined()
    expect(
      await freeggProvider.getStatus?.({
        account: account(),
        observedAt: now,
        request: {
          baseUrl: "https://freegg.app",
          auth: {
            authType: AuthTypeEnum.AccessToken,
            userId: "99",
            accessToken: "test",
          },
          directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
        },
      }),
    ).toBeUndefined()
    expect(envelope).not.toHaveBeenCalled()
  })
  it("keeps a confirmed structured grant's amount unknown when its currency is not USD", async () => {
    mockExecution(
      [],
      [
        grant({
          quota: 9000000,
          other: JSON.stringify({
            content_parts: [
              {
                key: "Daily allowance {{quota}}",
                params: { quota: "￥20.00" },
              },
            ],
          }),
        }),
      ],
    )
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "success",
      awards: [{ amount: { status: "unknown" } }],
    })
  })
  it("rechecks a status read that crosses the UTC+8 reset", async () => {
    vi.setSystemTime("2026-11-24T15:59:59Z")
    const yesterday = log({ created_at: Date.now() / 1000 })
    envelope
      .mockImplementationOnce(async () => {
        vi.setSystemTime("2026-11-24T16:00:01Z")
        return logs([yesterday])
      })
      .mockResolvedValueOnce(logs([yesterday]))
    expect(
      await freeggProvider.getStatus?.({
        account: account(),
        observedAt: Date.now(),
      }),
    ).toMatchObject({
      today: "not_checked",
      evidence: { observedAt: Date.parse("2026-11-24T16:00:01Z") },
    })
    expect(envelope).toHaveBeenCalledTimes(2)
  })
  it("does not confirm a grant when the returned allowance date contradicts its log", async () => {
    envelope
      .mockResolvedValueOnce(logs([]))
      .mockImplementationOnce(async () => {
        vi.setSystemTime(now + 2000)
        return {
          success: true,
          message: "",
          data: {
            id: 17,
            setting: JSON.stringify({ allowance_date: "2026-11-23" }),
          },
        }
      })
      .mockResolvedValueOnce(logs([grant()]))
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "uncertain",
    })
  })
  it.each([
    { other: undefined },
    { other: "" },
    { other: JSON.stringify({}) },
    { type: undefined },
    { other: "{broken" },
    { created_at: now / 1000 + 3600 },
    { user_id: 99 },
  ])(
    "does not interpret damaged or mismatched logs as a day eligible for claiming: %j",
    async (extra) => {
      envelope.mockResolvedValueOnce(logs([log(extra)]))
      expect(
        await freeggProvider.getStatus?.({
          account: account(),
          observedAt: now,
        }),
      ).toMatchObject({ outcome: "unknown" })
      envelope.mockReset().mockResolvedValueOnce(logs([log(extra)]))
      expect(
        (await freeggProvider.checkIn(account(), context)).status,
      ).not.toBe("success")
      expect(envelope).toHaveBeenCalledTimes(1)
    },
  )
  it("skips a grant already present in today's ledger without dispatching self or reporting new income", async () => {
    envelope.mockResolvedValueOnce(logs([log()]))
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "already_checked",
    })
    expect(envelope).toHaveBeenCalledTimes(1)
  })
  it("confirms a new grant even when the server renumbers the newest log to the same list ID", async () => {
    mockExecution(
      [log({ id: 1, created_at: now / 1000 - 86400 })],
      [grant({ id: 1 }), log({ id: 2, created_at: now / 1000 - 86400 })],
    )
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "success",
    })
  })
  it("reads today's structured grant across pages using the FreeGG day without requesting self", async () => {
    vi.setSystemTime("2026-11-24T16:00:05Z")
    envelope
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: {
          items: [log({ created_at: now / 1000 - 86400 })],
          page: 1,
          page_size: 1,
          total: 2,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: {
          items: [
            log({
              id: 52,
              type: 1,
              created_at: Date.now() / 1000 - 2,
              quota: 0,
              other: JSON.stringify({
                content_parts: [
                  {
                    key: "Daily allowance {{quota}}",
                    params: { quota: "＄20.000000" },
                  },
                ],
              }),
            }),
          ],
          page: 2,
          page_size: 1,
          total: 2,
        },
      })
    expect(
      await freeggProvider.getStatus?.({
        account: account(),
        observedAt: Date.now(),
      }),
    ).toMatchObject({
      outcome: "known",
      today: "checked",
      resetTimeZone: "Asia/Shanghai",
    })
    expect(envelope.mock.calls.map(([, o]) => o.endpoint)).toEqual([
      "/api/log/self?p=1&page_size=100&type=1",
      "/api/log/self?p=2&page_size=100&type=1",
    ])
  })
  it("confirms the deployed structured allowance even when its quota field is zero", async () => {
    mockExecution(
      [],
      [
        grant({
          type: 1,
          content: "Daily allowance ＄20.000000",
          quota: 0,
          other: JSON.stringify({
            content_parts: [
              {
                key: "Daily allowance {{quota}}",
                params: { quota: "＄20.000000" },
              },
            ],
          }),
        }),
      ],
    )
    const result = await freeggProvider.checkIn(account(), context)
    expect(result).toMatchObject({
      status: "success",
      awards: [
        {
          asset: { kind: "currency", code: "USD" },
          amount: { status: "known", value: "20" },
        },
      ],
    })
  })
  it("discovers the allowance from the verified origin even when the public status endpoint is unavailable", async () => {
    envelope.mockRejectedValueOnce(new Error("status unavailable"))

    await expect(
      freeggProvider.detect!({ account: account(), observedAt: now }),
    ).resolves.toMatchObject({ outcome: "matched" })
    expect(envelope).not.toHaveBeenCalled()
  })

  it.each([
    "https://other.example",
    "https://freegg.app.example",
    "http://freegg.app",
    "https://freegg.app:8443",
  ])("does not discover the allowance at %s", async (siteUrl) => {
    const unrelated = { ...account(), site_url: siteUrl }
    expect(
      await freeggProvider.detect!({ account: unrelated, observedAt: now }),
    ).toMatchObject({ outcome: "unsupported" })
    expect(envelope).not.toHaveBeenCalled()
    expect(
      getAutoCheckinCandidateMethodIds(SITE_TYPES.NEW_API, unrelated.site_url),
    ).not.toContain(AUTO_CHECKIN_METHOD_IDS.FreeGgDailyAllowance)
    expect(
      getAutoCheckinCandidateMethodIds(SITE_TYPES.NEW_API, account().site_url),
    ).toContain(AUTO_CHECKIN_METHOD_IDS.FreeGgDailyAllowance)
  })

  it("confirms only a new account-matched allowance record and dispatches self once as a mutation", async () => {
    mockExecution([], [grant()])
    const result = await freeggProvider.checkIn(account(), context)
    expect(result.status).toBe("success")
    expect(result.awards).toHaveLength(1)
    expect(envelope.mock.calls.map(([, options]) => options.endpoint)).toEqual([
      "/api/log/self?p=1&page_size=100&type=1",
      "/api/user/self",
      "/api/log/self?p=1&page_size=100&type=1",
    ])
    expect(envelope.mock.calls[1]?.[1]).toMatchObject({
      operationSemantics: "mutation",
      currentTabTransport: "disabled",
      tempWindowFallback: { codes: [], statusCodes: [] },
    })
    for (const [request] of envelope.mock.calls) {
      expect(request.protectionBypassExecution).toBeUndefined()
      expect(request.allowAccountCredentialRecovery).not.toBe(true)
      expect(request.fetchContext).toBeUndefined()
    }
  })

  it.each([
    { type: 1, content: "Top-up credited: $20", other: "" },
    { content: "Quota added by administrator", quota: 10000000, other: "" },
    { content: "Daily allowance unavailable", other: "" },
    { content: "Daily allowance credited: $0", quota: 0, other: "" },
    { user_id: 99 },
    { id: undefined },
    { created_at: now / 1000 + 3600 },
  ])(
    "keeps unrelated, undated or malformed evidence uncertain: %j",
    async (extra) => {
      mockExecution([], [log(extra)])
      const result = await freeggProvider.checkIn(account(), context)
      expect(result).toMatchObject({
        status: "uncertain",
        reasonCode: "checkin_unconfirmed",
      })
      expect(result.awards).toBeUndefined()
    },
  )

  it("never turns an older record into today's success using the browser timezone", async () => {
    mockExecution(
      [log({ created_at: now / 1000 - 86400 })],
      [log({ created_at: now / 1000 - 86400 })],
    )
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "uncertain",
    })
    expect(
      supportsCheckInStatusReadback(
        AUTO_CHECKIN_METHOD_IDS.FreeGgDailyAllowance,
      ),
    ).toBe(true)
    expect(freeggProvider.getStatus).toBeDefined()
  })

  it.each([undefined, 99])(
    "requires the self response to prove saved identity: %s",
    async (selfId) => {
      envelope.mockResolvedValueOnce(logs([])).mockResolvedValueOnce({
        success: true,
        message: "",
        data: { id: selfId },
      })
      expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
        status: "uncertain",
      })
      expect(envelope).toHaveBeenCalledTimes(2)
    },
  )

  it("never claims from a balance increase when there is no allowance record", async () => {
    mockExecution([], [])
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "uncertain",
    })
  })

  it("does not dispatch self if the log baseline cannot be read", async () => {
    envelope.mockRejectedValueOnce(new Error("offline"))
    expect((await freeggProvider.checkIn(account(), context)).status).not.toBe(
      "success",
    )
    expect(envelope).toHaveBeenCalledTimes(1)
  })

  it("does not trigger for a baseline that proves another account", async () => {
    envelope.mockResolvedValueOnce(logs([log({ user_id: 99 })]))
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "uncertain",
    })
    expect(envelope).toHaveBeenCalledTimes(1)
  })

  it("propagates discovery cancellation without a network request", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      freeggProvider.detect!({
        account: account(),
        observedAt: now,
        signal: controller.signal,
      }),
    ).rejects.toBe(controller.signal.reason)
    expect(envelope).not.toHaveBeenCalled()
  })

  it("does not replay a lost self response or schedule another mutation", async () => {
    envelope
      .mockResolvedValueOnce(logs([]))
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(logs([]))
    const result = await freeggProvider.checkIn(account(), context)
    expect(result).toMatchObject({ status: "uncertain" })
    expect(envelope).toHaveBeenCalledTimes(3)
    expect(
      canAutomaticallyRetryCheckinResult(
        result,
        AUTO_CHECKIN_METHOD_IDS.FreeGgDailyAllowance,
      ),
    ).toBe(false)
  })

  it("confirms a lost trigger response using one account-matched new allowance log", async () => {
    envelope
      .mockResolvedValueOnce(logs([]))
      .mockImplementationOnce(async () => {
        vi.setSystemTime(now + 2000)
        throw new Error("response lost")
      })
      .mockResolvedValueOnce(logs([grant()]))
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "success",
      awards: [expect.any(Object)],
    })
    expect(envelope.mock.calls.map(([, options]) => options.endpoint)).toEqual([
      "/api/log/self?p=1&page_size=100&type=1",
      "/api/user/self",
      "/api/log/self?p=1&page_size=100&type=1",
    ])
  })

  it("keeps a lost trigger uncertain when the new log cannot prove account identity", async () => {
    envelope
      .mockResolvedValueOnce(logs([]))
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(logs([log({ user_id: undefined })]))
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "uncertain",
    })
    expect(envelope).toHaveBeenCalledTimes(3)
  })
})
