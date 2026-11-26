import { once } from "node:events"
import { createServer } from "node:http"
import { http, passthrough } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { accountSub2ApiAuthSession } from "~/services/accounts/accountSiteProfile/sub2apiAuthSession"
import { SUB2API_AUTH_PERSISTENCE_STATUSES } from "~/services/apiService/sub2api/auth/authSession"
import * as browserAuth from "~/services/apiService/sub2api/auth/browserAuth"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/scheduling/refresh"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { server as interception } from "~~/tests/msw/server"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const protocols = [
  {
    name: "Clawhud",
    methodId: AUTO_CHECKIN_METHOD_IDS.ClawhudDailyCheckIn,
    statusPath: "/api/v1/user/checkin/status",
    claimPath: "/api/v1/user/checkin",
    status: (checked: boolean) => ({
      enabled: true,
      checked_in_today: checked,
    }),
    receipt: () => ({ checked_in_today: true, today_amount: 1 }),
  },
  {
    name: "BaiAPI",
    methodId: AUTO_CHECKIN_METHOD_IDS.BaiApiDailyCheckIn,
    statusPath: "/api/v1/daily-rewards/checkin/status",
    claimPath: "/api/v1/daily-rewards/checkin",
    status: (checked: boolean) => ({
      checked_today: checked,
      checkin_date: "2026-11-26",
    }),
    receipt: () => ({ checkin_date: "2026-11-26", cash_amount_usd: 1 }),
  },
  {
    name: "Casa",
    methodId: AUTO_CHECKIN_METHOD_IDS.ApiKeyCasaDailyCheckIn,
    statusPath: "/api/v1/redeem/checkin",
    claimPath: "/api/v1/redeem/checkin",
    status: (checked: boolean) => ({ checked_in: checked, reward: 1 }),
    receipt: () => ({ checked_in: true, reward: 1 }),
  },
  {
    name: "FreeAPI",
    methodId: AUTO_CHECKIN_METHOD_IDS.FreeApiDailyCheckIn,
    statusPath: "/api/v1/user/checkin",
    claimPath: "/api/v1/user/checkin",
    status: (checked: boolean) => ({
      enabled: true,
      checked_in_today: checked,
    }),
    receipt: () => ({ amount: 1 }),
  },
  {
    name: "Pro",
    methodId: AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn,
    statusPath: "/api/v1/redeem/checkin/status",
    claimPath: "/api/v1/redeem/checkin",
    status: (checked: boolean) => ({
      enabled: true,
      checked_in_today: checked,
      reward_min: 1,
      reward_max: 1,
    }),
    receipt: () => ({
      message: "ok",
      reward_amount: 1,
      new_balance: 2,
      checked_in_at: new Date().toISOString(),
    }),
  },
]

type Scenario =
  | "renew"
  | "postUnauthorized"
  | "postMalformedAfterGrant"
  | "forbidden"
  | "rateLimited"
  | "wrongIdentity"
  | "rejectedAfterRotation"
  | "healthy"
  | "expiresAtClaim"
const refresh = "POST /api/v1/auth/refresh"
const identity = "GET /api/v1/auth/me"

async function withHttpSite<T>(
  protocol: (typeof protocols)[number],
  scenario: Scenario,
  run: (account: SiteAccount) => Promise<T>,
) {
  const trace: string[] = []
  let checked = false
  const server = createServer((req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname
    trace.push(`${req.method} ${path}`)
    res.setHeader("content-type", "application/json")
    const reply = (status: number, body: unknown) =>
      res.writeHead(status).end(JSON.stringify(body))
    const ok = (data: unknown) => reply(200, { code: 0, message: "ok", data })
    const unauthorized = () =>
      reply(401, { code: "INVALID_TOKEN", message: "Invalid token" })
    if (req.method === "POST" && path === "/api/v1/auth/refresh")
      return void ok({
        access_token: "renewed",
        refresh_token: "rotated",
        expires_in: 3600,
      })
    if (req.method === "GET" && path === protocol.statusPath) {
      if (scenario === "rejectedAfterRotation") return void unauthorized()
      if (scenario === "forbidden")
        return void reply(403, { code: "FORBIDDEN", message: "Forbidden" })
      if (scenario === "rateLimited")
        return void reply(429, { code: "RATE_LIMITED", message: "Slow down" })
    }
    const firstTokenCanRead =
      scenario === "expiresAtClaim" &&
      req.method === "GET" &&
      req.headers.authorization === "Bearer expired"
    if (req.headers.authorization !== "Bearer renewed" && !firstTokenCanRead)
      return void unauthorized()
    if (path === "/api/v1/auth/me")
      return void ok({
        id: scenario === "wrongIdentity" ? 17 : 42,
        username: "test",
        balance: 1,
      })
    if (req.method === "GET" && path === protocol.statusPath)
      return void ok(protocol.status(checked))
    if (req.method === "POST" && path === protocol.claimPath) {
      if (scenario === "postUnauthorized") return void unauthorized()
      checked = true
      if (scenario === "postMalformedAfterGrant") return void reply(401, {})
      return void ok(protocol.receipt())
    }
    res.writeHead(404).end()
  })
  server.listen(0, "127.0.0.1")
  try {
    await once(server, "listening")
    const addr = server.address()
    if (!addr || typeof addr === "string") throw new Error("No HTTP listener")
    const origin = `http://127.0.0.1:${addr.port}`
    interception.use(http.all(`${origin}/*`, () => passthrough()))
    const { methodId } = protocol
    const account = buildSiteAccount({
      id: `fixture-${addr.port}`,
      site_url: origin,
      site_type: SITE_TYPES.SUB2API,
      checkIn: {
        automaticExecutionEnabled: true,
        selection: { mode: "automatic", methodId },
        methodKnowledge: {
          methods: {
            [methodId]: {
              detection: {
                outcome: "matched",
                evidence: { source: "probe", observedAt: Date.now() },
              },
            },
          },
        },
      },
    })
    account.account_info.id = "42"
    let accessToken = scenario === "healthy" ? "renewed" : "expired"
    account.account_info.access_token = accessToken
    let refreshToken = "fixture-refresh"
    let tokenExpiresAt =
      scenario === "rejectedAfterRotation" ? Date.now() - 1 : undefined
    vi.spyOn(accountSub2ApiAuthSession, "getLatestAuth").mockImplementation(
      async () => ({
        origin,
        userId: "42",
        accessToken,
        sub2apiAuth: { refreshToken, tokenExpiresAt },
      }),
    )
    vi.spyOn(accountSub2ApiAuthSession, "persistAuthUpdate").mockImplementation(
      async (_id, update) => {
        accessToken = update.accessToken
        refreshToken = update.refreshToken ?? ""
        tokenExpiresAt = update.tokenExpiresAt
        return { status: SUB2API_AUTH_PERSISTENCE_STATUSES.PERSISTED }
      },
    )
    const browserRecovery = vi
      .spyOn(browserAuth, "recoverSub2ApiBrowserAuth")
      .mockRejectedValue(
        new Error("No interactive session in the HTTP fixture"),
      )
    const result = await run(account)
    return { trace, result, browserRecovery }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

function executeHttpScenario(
  protocol: (typeof protocols)[number],
  scenario: Scenario,
) {
  return withHttpSite(protocol, scenario, (account) =>
    executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        ),
      },
    }),
  )
}

