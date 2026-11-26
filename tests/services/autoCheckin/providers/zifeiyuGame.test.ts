import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { readZifeiyuGameRewards } from "~/services/apiService/newApiFamily/zifeiyuGame"
import { ApiError } from "~/services/apiTransport/errors"
import type { AutoCheckinProviderContext } from "~/services/checkin/autoCheckin/providers/contracts"
import { zifeiyuGameProvider } from "~/services/checkin/autoCheckin/providers/zifeiyuGame"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

const { data } = vi.hoisted(() => ({ data: vi.fn() }))

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { data },
}))

const account = {
  id: "saved-account",
  site_type: SITE_TYPES.NEW_API,
  site_url: "https://ai.112102.xyz/",
  account_info: { id: 17 },
} as unknown as SiteAccount

const status = {
  settings: { enabled: true, rewards_enabled: true },
  budgets: { can_start: false, daily_remaining: 0, max_run_reward: 100 },
  run: null,
  day: "2026-11-27",
  week: "2026-W48",
  resets_at: 1795824000000,
  server_time: 1795737600000,
}

const completedStatus = {
  ...status,
  budgets: { ...status.budgets, can_start: false, daily_remaining: 0 },
  run: {
    id: "completed-run",
    day: status.day,
    week: status.week,
    started_at: status.server_time - 90_000,
    finished_at: status.server_time,
    status: "survived",
    score: 500,
    quota_awarded: 100,
    reward_version: 2,
    first_token_quota: 100,
    subsequent_token_quota: 10,
    server_time: status.server_time,
    state: {
      version: 4,
      tick: 900,
      clock_tick: 903,
      hp: 20,
      x: 5000,
      y: 3500,
      collected: 0,
      enemies: [],
      tokens: [],
    },
  },
}

const rewards = {
  budgets: {
    daily_quota: 100,
    daily_remaining: 1,
    weekly_pool: 500,
    first_token_quota: 100,
    subsequent_token_quota: 10,
    daily_reserved: 0,
    unlimited: false,
    max_run_reward: 300,
    can_start: true,
  },
  week: status.week,
  enabled: true,
  rewards_enabled: true,
  server_time: status.server_time,
}

const context: AutoCheckinProviderContext = {
  tempWindowRequestSource: "automatic_checkin" as never,
  protectionBypassExecution: {} as never,
}

