import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  assertZifeiyuBrowserSessionIdentity,
  createZifeiyuBrowserSessionRequest,
  parseZifeiyuGameStatus,
  readZifeiyuAccountQuota,
  readZifeiyuGameRewards,
  readZifeiyuGameStatus,
  sendZifeiyuGameInputs,
  startZifeiyuGame,
} from "~/services/apiService/newApiFamily/zifeiyuGame"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"

const { data } = vi.hoisted(() => ({ data: vi.fn() }))

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { data },
}))

const account = {
  id: "saved-account",
  site_type: SITE_TYPES.NEW_API,
  site_url: "https://ai.112102.xyz/",
  account_info: { id: 17, access_token: "must-not-be-used" },
} as unknown as SiteAccount

const status = {
  settings: { enabled: true, rewards_enabled: true },
  budgets: { can_start: true, daily_remaining: 1, max_run_reward: 100 },
  run: null,
  day: "2026-11-27",
  week: "2026-W48",
  resets_at: 1795824000000,
  server_time: 1795737600000,
}

const run = {
  id: "run-1",
  day: "2026-11-27",
  week: "2026-W48",
  started_at: 1795737600000,
  finished_at: 0,
  status: "running",
  score: 0,
  quota_awarded: 0,
  reward_version: 2,
  first_token_quota: 100,
  subsequent_token_quota: 10,
  state: {
    version: 4,
    tick: 0,
    clock_tick: 0,
    rng: 42,
    hp: 100,
    x: 5000,
    y: 3500,
    enemies: [],
    tokens: [],
  },
  server_time: 1795737600000,
}

