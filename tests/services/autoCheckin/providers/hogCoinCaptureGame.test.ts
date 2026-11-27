import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  HOG_COIN_CAPTURE_ENDPOINTS,
  type HogCoinCaptureGameState,
  type HogCoinCaptureView,
} from "~/services/apiService/newApiFamily/variants/hogCoinCaptureGame"
import { API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES } from "~/services/apiTransport/type"
import {
  hogCoinCaptureGameProvider,
  isHogCoinCaptureOnlineWindow,
} from "~/services/checkin/autoCheckin/providers/hogCoinCaptureGame"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { envelope: vi.fn() },
}))
vi.mock("~/utils/browser/tabs", () => ({
  getAllTabs: vi.fn(async () => [
    { id: 7, url: "https://fapi.leileihog.top/midnight-heist" },
  ]),
}))

const game: HogCoinCaptureGameState = {
  player: { x: 450, y: 270, tx: 450, ty: 270, r: 12 },
  coins: [{ x: 80, y: 75, value: 1, r: 9, alive: true }],
}

const round = (input: {
  startedAt: number
  status?: 1 | 2
  quota?: number
  roundId?: string
}): NonNullable<HogCoinCaptureView["round"]> => ({
  round_id: input.roundId ?? "round-1",
  game_day: "2026-11-27",
  status: input.status ?? 1,
  score: input.status === 2 ? 10 : 0,
  reward_cents: input.status === 2 ? 1 : 0,
  quota: input.quota ?? 0,
  started_at: input.startedAt,
  settled_at: input.status === 2 ? input.startedAt + 40_000 : 0,
  sequence: input.status === 2 ? 1 : 0,
})

const view = (
  serverTime: number,
  currentRound: HogCoinCaptureView["round"],
  currentGame?: HogCoinCaptureGameState,
): HogCoinCaptureView => ({
  round: currentRound,
  ...(currentGame ? { game: currentGame } : {}),
  server_time: serverTime,
})

const account = () =>
  buildSiteAccount({
    id: "hog-test-account",
    site_url: "https://fapi.leileihog.top",
    site_type: SITE_TYPES.NEW_API,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: "user-7",
      access_token: "must-not-be-used",
      username: "Test",
      quota: 100,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
  })

const executionContext = () => ({
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
})

const response = (data: unknown) => ({
  success: true,
  message: "ok",
  data,
})

const flushPromises = async () => {
  for (let index = 0; index < 30; index += 1) await Promise.resolve()
}

