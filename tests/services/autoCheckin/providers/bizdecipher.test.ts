import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession/types"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import * as browserAuth from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import * as userCheckInProtocol from "~/services/apiService/sub2api/checkin/userCheckInProtocol"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import {
  API_DIRECT_REQUEST_REASONS,
  API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
} from "~/services/apiTransport/type"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery/discovery"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { bizDecipherProvider } from "~/services/checkin/autoCheckin/providers/bizdecipher"
import { createAutoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers/registry"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))
vi.mock(
  "~/services/apiService/sub2api/auth/tokenRefresh",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/tokenRefresh")
    >()),
    refreshSub2ApiTokens: vi.fn(),
  }),
)

const METHOD_ID = "bizdecipher:free-checkin"
const account = () =>
  buildSiteAccount({
    id: "biz-test",
    site_url: "https://bizdecipher.com",
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
const statusData = (checked = false) => ({
  date: "2026-11-24",
  free_claimed: checked,
  balance: 8,
  credit_balance: 40,
})
const response = (data: unknown) => ({
  ok: true,
  status: 200,
  headers: {},
  body: { code: 0, message: "success", data },
})
const receipt = (operationId: string, already = false, asset = "credit") => ({
  operation_id: operationId,
  type: "free",
  date: "2026-11-24",
  cost: 0,
  reward: 12,
  reward_asset: asset,
  balance_after: 8,
  credit_balance_after: 52,
  already_claimed: already,
})
const context = () => ({
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
})
const run = () =>
  executeSelectedCheckIn({
    account: account(),
    globalAutomaticExecutionEnabled: true,
    context: context(),
  })

describe("registered BizDecipher free daily check-in", () => {
  beforeEach(() => {
    vi.mocked(fetchApiResponse).mockReset()
    vi.mocked(refreshSub2ApiTokens).mockReset()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-24T05:00:00Z"))
    vi.spyOn(userCheckInProtocol, "resolveUserCheckInTimezone").mockReturnValue(
      "UTC",
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each([false, true])(
    "renews an expiring credential only for authorized admission (authorized=%s)",
    async (authorized) => {
      vi.mocked(refreshSub2ApiTokens).mockResolvedValue({
        accessToken: "renewed-access",
        refreshToken: "rotated-refresh",
        tokenExpiresAt: Date.now() + 3_600_000,
      })
      vi.mocked(fetchApiResponse).mockResolvedValue(response(statusData()))
      const read = authorized
        ? bizDecipherProvider.forExecution!(context()).getAuthenticatedStatus
        : bizDecipherProvider.getStatus!
      await expect(
        read({
          request: {
            baseUrl: "https://biz.example",
            directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
            auth: {
              authType: AuthTypeEnum.AccessToken,
              userId: "42",
              accessToken: "expiring-access",
              refreshToken: "test-refresh",
              tokenExpiresAt: Date.now() + 1_000,
            },
          },
          observedAt: Date.now(),
        }),
      ).resolves.toMatchObject({ outcome: "known", today: "not_checked" })
      expect(refreshSub2ApiTokens).toHaveBeenCalledTimes(authorized ? 1 : 0)
      expect(fetchApiResponse).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            accessToken: authorized ? "renewed-access" : "expiring-access",
          }),
        }),
        expect.objectContaining({
          options: expect.objectContaining({ method: "GET" }),
        }),
      )
    },
  )

  it("keeps the recovered browser binding through the free POST and operation readback", async () => {
    const saved = account()
    saved.id = await accountMutations.addAccount(saved)
    const fetchContext = {
      kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
      tabId: 12,
      origin: saved.site_url,
    } as const
    const recover = vi
      .spyOn(browserAuth, "recoverSub2ApiBrowserAuth")
      .mockResolvedValue({
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
        userId: "42",
        accessToken: "renewed-browser-token",
        fetchContext,
      })
    let operationId = ""
    const fetch = vi
      .mocked(fetchApiResponse)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: {},
        body: { code: "SESSION_BINDING_MISMATCH" },
      })
      .mockResolvedValueOnce(response(statusData()))
      .mockImplementationOnce(async (_, { options }) => {
        operationId = JSON.parse(String(options?.body)).operation_id
        throw new TypeError("Response connection lost")
      })
      .mockImplementationOnce(async () => response(receipt(operationId)))
    try {
      await expect(
        executeSelectedCheckIn({
          account: saved,
          globalAutomaticExecutionEnabled: true,
          context: context(),
        }),
      ).resolves.toMatchObject({
        result: { status: "success" },
      })
      expect(recover).toHaveBeenCalledOnce()
      expect(
        fetch.mock.calls.map(([, options]) => options.options?.method),
      ).toEqual(["GET", "GET", "POST", "GET"])
      for (const [pending] of fetch.mock.calls.slice(1)) {
        expect(pending).toMatchObject({
          auth: { accessToken: "renewed-browser-token" },
          fetchContext,
          currentTabFallback: API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid,
        })
      }
      expect(
        (await accountQueries.getAccountById(saved.id))?.account_info
          .access_token,
      ).toBe("renewed-browser-token")
      expect(fetch.mock.calls[2]?.[1].options?.redirect).toBe("error")
      expect(fetch.mock.calls[3]?.[1].endpoint).toContain(
        `/operations/${operationId}?`,
      )
    } finally {
      await accountMutations.deleteAccount(saved.id)
    }
  })

  it("discovers the free contract without a hostname restriction or mutating a sibling", async () => {
    vi.mocked(fetchApiResponse).mockImplementation(async (_, input) => {
      if (input.endpoint.startsWith("/api/v1/user/checkin/status?"))
        return response(statusData())
      throw new ApiError("unsupported", 404)
    })
    expect(
      autoCheckinMethodRegistry
        .getCandidates(SITE_TYPES.SUB2API, "https://another.example")
        .some(({ id }) => id === METHOD_ID),
    ).toBe(true)
    expect(
      autoCheckinMethodRegistry
        .getCandidates(SITE_TYPES.NEW_API)
        .some(({ id }) => id === METHOD_ID),
    ).toBe(false)
    const saved = account()
    const discovery = await discoverCheckInMethods({
      account: saved,
      config: saved.checkIn,
      registry: autoCheckinMethodRegistry,
    })
    expect(discovery.detections[METHOD_ID]).toMatchObject({
      outcome: "matched",
    })
    expect(discovery.detections["clawhud:daily-checkin"]).toMatchObject({
      outcome: "unsupported",
    })
    expect(
      discovery.detections["genius-programmer:daily-checkin"],
    ).toMatchObject({ outcome: "unsupported" })
    expect(
      vi
        .mocked(fetchApiResponse)
        .mock.calls.every(([, input]) => input.options?.method === "GET"),
    ).toBe(true)
  })

  it.each(["credit", "balance"])(
    "preserves the native %s award without inventing USD",
    async (asset) => {
      vi.mocked(fetchApiResponse).mockImplementation(async (_, input) =>
        input.options?.method === "POST"
          ? response(
              receipt(
                JSON.parse(String(input.options.body)).operation_id,
                false,
                asset,
              ),
            )
          : response(statusData()),
      )
      await expect(run()).resolves.toMatchObject({
        kind: "executed",
        retryable: false,
        result: {
          status: "success",
          awards: [
            {
              asset: { kind: "quota", id: `bizdecipher:${asset}` },
              amount: { status: "known", value: "12" },
            },
          ],
        },
      })
      expect(fetchApiResponse).toHaveBeenCalledTimes(2)
    },
  )

  it("does not award a duplicate receipt as new income", async () => {
    vi.mocked(fetchApiResponse).mockImplementation(async (_, input) =>
      input.options?.method === "POST"
        ? response(
            receipt(JSON.parse(String(input.options.body)).operation_id, true),
          )
        : response(statusData()),
    )
    const result = await run()
    expect(result).toMatchObject({
      kind: "executed",
      result: { status: "already_checked" },
    })
    if (result.kind === "executed") expect(result.result.awards).toBeUndefined()
  })

  it("skips an already claimed free gift even when paid attempts remain", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response({
        ...statusData(true),
        credit_count: 0,
        credit_limit: 50,
        balance_count: 0,
        balance_limit: 10,
      }),
    )
    await run()
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    expect(
      vi.mocked(fetchApiResponse).mock.calls[0]?.[1]?.options?.method,
    ).toBe("GET")
  })

  it.each([true, false])(
    "reads the original operation after an uncertain response and never repeats it (resolved=%s)",
    async (resolved) => {
      let operationId = ""
      vi.mocked(fetchApiResponse).mockImplementation(async (request, input) => {
        if (input.options?.method === "POST") {
          operationId = JSON.parse(String(input.options.body)).operation_id
          request.observer?.onDispatch()
          throw new TypeError("Lost response")
        }
        if (input.endpoint.includes("/operations/")) {
          if (resolved) return response(receipt(operationId))
          throw new ApiError("Unknown operation", 404)
        }
        return response(statusData())
      })
      await expect(run()).resolves.toMatchObject({
        kind: "executed",
        retryable: false,
        result: { status: resolved ? "success" : "uncertain" },
      })
      expect(
        vi
          .mocked(fetchApiResponse)
          .mock.calls.filter(([, input]) => input.options?.method === "POST"),
      ).toHaveLength(1)
    },
  )

  it("does not submit without a fresh status", async () => {
    vi.mocked(fetchApiResponse).mockRejectedValue(new TypeError("Offline"))
    await expect(run()).resolves.toMatchObject({ kind: "blocked" })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })

  it.each([
    undefined,
    { outcome: "known", availability: "disabled", today: "not_checked" },
    { outcome: "known", availability: "enabled", today: "checked" },
  ] as const)(
    "rejects direct claims without eligible proof %j",
    async (statusProof) => {
      await expect(
        bizDecipherProvider.checkIn(account(), {
          ...context(),
          statusProof: statusProof && {
            ...statusProof,
            evidence: { source: "probe", observedAt: 200 },
          },
        }),
      ).resolves.toMatchObject({
        status: "failed",
        reasonCode: "status_unavailable",
      })
      expect(fetchApiResponse).not.toHaveBeenCalled()
    },
  )

  it.each(["abort", "timeout"])(
    "bounds %s discovery even when transport ignores cancellation",
    async (mode) => {
      const controller = new AbortController()
      let resolve!: (value: ReturnType<typeof response>) => void
      let started!: () => void
      const dispatched = new Promise<void>((done) => {
        started = done
      })
      vi.mocked(fetchApiResponse).mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done
            started()
          }),
      )
      const registry = createAutoCheckinMethodRegistry(
        autoCheckinMethodRegistry
          .getCandidates(SITE_TYPES.SUB2API)
          .filter(({ id }) => id === METHOD_ID),
      )
      const saved = account()
      const pending = discoverCheckInMethods({
        account: saved,
        config: saved.checkIn,
        registry,
        signal: controller.signal,
        perAdapterTimeoutMs: 10,
        deadlineMs: 100,
      })
      await dispatched
      if (mode === "abort") controller.abort()
      const result = await pending
      expect(result.detections[METHOD_ID]).not.toMatchObject({
        outcome: "matched",
      })
      resolve(response(statusData()))
      await Promise.resolve()
      expect(result.detections[METHOD_ID]).not.toMatchObject({
        outcome: "matched",
      })
      expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    },
  )
})