describe("ZIFEIYU browser-session game protocol", () => {
  beforeEach(() => data.mockReset())

  it("uses only the matching HTTPS host and ambient Cookie session", () => {
    const request = createZifeiyuBrowserSessionRequest(account)

    expect(request).toMatchObject({
      baseUrl: "https://ai.112102.xyz",
      accountId: account.id,
      directRequestReason: "provider_protocol",
      allowAccountCredentialRecovery: false,
      auth: { authType: AuthTypeEnum.Cookie, userId: 17 },
    })
    expect(request.auth.accessToken).toBeUndefined()
    expect(request.auth.cookie).toBeUndefined()
    expect(request.cookieSession).toBeUndefined()
    expect(request.fetchContext).toBeUndefined()
    expect(() =>
      createZifeiyuBrowserSessionRequest({
        ...account,
        site_url: "http://ai.112102.xyz/",
      }),
    ).toThrow("ZIFEIYU browser session is not available")
    expect(() =>
      createZifeiyuBrowserSessionRequest({
        ...account,
        site_url: "https://other.example/",
      }),
    ).toThrow("ZIFEIYU browser session is not available")
  })

  it("confirms the ambient browser login matches the saved account before reading game status", async () => {
    data.mockResolvedValueOnce({ id: 17 }).mockResolvedValueOnce(status)

    await expect(readZifeiyuGameStatus(account)).resolves.toEqual(status)

    expect(data).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        auth: { authType: AuthTypeEnum.Cookie, userId: 17 },
      }),
      {
        endpoint: "/api/user/self",
        options: { method: "GET", cache: "no-store" },
      },
    )
    expect(data).toHaveBeenNthCalledWith(2, expect.any(Object), {
      endpoint: "/api/user/game",
      options: { method: "GET", cache: "no-store" },
    })
  })

  it("stops before game calls when the ambient session belongs to another account", async () => {
    data.mockResolvedValueOnce({ id: 99 })

    await expect(assertZifeiyuBrowserSessionIdentity(account)).rejects.toThrow(
      "ZIFEIYU browser session belongs to another account",
    )
    expect(data).toHaveBeenCalledTimes(1)
  })

  it("reads credited quota from the matching account self endpoint", async () => {
    data.mockResolvedValueOnce({ id: 17, quota: 42_000 })

    await expect(readZifeiyuAccountQuota(account)).resolves.toBe(42_000)

    expect(data).toHaveBeenCalledWith(expect.any(Object), {
      endpoint: "/api/user/self",
      options: { method: "GET", cache: "no-store" },
    })
  })

  it("parses a decimal quota string for server reward reconciliation", async () => {
    data.mockResolvedValueOnce({ id: 17, quota: "42000" })

    await expect(readZifeiyuAccountQuota(account)).resolves.toBe(42_000)
  })

  it("rejects an unavailable or mismatched account quota readback", async () => {
    data.mockResolvedValueOnce({ id: 99, quota: 42_000 })
    await expect(readZifeiyuAccountQuota(account)).rejects.toThrow(
      "ZIFEIYU browser session belongs to another account",
    )

    data.mockReset()
    data.mockResolvedValueOnce({ id: 17, quota: "not-a-quota" })
    await expect(readZifeiyuAccountQuota(account)).rejects.toThrow(
      "ZIFEIYU account quota is unavailable for reward readback",
    )
  })

  it("rejects incomplete or malformed status data", () => {
    expect(parseZifeiyuGameStatus(status)).toEqual(status)
    expect(() => parseZifeiyuGameStatus({ ...status, day: "today" })).toThrow(
      "Invalid ZIFEIYU game status",
    )
  })

  it("rejects an incomplete read-only rewards response", async () => {
    data.mockResolvedValueOnce({ id: 17 }).mockResolvedValueOnce({
      budgets: { can_start: true },
      week: status.week,
      enabled: true,
      rewards_enabled: true,
      server_time: status.server_time,
    })

    await expect(readZifeiyuGameRewards(account)).rejects.toThrow(
      "Invalid ZIFEIYU game rewards status",
    )
  })

  it("marks start and input POSTs as mutations and enforces the server batch limit", async () => {
    data.mockResolvedValueOnce(run).mockResolvedValueOnce(run)
    const request = createZifeiyuBrowserSessionRequest(account)

    await startZifeiyuGame(account, request)
    await sendZifeiyuGameInputs(request, {
      id: "run-1",
      from: 0,
      inputs: [3, 19],
    })

    expect(data).toHaveBeenNthCalledWith(
      1,
      request,
      expect.objectContaining({
        endpoint: "/api/user/game/start",
        operationSemantics: "mutation",
        options: { method: "POST", body: undefined },
      }),
    )
    expect(data).toHaveBeenNthCalledWith(
      2,
      request,
      expect.objectContaining({
        endpoint: "/api/user/game/input",
        operationSemantics: "mutation",
        options: {
          method: "POST",
          body: JSON.stringify({ id: "run-1", from: 0, inputs: [3, 19] }),
        },
      }),
    )
    await expect(
      sendZifeiyuGameInputs(request as ApiServiceRequest, {
        id: "run-1",
        from: 2,
        inputs: Array.from({ length: 301 }, () => 0),
      }),
    ).rejects.toThrow("Invalid ZIFEIYU game input batch")
    await expect(
      sendZifeiyuGameInputs(request, {
        id: "run-1",
        from: 2,
        inputs: [9],
      }),
    ).rejects.toThrow("Invalid ZIFEIYU game input batch")
    expect(data).toHaveBeenCalledTimes(2)
  })

  it("rejects a response for another game run instead of advancing that run", async () => {
    data.mockResolvedValueOnce({ ...run, id: "different-run" })

    await expect(
      sendZifeiyuGameInputs(createZifeiyuBrowserSessionRequest(account), {
        id: "expected-run",
        from: 0,
        inputs: [3],
      }),
    ).rejects.toThrow("Invalid ZIFEIYU game input response")
  })

  it("rejects a malformed run returned after starting a game", async () => {
    data.mockResolvedValueOnce({ ...run, quota_awarded: -1 })

    await expect(
      startZifeiyuGame(account, createZifeiyuBrowserSessionRequest(account)),
    ).rejects.toThrow("Invalid ZIFEIYU game run")
  })
})