describe("Hog Coin Capture provider", () => {
  const envelope = vi.mocked(newApiFamilyRequests.envelope)

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it("respects the deployment's 09:00–22:00 China Standard Time window", () => {
    expect(
      isHogCoinCaptureOnlineWindow(Date.parse("2026-11-27T08:59:00+08:00")),
    ).toBe(false)
    expect(
      isHogCoinCaptureOnlineWindow(Date.parse("2026-11-27T09:00:00+08:00")),
    ).toBe(true)
    expect(
      isHogCoinCaptureOnlineWindow(Date.parse("2026-11-27T21:59:00+08:00")),
    ).toBe(true)
    expect(
      isHogCoinCaptureOnlineWindow(Date.parse("2026-11-27T22:00:00+08:00")),
    ).toBe(false)
  })

  it("uses the matching same-origin cookie session and rejects identity mismatch before writes", async () => {
    envelope.mockImplementation(async (_request, { endpoint }) => {
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.UserSelf)
        return response({ id: "another-user", quota: 100 })
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.PublicStatus)
        return response({
          SidebarModulesAdmin: { personal: { welfareAirdrop: true } },
        })
      throw new Error(`unexpected endpoint ${endpoint}`)
    })

    const result = await hogCoinCaptureGameProvider.checkIn(
      account(),
      executionContext(),
    )

    expect(result).toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
    })
    expect(envelope).toHaveBeenCalledTimes(1)
    const request = envelope.mock.calls[0]?.[0]
    expect(request?.auth.authType).toBe(AuthTypeEnum.Cookie)
    expect(request?.auth.accessToken).toBeUndefined()
    expect(request?.currentTabFallback).toBe(
      API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid,
    )
    expect(request?.fetchContext).toMatchObject({
      kind: "current-tab",
      origin: "https://fapi.leileihog.top",
    })
  })

  it("never starts a round when the site disables the game", async () => {
    envelope.mockImplementation(async (_request, { endpoint }) => {
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.UserSelf)
        return response({ id: "user-7", quota: 100 })
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.PublicStatus)
        return response({
          SidebarModulesAdmin: {
            personal: { enabled: true, welfareAirdrop: false },
          },
        })
      throw new Error(`unexpected endpoint ${endpoint}`)
    })

    const result = await hogCoinCaptureGameProvider.checkIn(
      account(),
      executionContext(),
    )

    expect(result).toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
    })
    expect(envelope).toHaveBeenCalledTimes(2)
  })

  it("does not start again after today's round has settled", async () => {
    const now = Date.now()
    envelope.mockImplementation(async (_request, { endpoint }) => {
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.UserSelf)
        return response({ id: "user-7", quota: 600 })
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.PublicStatus)
        return response({
          SidebarModulesAdmin: { personal: { welfareAirdrop: true } },
        })
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.GameStatus)
        return response(
          view(now, round({ startedAt: now - 40_000, status: 2, quota: 5000 })),
        )
      throw new Error(`unexpected endpoint ${endpoint}`)
    })

    const result = await hogCoinCaptureGameProvider.checkIn(
      account(),
      executionContext(),
    )

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.ALREADY_CHECKED)
    expect(
      envelope.mock.calls.some(
        ([, options]) => options.endpoint === HOG_COIN_CAPTURE_ENDPOINTS.Start,
      ),
    ).toBe(false)
  })

  it("waits the server round, settles once, and awards only the exact confirmed quota delta", async () => {
    vi.useFakeTimers()
    const now = Date.now()
    let selfReads = 0
    let gameStatusReads = 0
    const seenRequests: Array<{
      endpoint?: string
      body?: string
      request: Parameters<typeof newApiFamilyRequests.envelope>[0]
    }> = []

    envelope.mockImplementation(async (request, { endpoint, options }) => {
      seenRequests.push({
        endpoint,
        body: typeof options?.body === "string" ? options.body : undefined,
        request,
      })
      if (options?.method === "POST") request.observer?.onDispatch?.()
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.UserSelf) {
        selfReads += 1
        if (selfReads <= 2) return response({ id: "user-7", quota: 100 })
        return response({ id: "user-7", quota: 5100 })
      }
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.PublicStatus)
        return response({
          SidebarModulesAdmin: { personal: { welfareAirdrop: true } },
        })
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.GameStatus) {
        gameStatusReads += 1
        return response(
          gameStatusReads === 1
            ? view(now, null)
            : view(
                now + 40_000,
                round({ startedAt: now, status: 2, quota: 5000 }),
              ),
        )
      }
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.Start) {
        request.observer?.onResponse?.()
        return response(view(now, round({ startedAt: now }), game))
      }
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.Settle) {
        request.observer?.onResponse?.()
        return response(
          view(
            now + 40_000,
            round({
              startedAt: now,
              status: 2,
              quota: 5000,
            }),
          ),
        )
      }
      throw new Error(`unexpected endpoint ${endpoint}`)
    })

    const promise = hogCoinCaptureGameProvider.checkIn(
      account(),
      executionContext(),
    )
    await flushPromises()

    expect(
      seenRequests.filter(
        (item) => item.endpoint === HOG_COIN_CAPTURE_ENDPOINTS.Start,
      ),
    ).toHaveLength(1)
    expect(
      seenRequests.some(
        (item) => item.endpoint === HOG_COIN_CAPTURE_ENDPOINTS.Settle,
      ),
    ).toBe(false)
    await vi.advanceTimersByTimeAsync(40_500)
    const result = await promise

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.SUCCESS)
    expect(result.awards).toHaveLength(1)
    expect(result.data).toMatchObject({
      quotaBefore: 100,
      quotaAfter: 5100,
      roundId: "round-1",
    })
    const starts = seenRequests.filter(
      (item) => item.endpoint === HOG_COIN_CAPTURE_ENDPOINTS.Start,
    )
    const settles = seenRequests.filter(
      (item) => item.endpoint === HOG_COIN_CAPTURE_ENDPOINTS.Settle,
    )
    expect(starts).toHaveLength(1)
    expect(settles).toHaveLength(1)
    expect(JSON.parse(settles[0]?.body ?? "{}")).toMatchObject({
      round_id: "round-1",
      movements: [{ elapsed_ms: 0, x: 80, y: 75 }],
    })
  })

  it("does not replay a lost start even when its readback remains empty", async () => {
    let statusReads = 0
    let startCalls = 0
    envelope.mockImplementation(async (request, { endpoint, options }) => {
      if (options?.method === "POST") request.observer?.onDispatch?.()
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.UserSelf)
        return response({ id: "user-7", quota: 100 })
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.PublicStatus)
        return response({
          SidebarModulesAdmin: { personal: { welfareAirdrop: true } },
        })
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.GameStatus) {
        statusReads += 1
        return response(view(Date.now(), null))
      }
      if (endpoint === HOG_COIN_CAPTURE_ENDPOINTS.Start) {
        startCalls += 1
        throw new Error("lost response")
      }
      throw new Error(`unexpected endpoint ${endpoint}`)
    })

    const result = await hogCoinCaptureGameProvider.checkIn(
      account(),
      executionContext(),
    )

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.UNCERTAIN)
    expect(startCalls).toBe(1)
    expect(statusReads).toBe(2)
    expect(
      envelope.mock.calls.some(
        ([, options]) => options.endpoint === HOG_COIN_CAPTURE_ENDPOINTS.Settle,
      ),
    ).toBe(false)
  })
})