describe("ZIFEIYU game check-in provider", () => {
  beforeEach(() => data.mockReset())

  it("requires a saved account identity and the exact HTTPS origin", () => {
    expect(zifeiyuGameProvider.getReadiness(account)).toEqual({ ready: true })
    expect(
      zifeiyuGameProvider.getReadiness({
        ...account,
        site_url: "http://ai.112102.xyz/",
      }),
    ).toMatchObject({ ready: false })
  })

  it("classifies an enabled game with no remaining attempt without starting it", async () => {
    data.mockResolvedValueOnce({ id: 17 }).mockResolvedValueOnce(status)

    const result = await zifeiyuGameProvider.checkIn(account, context)

    expect(result).toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE,
    })
    expect(data).toHaveBeenCalledTimes(2)
    expect(
      data.mock.calls.map(([request, options]) => [
        request.auth.authType,
        request.auth.accessToken,
        options.endpoint,
      ]),
    ).toEqual([
      ["cookie", undefined, "/api/user/self"],
      ["cookie", undefined, "/api/user/game"],
    ])
  })

  it("uses the side-effect-free rewards route for discovery", async () => {
    data.mockResolvedValueOnce({ id: 17 }).mockResolvedValueOnce(rewards)
    await expect(readZifeiyuGameRewards(account)).resolves.toEqual(rewards)

    data.mockReset()
    data.mockResolvedValueOnce({ id: 17 }).mockResolvedValueOnce(rewards)

    const result = await zifeiyuGameProvider.detect?.({
      account,
      observedAt: status.server_time,
    })

    expect(data.mock.calls.map(([, options]) => options.endpoint)).toEqual([
      "/api/user/self",
      "/api/user/game/rewards",
    ])
    expect(result).toMatchObject({
      detection: { outcome: "matched" },
      status: { outcome: "known", availability: "enabled" },
    })
    if (result && "status" in result && result.status?.outcome === "known") {
      expect(result.status.today).toBeUndefined()
    }
  })

  it("does not start a second daily game when the authoritative run is complete", async () => {
    data
      .mockResolvedValueOnce({ id: 17 })
      .mockResolvedValueOnce(completedStatus)

    const result = await zifeiyuGameProvider.checkIn(account, context)

    expect(result).toMatchObject({
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      data: { id: "completed-run" },
    })
    expect(result.awards ?? []).toEqual([])
    expect(data).toHaveBeenCalledTimes(2)
    expect(data.mock.calls.map(([, options]) => options.endpoint)).toEqual([
      "/api/user/self",
      "/api/user/game",
    ])
  })

  it("reports a fresh reward only after account quota readback matches the final run", async () => {
    const eligibleStatus = {
      ...status,
      budgets: { ...status.budgets, can_start: true, daily_remaining: 1 },
    }
    const finishedRun = {
      ...completedStatus.run,
      id: "fresh-run",
      quota_awarded: 100,
    }
    data
      .mockResolvedValueOnce({ id: 17 })
      .mockResolvedValueOnce(eligibleStatus)
      .mockResolvedValueOnce({ id: 17, quota: 1_000 })
      .mockResolvedValueOnce(finishedRun)
      .mockResolvedValueOnce({ id: 17, quota: 1_100 })

    const result = await zifeiyuGameProvider.checkIn(account, context)

    expect(result).toMatchObject({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      awards: [
        expect.objectContaining({
          amount: expect.objectContaining({
            value: "100",
            source: expect.objectContaining({
              operation: "/api/user/self:quota",
              inputs: ["quota"],
            }),
          }),
        }),
      ],
    })
    expect(data.mock.calls.map(([, options]) => options.endpoint)).toEqual([
      "/api/user/self",
      "/api/user/game",
      "/api/user/self",
      "/api/user/game/start",
      "/api/user/self",
    ])
  })

  it("does not report a game reward when account quota readback disagrees", async () => {
    const eligibleStatus = {
      ...status,
      budgets: { ...status.budgets, can_start: true, daily_remaining: 1 },
    }
    const finishedRun = {
      ...completedStatus.run,
      id: "uncertain-run",
      quota_awarded: 100,
    }
    data
      .mockResolvedValueOnce({ id: 17 })
      .mockResolvedValueOnce(eligibleStatus)
      .mockResolvedValueOnce({ id: 17, quota: 1_000 })
      .mockResolvedValueOnce(finishedRun)
      .mockResolvedValueOnce({ id: 17, quota: 1_090 })

    const result = await zifeiyuGameProvider.checkIn(account, context)

    expect(result).toMatchObject({
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
    })
    expect(result.awards ?? []).toEqual([])
  })

  it("returns an explicit login blocker without falling back to the saved API token", async () => {
    data.mockRejectedValueOnce(
      new ApiError("login required", 401, "/api/user/self"),
    )

    const result = await zifeiyuGameProvider.checkIn(account, context)

    expect(result).toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    })
    expect(data).toHaveBeenCalledTimes(1)
    expect(data.mock.calls[0]?.[0].auth).toMatchObject({
      authType: "cookie",
      userId: 17,
    })
    expect(data.mock.calls[0]?.[0].auth.accessToken).toBeUndefined()
  })

  it("does not start a game when the browser cookie identifies another account", async () => {
    data.mockResolvedValueOnce({ id: 99 })

    const result = await zifeiyuGameProvider.checkIn(account, context)

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
    expect(data).toHaveBeenCalledTimes(1)
    expect(data.mock.calls[0]?.[1].options.method).toBe("GET")
  })
})
