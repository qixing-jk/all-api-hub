import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { ultraRouterGameProvider } from "~/services/checkin/autoCheckin/providers/ultrarouterGame"
import {
  buildUltraRouterGameInputBatch,
  chooseUltraRouterGameDirection,
  isCompletedUltraRouterGame,
  parseUltraRouterGameRun,
  parseUltraRouterGameSnapshot,
  readUltraRouterGameClock,
  ULTRAROUTER_GAME_ENDPOINTS,
  ULTRAROUTER_GAME_RULES,
} from "~/services/checkin/autoCheckin/providers/ultrarouterGameProtocol"
import type { UltraRouterGameRun } from "~/services/checkin/autoCheckin/providers/ultrarouterGameProtocol"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const { mockEnvelope, mockGetAllTabs } = vi.hoisted(() => ({
  mockEnvelope: vi.fn(),
  mockGetAllTabs: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: {
    data: vi.fn(),
    envelope: mockEnvelope,
  },
}))

vi.mock("~/utils/browser/tabs", () => ({
  getAllTabs: mockGetAllTabs,
}))

const makeRun = (
  overrides: Partial<UltraRouterGameRun> = {},
): UltraRouterGameRun => ({
  id: "run-1",
  status: "running",
  state: {
    version: 3,
    tick: 0,
    clock_tick: 0,
    x: 5_000,
    y: 3_500,
    hp: 100,
    upgrades: 0,
    dash_ready: 0,
    picked_tokens: 0,
    tokens: [],
    enemies: [],
  },
  first_token_quota: 10,
  subsequent_token_quota: 10,
  ...overrides,
})

