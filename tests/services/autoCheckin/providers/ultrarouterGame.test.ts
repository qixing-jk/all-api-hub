import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { ultraRouterGameProvider } from "~/services/checkin/autoCheckin/providers/ultrarouterGame"
import {
  buildUltraRouterGameInputBatch,
  chooseUltraRouterGameDirection,
  parseUltraRouterGameSnapshot,
  readUltraRouterGameClock,
  ULTRAROUTER_GAME_ENDPOINTS,
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
})