afterEach(() => vi.restoreAllMocks())

describe.each(protocols)("$name check-in over HTTP", (protocol) => {
  const get = `GET ${protocol.statusPath}`
  const post = `POST ${protocol.claimPath}`
  it.each([true, false])(
    "renews only for an explicit status verification (explicit=%s)",
    async (explicit) => {
      const { trace, result } = await withHttpSite(
        protocol,
        "renew",
        (account) =>
          refreshSelectedStatus({
            account,
            config: account.checkIn,
            siteType: account.site_type,
            ...(explicit
              ? {
                  verification: userCommandExecution(
                    PROTECTION_BYPASS_USER_COMMANDS.VerifyCheckinStatus,
                  ),
                }
              : {}),
          }),
      )
      expect(trace).toEqual(explicit ? [get, refresh, identity, get] : [get])
      expect(
        result.methodKnowledge.methods[protocol.methodId]?.status?.outcome,
      ).toBe(explicit ? "known" : "unknown")
    },
  )
  it("recovers the first status read and sends the claim once", async () => {
    const { trace, result } = await executeHttpScenario(protocol, "renew")
    expect(trace).toEqual([get, refresh, identity, get, post])
    expect(result).toMatchObject({
      kind: "executed",
      result: { status: "success" },
    })
  })
  it("stops credential recovery if the claim also receives a JWT rejection", async () => {
    const { trace, result } = await executeHttpScenario(
      protocol,
      "postUnauthorized",
    )
    expect(trace).toEqual([get, refresh, identity, get, post, get])
    expect(result).toMatchObject({
      kind: "executed",
      result: { status: "failed", reasonCode: "authentication_required" },
    })
  })
  it("stops after one recovery if the renewed token still fails admission", async () => {
    const { trace, result, browserRecovery } = await executeHttpScenario(
      protocol,
      "rejectedAfterRotation",
    )
    expect(trace).toEqual([refresh, identity, get])
    expect(browserRecovery).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      kind: "skipped",
      reason: "authentication_required",
    })
  })
  it("sends no credential requests when the original token works", async () => {
    const { trace, result } = await executeHttpScenario(protocol, "healthy")
    expect(trace).toEqual([get, post])
    expect(result).toMatchObject({
      kind: "executed",
      result: { status: "success" },
    })
  })
  it("honors the protocol's retry contract when the first 401 comes from the claim", async () => {
    const { trace, result } = await executeHttpScenario(
      protocol,
      "expiresAtClaim",
    )
    if (protocol.methodId === AUTO_CHECKIN_METHOD_IDS.ApiKeyCasaDailyCheckIn) {
      expect(trace).toEqual([get, post, get])
      expect(result).toMatchObject({
        kind: "executed",
        result: { status: "failed", reasonCode: "authentication_required" },
      })
    } else {
      expect(trace).toEqual([get, post, refresh, identity, get, post])
      expect(result).toMatchObject({
        kind: "executed",
        result: { status: "success" },
      })
    }
  })
  it("uses status to confirm an applied claim with a malformed 401 reply", async () => {
    const { trace, result } = await executeHttpScenario(
      protocol,
      "postMalformedAfterGrant",
    )
    expect(trace).toEqual([get, refresh, identity, get, post, get])
    expect(result).toMatchObject({
      kind: "executed",
      result: { status: "success" },
    })
    expect(result).not.toHaveProperty("result.awards")
  })
  it.each(["forbidden", "rateLimited"] as const)(
    "leaves authentication alone for a %s status",
    async (scenario) => {
      const { trace, result } = await executeHttpScenario(protocol, scenario)
      expect(trace).toEqual([get])
      expect(result.kind).not.toBe("executed")
    },
  )
  it("rejects a renewed credential belonging to another identity", async () => {
    const { trace, result } = await executeHttpScenario(
      protocol,
      "wrongIdentity",
    )
    expect(trace).toEqual([get, refresh, identity])
    expect(result.kind).not.toBe("executed")
    expect(accountSub2ApiAuthSession.persistAuthUpdate).not.toHaveBeenCalled()
  })
})