const account = buildSiteAccount({
  id: "ultrarouter-test-account",
  site_name: "UltraRouter",
  site_url: "https://ultrarouter.org",
  site_type: SITE_TYPES.NEW_API,
  authType: AuthTypeEnum.AccessToken,
  account_info: {
    id: "123",
    access_token: "unused-account-token",
    username: "test-user",
    quota: 1_000,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
})

const response = <T>(data: T) => ({ success: true, data })
const context = {
  tempWindowRequestSource: "background",
  protectionBypassExecution: { kind: "automatic" },
} as never

describe("UltraRouter daily game protocol", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-27T02:00:00.000Z"))
    mockEnvelope.mockReset()
    mockGetAllTabs.mockReset().mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("accepts only the game state needed for an authoritative run", () => {
    const run = makeRun()
    expect(
      parseUltraRouterGameSnapshot(
        { run, settings: { enabled: true } },
        { budgets: { can_start: false } },
      ),
    ).toMatchObject({
      run,
      settings: { enabled: true },
      budgets: { can_start: false },
    })
    expect(
      parseUltraRouterGameSnapshot(
        { run: { id: "bad", state: {} }, settings: { enabled: true } },
        { budgets: { can_start: true } },
      ),
    ).toBeUndefined()
    expect(parseUltraRouterGameRun(null)).toBeNull()
    expect(
      parseUltraRouterGameSnapshot(
        {
          run: makeRun({
            state: {
              ...makeRun().state,
              tokens: [{ x: Number.NaN, y: 10, value: 1 }],
            },
          }),
          settings: { enabled: true },
          budgets: { can_start: true },
          server_time: "server-time",
          resets_at: 123,
        },
        null,
      ),
    ).toBeUndefined()
    expect(
      parseUltraRouterGameSnapshot(
        {
          run: null,
          settings: { enabled: true },
          budgets: { can_start: false },
          server_time: "server-time",
          resets_at: 123,
        },
        null,
      ),
    ).toMatchObject({ server_time: "server-time", resets_at: 123 })
  })

  it("reports authoritative status and account readiness without starting a game", async () => {
    let currentRun: UltraRouterGameRun | null = null
    let canStart = true
    mockEnvelope.mockImplementation(
      async (_request: ApiServiceRequest, options: { endpoint: string }) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({ id: "123", quota: "1000" })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: currentRun,
            settings: { enabled: true },
            budgets: { can_start: canStart },
          })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: canStart } })
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    const getStatus = ultraRouterGameProvider.getStatus
    if (!getStatus) throw new Error("UltraRouter provider must expose status")
    const available = await getStatus({
      account,
      observedAt: 123,
    } as never)
    expect(available).toMatchObject({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      evidence: { observedAt: 123 },
    })
    expect(ultraRouterGameProvider.getReadiness(account)).toEqual({
      ready: true,
    })

    currentRun = makeRun({ status: "survived" })
    canStart = false
    const checked = await getStatus({
      account,
      observedAt: 456,
    } as never)
    expect(checked).toMatchObject({
      availability: CHECK_IN_METHOD_AVAILABILITIES.Disabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
    })
    expect(
      ultraRouterGameProvider.getReadiness({
        ...account,
        account_info: { ...account.account_info, id: "" },
      } as typeof account),
    ).toMatchObject({ ready: false })
  })

  it("detects through the matching signed-in tab using cookie authentication", async () => {
    const requests: ApiServiceRequest[] = []
    mockGetAllTabs.mockResolvedValue([
      { id: 3, url: "https://unrelated.example/" },
      {
        id: 27,
        url: "https://ultrarouter.org/dashboard",
        cookieStoreId: "test-store",
        incognito: true,
      },
    ])
    mockEnvelope.mockImplementation(
      async (request: ApiServiceRequest, options: { endpoint: string }) => {
        requests.push(request)
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({ id: "123", quota: 1_000 })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: null,
            settings: { enabled: true },
            budgets: { can_start: true },
          })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: true } })
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    const detect = ultraRouterGameProvider.detect
    if (!detect) throw new Error("UltraRouter provider must expose detection")
    const result = await detect({
      account,
      observedAt: 789,
    } as never)

    expect("detection" in result && result.detection.outcome).toBe(
      CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
    )
    expect(requests[0]).toMatchObject({
      auth: { authType: AuthTypeEnum.Cookie, userId: "123" },
      fetchContext: {
        kind: "current-tab",
        tabId: 27,
        origin: "https://ultrarouter.org",
        cookieStoreId: "test-store",
        incognito: true,
      },
      currentTabFallback: "forbid",
    })
    expect(requests[0]?.auth).not.toHaveProperty("accessToken")
  })

  it("preserves browser context and drops a mismatched tab context", async () => {
    const requests: ApiServiceRequest[] = []
    mockGetAllTabs.mockRejectedValue(new Error("tabs API unavailable"))
    mockEnvelope.mockImplementation(
      async (request: ApiServiceRequest, options: { endpoint: string }) => {
        requests.push(request)
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({ id: "123", quota: 1_000 })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: null,
            settings: { enabled: true },
            budgets: { can_start: true },
          })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: true } })
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )
    const getStatus = ultraRouterGameProvider.getStatus
    if (!getStatus) throw new Error("UltraRouter provider must expose status")

    await getStatus({
      account,
      observedAt: 1,
      request: {
        baseUrl: account.site_url,
        fetchContext: {
          kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
          incognito: true,
          cookieStoreId: "test-store",
        },
      },
    } as never)
    await getStatus({ account, observedAt: 2 } as never)
    await getStatus({
      account,
      observedAt: 3,
      request: {
        baseUrl: account.site_url,
        fetchContext: {
          kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
          tabId: 99,
          origin: "https://other.example",
        },
      },
    } as never)

    expect(requests[0]?.fetchContext).toMatchObject({
      kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
      cookieStoreId: "test-store",
      incognito: true,
    })
    expect(requests[3]?.fetchContext).toBeUndefined()
    expect(requests[6]?.fetchContext).toBeUndefined()
    expect(mockGetAllTabs).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: "missing user id", self: { quota: 1_000 } },
    { name: "negative quota", self: { id: "123", quota: -1 } },
    { name: "invalid quota", self: { id: "123", quota: "unknown" } },
  ])(
    "does not start if the account's user data has $name",
    async ({ self }) => {
      const startCount = vi.fn()
      mockEnvelope.mockImplementation(
        async (_request: ApiServiceRequest, options: { endpoint: string }) => {
          if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
            return response(self)
          if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start)
            startCount()
          throw new Error(`Unexpected endpoint: ${options.endpoint}`)
        },
      )

      const result = await ultraRouterGameProvider.checkIn(account, context)

      expect(result.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
      expect(startCount).not.toHaveBeenCalled()
    },
  )

  it("rejects accounts without provider data and accounts on a different origin", async () => {
    const missingAccount = { site_url: account.site_url }
    const noData = await ultraRouterGameProvider.checkIn(
      missingAccount as never,
      context,
    )
    const otherOrigin = await ultraRouterGameProvider.checkIn(
      { ...account, site_url: "https://other.example" },
      context,
    )

    expect(noData.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
    expect(otherOrigin.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
    expect(mockEnvelope).not.toHaveBeenCalled()
  })

  it("chooses real server-listed drops and emits at most 20 legal frames", () => {
    const run = makeRun({
      state: {
        ...makeRun().state,
        tokens: [{ x: 7_000, y: 3_500, value: 10 }],
      },
    })
    const originalTokens = structuredClone(run.state.tokens)
    expect(chooseUltraRouterGameDirection(run.state)).toBe(3)
    const inputs = buildUltraRouterGameInputBatch(run)
    expect(inputs).toHaveLength(20)
    expect(inputs.every((input) => input >= 0 && input <= 255)).toBe(true)
    expect(run.state.tokens).toEqual(originalTokens)
    expect(readUltraRouterGameClock(run.state)).toBe(0)
  })

  it("avoids starting a game for the wrong account or an unavailable daily run", async () => {
    const startAccounts: string[] = []
    mockEnvelope.mockImplementation(
      async (_request: ApiServiceRequest, options: { endpoint: string }) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({ id: "not-123", quota: 1_000 })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: null,
            settings: { enabled: true },
            budgets: { can_start: true },
          })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: true } })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start)
          startAccounts.push("started")
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    const result = await ultraRouterGameProvider.checkIn(account, context)

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
    expect(startAccounts).toEqual([])
  })

  it.each([
    {
      name: "an existing run",
      run: makeRun(),
      enabled: true,
      canStart: false,
      result: CHECKIN_RESULT_STATUS.FAILED,
    },
    {
      name: "a completed run",
      run: makeRun({
        status: "survived",
        state: { ...makeRun().state, picked_tokens: 1 },
      }),
      enabled: true,
      canStart: false,
      result: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    },
    {
      name: "a disabled game",
      run: null,
      enabled: false,
      canStart: true,
      result: CHECKIN_RESULT_STATUS.FAILED,
    },
    {
      name: "an exhausted reward budget",
      run: null,
      enabled: true,
      canStart: false,
      result: CHECKIN_RESULT_STATUS.FAILED,
    },
  ])(
    "does not start when preflight finds $name",
    async ({ run, enabled, canStart, result: expected }) => {
      const startCount = vi.fn()
      mockEnvelope.mockImplementation(
        async (_request: ApiServiceRequest, options: { endpoint: string }) => {
          if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
            return response({ id: "123", quota: 1_000 })
          if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
            return response({
              run,
              settings: { enabled },
              budgets: { can_start: canStart },
            })
          if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
            return response({ budgets: { can_start: canStart } })
          if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start)
            startCount()
          throw new Error(`Unexpected endpoint: ${options.endpoint}`)
        },
      )

      const outcome = await ultraRouterGameProvider.checkIn(account, context)

      expect(outcome.status).toBe(expected)
      expect(startCount).not.toHaveBeenCalled()
    },
  )

  it("starts once, follows paced server input cursors, and succeeds only after a quota readback", async () => {
    let currentRun: UltraRouterGameRun | null = null
    let startCount = 0
    const inputBatches: Array<{ from: number; inputs: number[] }> = []
    mockEnvelope.mockImplementation(
      async (
        request: ApiServiceRequest,
        options: { endpoint: string; options?: RequestInit },
      ) => {
        const { endpoint } = options
        if (endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({
            id: "123",
            quota: currentRun?.status === "survived" ? 1_250 : 1_000,
          })
        if (endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: currentRun,
            settings: { enabled: true },
            budgets: { can_start: currentRun === null },
          })
        if (endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: currentRun === null } })
        if (endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
          startCount += 1
          request.observer?.onDispatch()
          currentRun = makeRun()
          request.observer?.onResponse()
          return response(currentRun)
        }
        if (endpoint === ULTRAROUTER_GAME_ENDPOINTS.Input) {
          const batch = JSON.parse(String(options.options?.body)) as {
            from: number
            inputs: number[]
          }
          inputBatches.push(batch)
          request.observer?.onDispatch()
          const state = currentRun!.state
          expect(batch.from).toBe(state.clock_tick)
          expect(batch.inputs.length).toBeLessThanOrEqual(20)
          const upgradeCount = batch.inputs.filter(
            (input) => input >> 5 > 0,
          ).length
          currentRun = makeRun({
            status:
              state.tick + batch.inputs.length - upgradeCount >= 900
                ? "survived"
                : "running",
            state: {
              ...state,
              clock_tick: state.clock_tick! + batch.inputs.length,
              tick: state.tick + batch.inputs.length - upgradeCount,
              upgrades: state.upgrades + upgradeCount,
              picked_tokens:
                state.tick + batch.inputs.length - upgradeCount >= 900 ? 2 : 0,
            },
          })
          request.observer?.onResponse()
          return response(currentRun)
        }
        throw new Error(`Unexpected endpoint: ${endpoint}`)
      },
    )

    let complete = false
    const resultPromise = ultraRouterGameProvider
      .checkIn(account, context)
      .finally(() => {
        complete = true
      })
    for (let step = 0; step < 70 && !complete; step += 1) {
      await vi.advanceTimersByTimeAsync(2_000)
      await Promise.resolve()
    }
    const result = await resultPromise
    expect(startCount).toBe(1)
    expect(inputBatches.length).toBeGreaterThan(40)
    expect(new Set(inputBatches.map((batch) => batch.from)).size).toBe(
      inputBatches.length,
    )
    expect(inputBatches.every((batch) => batch.inputs.length <= 20)).toBe(true)
    expect(result.status).toBe(CHECKIN_RESULT_STATUS.SUCCESS)
    expect(result.awards?.[0]?.amount.status).toBe("known")
  })

  it("never retries a start whose result cannot be read back", async () => {
    let startCount = 0
    let inputCount = 0
    mockEnvelope.mockImplementation(
      async (
        request: ApiServiceRequest,
        options: { endpoint: string; options?: RequestInit },
      ) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({ id: "123", quota: 1_000 })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: null,
            settings: { enabled: true },
            budgets: { can_start: true },
          })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: true } })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
          startCount += 1
          request.observer?.onDispatch()
          throw new Error("lost start response")
        }
        inputCount += 1
        return undefined
      },
    )
    const result = await ultraRouterGameProvider.checkIn(account, context)
    expect(result.status).toBe(CHECKIN_RESULT_STATUS.UNCERTAIN)
    expect(startCount).toBe(1)
    expect(inputCount).toBe(0)
  })

  it("continues a start whose response is lost when readback confirms the run", async () => {
    let startCount = 0
    let inputCount = 0
    const run = makeRun()
    mockEnvelope.mockImplementation(
      async (request: ApiServiceRequest, options: { endpoint: string }) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({ id: "123", quota: 1_000 })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: startCount > 0 ? run : null,
            settings: { enabled: true },
            budgets: { can_start: startCount === 0 },
          })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: startCount === 0 } })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
          startCount += 1
          request.observer?.onDispatch()
          throw new Error("start accepted, response lost")
        }
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Input) {
          inputCount += 1
          return { success: false, message: "invalid input" }
        }
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    const result = await ultraRouterGameProvider.checkIn(account, context)

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.UNCERTAIN)
    expect(startCount).toBe(1)
    expect(inputCount).toBe(1)
  })

  it("returns an upstream rejection when the server explicitly rejects game start", async () => {
    const mutationRequests: ApiServiceRequest[] = []
    const mutationLifecycle = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
      onMutationAccepted: vi.fn(),
      onPreHandlerUnauthorized: vi.fn(),
      onCookieRecovered: vi.fn(),
    }
    mockEnvelope.mockImplementation(
      async (request: ApiServiceRequest, options: { endpoint: string }) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({ id: "123", quota: 1_000 })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: null,
            settings: { enabled: true },
            budgets: { can_start: true },
          })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: true } })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
          mutationRequests.push(request)
          request.observer?.onDispatch()
          request.observer?.onResponse()
          request.observer?.onMutationAccepted?.()
          request.observer?.onPreHandlerUnauthorized?.()
          request.observer?.onCookieRecovered?.("recovered-cookie", 2)
          return { success: false, message: "daily game already started" }
        }
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    const result = await ultraRouterGameProvider.checkIn(account, {
      tempWindowRequestSource: "background",
      protectionBypassExecution: { kind: "automatic" },
      mutationLifecycle,
    } as never)

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
    expect(result.rawMessage).toContain("already started")
    expect(mutationRequests).toHaveLength(1)
    expect(mutationLifecycle.onDispatch).toHaveBeenCalledOnce()
    expect(mutationLifecycle.onResponse).toHaveBeenCalledOnce()
    expect(mutationLifecycle.onMutationAccepted).toHaveBeenCalledOnce()
    expect(mutationLifecycle.onPreHandlerUnauthorized).toHaveBeenCalledOnce()
    expect(mutationLifecycle.onCookieRecovered).toHaveBeenCalledWith(
      "recovered-cookie",
      2,
    )
  })

  it("does not continue after the server explicitly rejects an input batch", async () => {
    let startCount = 0
    let inputCount = 0
    mockEnvelope.mockImplementation(
      async (request: ApiServiceRequest, options: { endpoint: string }) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({ id: "123", quota: 1_000 })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: null,
            settings: { enabled: true },
            budgets: { can_start: true },
          })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: true } })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
          startCount += 1
          request.observer?.onDispatch()
          request.observer?.onResponse()
          return response(makeRun())
        }
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Input) {
          inputCount += 1
          request.observer?.onDispatch()
          request.observer?.onResponse()
          return { success: false, message: "invalid input range" }
        }
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    const result = await ultraRouterGameProvider.checkIn(account, context)

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
    expect(result.rawMessage).toContain("invalid input range")
    expect(startCount).toBe(1)
    expect(inputCount).toBe(1)
  })

  it.each(["start", "input"] as const)(
    "maps a %s transport failure before dispatch without replaying it",
    async (failedMutation) => {
      let startCount = 0
      let inputCount = 0
      mockEnvelope.mockImplementation(
        async (request: ApiServiceRequest, options: { endpoint: string }) => {
          if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
            return response({ id: "123", quota: 1_000 })
          if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
            return response({
              run: null,
              settings: { enabled: true },
              budgets: { can_start: true },
            })
          if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
            return response({ budgets: { can_start: true } })
          if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
            startCount += 1
            if (failedMutation === "start")
              throw new Error("start transport failed")
            request.observer?.onDispatch()
            request.observer?.onResponse()
            return response(makeRun())
          }
          if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Input) {
            inputCount += 1
            throw new Error("input transport failed before dispatch")
          }
          throw new Error(`Unexpected endpoint: ${options.endpoint}`)
        },
      )

      const result = await ultraRouterGameProvider.checkIn(account, context)

      expect(result.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
      expect(startCount).toBe(1)
      expect(inputCount).toBe(failedMutation === "input" ? 1 : 0)
    },
  )

  it("keeps a dispatched start uncertain when its status readback fails", async () => {
    let statusReads = 0
    let startCount = 0
    mockEnvelope.mockImplementation(
      async (request: ApiServiceRequest, options: { endpoint: string }) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({ id: "123", quota: 1_000 })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status) {
          statusReads += 1
          if (statusReads > 1) throw new Error("status readback unavailable")
          return response({
            run: null,
            settings: { enabled: true },
            budgets: { can_start: true },
          })
        }
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: true } })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
          startCount += 1
          request.observer?.onDispatch()
          throw new Error("start response unavailable")
        }
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    const result = await ultraRouterGameProvider.checkIn(account, context)

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.UNCERTAIN)
    expect(statusReads).toBe(2)
    expect(startCount).toBe(1)
  })

  it("fails when the server ends the game without a survived run", async () => {
    let currentRun: UltraRouterGameRun | null = null
    mockEnvelope.mockImplementation(
      async (
        request: ApiServiceRequest,
        options: { endpoint: string; options?: RequestInit },
      ) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({ id: "123", quota: 1_000 })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: currentRun,
            settings: { enabled: true },
            budgets: { can_start: currentRun === null },
          })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: currentRun === null } })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
          request.observer?.onDispatch()
          currentRun = makeRun()
          request.observer?.onResponse()
          return response(currentRun)
        }
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Input) {
          request.observer?.onDispatch()
          request.observer?.onResponse()
          currentRun = makeRun({
            status: "dead",
            state: { ...currentRun!.state, tick: 1, clock_tick: 1 },
          })
          return response(currentRun)
        }
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    const result = await ultraRouterGameProvider.checkIn(account, context)

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
    expect(result.rawMessage).toContain("ended before completion")
    expect(result.awards).toBeUndefined()
  })

  it("does not confirm a completed run when final account readback fails", async () => {
    const completedRun = makeRun({
      status: "survived",
      state: { ...makeRun().state, picked_tokens: 1 },
    })
    let selfReads = 0
    let statusReads = 0
    mockEnvelope.mockImplementation(
      async (request: ApiServiceRequest, options: { endpoint: string }) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self) {
          selfReads += 1
          if (selfReads > 1) throw new Error("final quota read unavailable")
          return response({ id: "123", quota: 1_000 })
        }
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status) {
          statusReads += 1
          return response({
            run: statusReads === 1 ? null : completedRun,
            settings: { enabled: true },
            budgets: { can_start: statusReads === 1 },
          })
        }
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: statusReads === 1 } })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
          request.observer?.onDispatch()
          request.observer?.onResponse()
          return response(completedRun)
        }
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    const result = await ultraRouterGameProvider.checkIn(account, context)

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.UNCERTAIN)
    expect(result.rawMessage).toContain("final quota read unavailable")
    expect(result.awards).toBeUndefined()
  })

  it("stops a running game at its deadline without replaying the active input", async () => {
    let currentRun: UltraRouterGameRun | null = null
    let inputCount = 0
    const mutationLifecycle = {
      dispatched: false,
      onDispatch() {
        mutationLifecycle.dispatched = true
      },
    }
    mockEnvelope.mockImplementation(
      async (request: ApiServiceRequest, options: { endpoint: string }) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({ id: "123", quota: 1_000 })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: currentRun,
            settings: { enabled: true },
            budgets: { can_start: currentRun === null },
          })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: currentRun === null } })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
          request.observer?.onDispatch()
          currentRun = makeRun()
          request.observer?.onResponse()
          return response(currentRun)
        }
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Input) {
          inputCount += 1
          request.observer?.onDispatch()
          await vi.advanceTimersByTimeAsync(ULTRAROUTER_GAME_RULES.maximumRunMs)
          throw new Error("input expired with the game deadline")
        }
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    const result = await ultraRouterGameProvider.checkIn(account, {
      tempWindowRequestSource: "background",
      protectionBypassExecution: { kind: "automatic" },
      mutationLifecycle,
    } as never)

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.UNCERTAIN)
    expect(inputCount).toBe(1)
  })

  it("does not resend a dispatched input batch when readback shows no progress", async () => {
    let currentRun: UltraRouterGameRun | null = null
    let startCount = 0
    let inputCount = 0
    mockEnvelope.mockImplementation(
      async (
        request: ApiServiceRequest,
        options: { endpoint: string; options?: RequestInit },
      ) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({ id: "123", quota: 1_000 })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: currentRun,
            settings: { enabled: true },
            budgets: { can_start: currentRun === null },
          })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: currentRun === null } })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
          startCount += 1
          request.observer?.onDispatch()
          currentRun = makeRun()
          request.observer?.onResponse()
          return response(currentRun)
        }
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Input) {
          inputCount += 1
          request.observer?.onDispatch()
          throw new Error("input response lost without server progress")
        }
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    const result = await ultraRouterGameProvider.checkIn(account, context)
    expect(result.status).toBe(CHECKIN_RESULT_STATUS.UNCERTAIN)
    expect(startCount).toBe(1)
    expect(inputCount).toBe(1)
  })

  it("continues from the confirmed cursor after an input response is lost", async () => {
    let currentRun: UltraRouterGameRun | null = null
    const inputCursors: number[] = []
    let selfReads = 0
    mockEnvelope.mockImplementation(
      async (
        request: ApiServiceRequest,
        options: { endpoint: string; options?: RequestInit },
      ) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self) {
          selfReads += 1
          return response({ id: "123", quota: selfReads > 1 ? 1_250 : 1_000 })
        }
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: currentRun,
            settings: { enabled: true },
            budgets: { can_start: currentRun === null },
          })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: currentRun === null } })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
          request.observer?.onDispatch()
          currentRun = makeRun()
          request.observer?.onResponse()
          return response(currentRun)
        }
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Input) {
          const body = JSON.parse(String(options.options?.body)) as {
            from: number
          }
          inputCursors.push(body.from)
          request.observer?.onDispatch()
          if (inputCursors.length === 1) {
            currentRun = makeRun({
              state: { ...currentRun!.state, tick: 20, clock_tick: 20 },
            })
            throw new Error("input response lost after server progress")
          }
          currentRun = makeRun({
            status: "survived",
            state: {
              ...currentRun!.state,
              tick: 40,
              clock_tick: 40,
              picked_tokens: 1,
            },
          })
          request.observer?.onResponse()
          return response(currentRun)
        }
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    let complete = false
    const resultPromise = ultraRouterGameProvider
      .checkIn(account, context)
      .finally(() => {
        complete = true
      })
    for (let step = 0; step < 4 && !complete; step += 1) {
      await vi.advanceTimersByTimeAsync(2_000)
      await Promise.resolve()
    }
    const result = await resultPromise

    expect(inputCursors).toEqual([0, 20])
    expect(result.status).toBe(CHECKIN_RESULT_STATUS.SUCCESS)
    expect(result.awards).toHaveLength(1)
  })

  it("does not report a survived run as a grant without a server-recorded pickup", async () => {
    const completedRun = makeRun({
      status: "survived",
      state: { ...makeRun().state, picked_tokens: 0 },
    })
    mockEnvelope.mockImplementation(
      async (request: ApiServiceRequest, options: { endpoint: string }) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self)
          return response({ id: "123", quota: 1_000 })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status)
          return response({
            run: null,
            settings: { enabled: true },
            budgets: { can_start: true },
          })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: true } })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
          request.observer?.onDispatch()
          request.observer?.onResponse()
          return response(completedRun)
        }
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    const result = await ultraRouterGameProvider.checkIn(account, context)

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
    expect(result.awards).toBeUndefined()
  })

  it.each([
    {
      name: "a different terminal run",
      finalRun: (run: UltraRouterGameRun) => ({ ...run, id: "other-run" }),
    },
    { name: "no quota increase", finalRun: (run: UltraRouterGameRun) => run },
  ])("keeps a completed game uncertain with $name", async ({ finalRun }) => {
    const completedRun = makeRun({
      status: "survived",
      state: { ...makeRun().state, picked_tokens: 1 },
    })
    let selfReads = 0
    let statusReads = 0
    mockEnvelope.mockImplementation(
      async (request: ApiServiceRequest, options: { endpoint: string }) => {
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Self) {
          selfReads += 1
          return response({ id: "123", quota: 1_000 })
        }
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Status) {
          statusReads += 1
          return response({
            run: statusReads === 1 ? null : finalRun(completedRun),
            settings: { enabled: true },
            budgets: { can_start: true },
          })
        }
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Rewards)
          return response({ budgets: { can_start: true } })
        if (options.endpoint === ULTRAROUTER_GAME_ENDPOINTS.Start) {
          request.observer?.onDispatch()
          request.observer?.onResponse()
          return response(completedRun)
        }
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      },
    )

    const result = await ultraRouterGameProvider.checkIn(account, context)

    expect(result).toMatchObject({ status: CHECKIN_RESULT_STATUS.UNCERTAIN })
    expect(result.awards).toBeUndefined()
  })

  it("covers directional avoidance, idle movement, legal upgrade frames, and legacy clocks", () => {
    const state = makeRun().state
    expect(
      chooseUltraRouterGameDirection({
        ...state,
        enemies: [{ x: state.x + 100, y: state.y }],
      }),
    ).toBe(7)
    expect(chooseUltraRouterGameDirection({ ...state, tick: 80 })).toBe(4)
    expect(
      chooseUltraRouterGameDirection({
        ...state,
        enemies: [{ x: state.x + 1_000, y: state.y }],
      }),
    ).toBe(7)
    expect(
      chooseUltraRouterGameDirection({
        ...state,
        tokens: [{ x: state.x, y: state.y, value: 10 }],
      }),
    ).toBe(0)
    expect(
      chooseUltraRouterGameDirection({
        ...state,
        enemies: [{ x: state.x + 1_800, y: state.y }],
      }),
    ).toBe(3)
    expect(
      chooseUltraRouterGameDirection({
        ...state,
        tokens: [
          { x: state.x + 1_500, y: state.y, value: 10 },
          { x: state.x + 1_000, y: state.y, value: 10 },
        ],
      }),
    ).toBe(3)
    expect(
      readUltraRouterGameClock({
        ...state,
        version: 1,
        tick: 9,
        clock_tick: 20,
      }),
    ).toBe(9)
    expect(
      isCompletedUltraRouterGame(
        makeRun({ status: "survived", state: { ...state, picked_tokens: 0 } }),
      ),
    ).toBe(false)

    const upgradedRun = makeRun({
      state: {
        ...state,
        tick: 200,
        upgrades: 0,
        enemies: [
          { x: state.x + 100, y: state.y },
          { x: state.x + 200, y: state.y },
        ],
      },
    })
    const inputs = buildUltraRouterGameInputBatch(upgradedRun)
    expect(inputs).toHaveLength(20)
    expect(inputs[0]).toBe(3 << 5)
    expect(inputs[1]).toBe(7 | 16)

    const lastTickRun = makeRun({
      state: { ...state, tick: 899, upgrades: 3 },
    })
    expect(buildUltraRouterGameInputBatch(lastTickRun)).toHaveLength(1)
  })
})
