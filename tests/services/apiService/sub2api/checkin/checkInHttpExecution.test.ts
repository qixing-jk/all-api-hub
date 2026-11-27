import { once } from "node:events"
import { createServer } from "node:http"
import { http, passthrough } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { accountSub2ApiAuthSession } from "~/services/accounts/accountSiteProfile/sub2apiAuthSession"
import { SUB2API_AUTH_PERSISTENCE_STATUSES } from "~/services/apiService/sub2api/auth/authSession"
import * as browserAuth from "~/services/apiService/sub2api/auth/browserAuth"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery/discovery"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { AUTO_CHECKIN_METHOD_DEFINITIONS } from "~/services/checkin/autoCheckin/providers/registry"
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/scheduling/refresh"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import type { CheckInMethodId } from "~/types/checkIn"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  formatLocalDayKey,
  getDayKeyFromUnixSeconds,
} from "~/utils/core/dayKey"
import { server as interception } from "~~/tests/msw/server"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

type HttpCheckInProtocol = {
  name: string
  methodId: CheckInMethodId
  statusPath: string
  status: (checked: boolean) => unknown
  claimPath?: string
  receipt?: () => unknown
}

const linxiProtocol = {
  name: "Linxi",
  methodId: AUTO_CHECKIN_METHOD_IDS.LinxiDailyCheckIn,
  statusPath: "/api/v1/check-in/status",
  claimPath: "/api/v1/check-in",
  status: (checked: boolean) => ({
    enabled: true,
    checked_in_today: checked,
    check_in_date: getDayKeyFromUnixSeconds(Date.now() / 1000, "Asia/Shanghai"),
    turnstile_required: false,
  }),
  receipt: () => ({
    checked_in_today: true,
    check_in_date: getDayKeyFromUnixSeconds(Date.now() / 1000, "Asia/Shanghai"),
    already_checked_in: false,
    reward_amount: 1,
    today_pool: "paid",
  }),
} satisfies HttpCheckInProtocol

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
  linxiProtocol,
]

const statusProtocols: HttpCheckInProtocol[] = [
  ...protocols,
  {
    name: "BizDecipher",
    methodId: AUTO_CHECKIN_METHOD_IDS.BizDecipherFreeCheckIn,
    statusPath: "/api/v1/user/checkin/status",
    status: (checked) => ({
      date: formatLocalDayKey(),
      free_claimed: checked,
      balance: 2,
      credit_balance: 3,
    }),
  },
  {
    name: "Genius Programmer",
    methodId: AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn,
    statusPath: "/api/v1/user/checkin/status",
    status: (checked) => ({ enabled: true, today_checked_in: checked }),
  },
  {
    name: "Toolcode",
    methodId: AUTO_CHECKIN_METHOD_IDS.ToolcodeDailyCheckIn,
    statusPath: "/api/v1/engagement/checkin/status",
    status: (checked) => ({
      checkin_enabled: true,
      checked_in_today: checked,
      can_checkin: !checked,
    }),
  },
  {
    name: "Hiyo",
    methodId: AUTO_CHECKIN_METHOD_IDS.HiyoDailyCheckIn,
    statusPath: "/api/v1/checkin",
    status: (checked) => ({
      enabled: true,
      daily_available: true,
      daily_claimed: checked,
      can_claim: true,
      tokens_met: true,
    }),
  },
  {
    name: "Sidrune",
    methodId: AUTO_CHECKIN_METHOD_IDS.SidruneDailyCheckIn,
    statusPath: "/api/v1/welfare/profile",
    status: (checked) => ({
      enabled: true,
      eligible: true,
      checked_in_today: checked,
    }),
  },
  {
    name: "DaiGua",
    methodId: AUTO_CHECKIN_METHOD_IDS.DaiguaDailyCheckIn,
    statusPath: "/api/v1/checkin/status",
    status: (checked) => ({
      enabled: true,
      can_checkin: !checked,
      luck_enabled: false,
    }),
  },
  {
    name: "NexaVlinks",
    methodId: AUTO_CHECKIN_METHOD_IDS.NexaVlinksDailyCheckIn,
    statusPath: "/api/v1/check-in",
    status: (checked) => ({ eligible: true, checked_in_today: checked }),
  },
  {
    name: "Denxio",
    methodId: AUTO_CHECKIN_METHOD_IDS.DenxioDailyCheckIn,
    statusPath: "/api/v1/tbe-sponsor-checkin/status",
    status: (checked) => ({
      config: { normal_checkin_enabled: true },
      normal_done: checked,
    }),
  },
  {
    name: "小白Code",
    methodId: AUTO_CHECKIN_METHOD_IDS.XiaobaiCodeDailyCheckIn,
    statusPath: "/checkin/api/status",
    status: (checked) => ({ config: { enabled: true }, signedToday: checked }),
  },
  {
    name: "AI-ROUTER",
    methodId: AUTO_CHECKIN_METHOD_IDS.AiRouterDailyCheckIn,
    statusPath: "/api/v1/user/daily-checkin",
    status: (checked) => ({
      enabled: true,
      checked_today: checked,
      reward_amount: 0.1,
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
  | "persistenceFailure"
  | "rejectedAfterRotation"
  | "healthy"
  | "unrelatedLinxiStatus"
  | "expiresAtClaim"
  | "alreadyChecked"
const refresh = "POST /api/v1/auth/refresh"
const identity = "GET /api/v1/auth/me"

async function withHttpSite<T>(
  protocol: HttpCheckInProtocol,
  scenario: Scenario,
  run: (account: SiteAccount) => Promise<T>,
) {
  const trace: string[] = []
  let checked = scenario === "alreadyChecked"
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
    if (
      req.method === "GET" &&
      path === protocol.statusPath &&
      protocol.methodId === AUTO_CHECKIN_METHOD_IDS.XiaobaiCodeDailyCheckIn
    )
      return void reply(200, { ok: true, data: protocol.status(checked) })
    if (req.method === "GET" && path === protocol.statusPath)
      return void ok(protocol.status(checked))
    if (
      scenario === "unrelatedLinxiStatus" &&
      req.method === "GET" &&
      path === linxiProtocol.statusPath
    )
      return void ok({ enabled: true, checked_in_today: false })
    if (
      req.method === "POST" &&
      path === protocol.claimPath &&
      protocol.receipt
    ) {
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
    const localOrigin = `http://127.0.0.1:${addr.port}`
    const splitOrigin =
      protocol.methodId === AUTO_CHECKIN_METHOD_IDS.AiRouterDailyCheckIn
    const origin = splitOrigin ? "https://ai-router.dev" : localOrigin
    interception.use(http.all(`${localOrigin}/*`, () => passthrough()))
    // Route split-origin requests to loopback.
    const routedHosts = splitOrigin ? [origin, "https://api.ai-router.dev"] : []
    for (const host of routedHosts) {
      interception.use(
        http.all(`${host}/*`, async ({ request }) => {
          const url = new URL(request.url)
          return fetch(localOrigin + url.pathname + url.search, {
            method: request.method,
            headers: request.headers,
            body: request.method === "POST" ? await request.text() : undefined,
          })
        }),
      )
    }
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
    let accessToken =
      scenario === "healthy" || scenario === "unrelatedLinxiStatus"
        ? "renewed"
        : "expired"
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
        if (scenario === "persistenceFailure")
          return { status: SUB2API_AUTH_PERSISTENCE_STATUSES.WRITE_FAILED }
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
  protocol: HttpCheckInProtocol,
  scenario: Scenario,
  needsConfirmation = false,
) {
  return withHttpSite(protocol, scenario, (account) => {
    if (needsConfirmation) account.checkIn.methodKnowledge.methods = {}
    return executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        ),
      },
    })
  })
}

afterEach(() => vi.restoreAllMocks())

describe("Linxi protocol discovery over HTTP", () => {
  const discover = (account: SiteAccount) =>
    discoverCheckInMethods({ account, config: buildCheckInConfig() })

  it("selects Linxi by its status response on a new origin", async () => {
    const { trace, result } = await withHttpSite(
      linxiProtocol,
      "healthy",
      discover,
    )

    expect(trace).toContain("GET /api/v1/check-in/status")
    expect(trace.every((request) => request.startsWith("GET "))).toBe(true)
    expect(result.decision).toEqual({
      outcome: "resolved",
      methodId: AUTO_CHECKIN_METHOD_IDS.LinxiDailyCheckIn,
    })
  })

  it("keeps a verified existing method selectable when the Linxi probe is inconclusive", async () => {
    const pro = protocols.find(
      ({ methodId }) =>
        methodId === AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn,
    )!
    const { trace, result } = await withHttpSite(
      pro,
      "unrelatedLinxiStatus",
      discover,
    )

    expect(trace).toContain("GET /api/v1/check-in/status")
    expect(
      result.detections[AUTO_CHECKIN_METHOD_IDS.LinxiDailyCheckIn],
    ).toMatchObject({
      outcome: "unknown",
      reason: "invalid_response",
    })
    expect(result.decision).toEqual({
      outcome: "resolved",
      methodId: AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn,
    })
  })
})

it("exercises first-request authentication for every registered Sub2API method", () => {
  const registered = Object.values(AUTO_CHECKIN_METHOD_DEFINITIONS)
    .filter((definition) =>
      definition.siteTypes.some((type) => type === SITE_TYPES.SUB2API),
    )
    .map((definition) => definition.id)
  expect(statusProtocols.map(({ methodId }) => methodId).sort()).toEqual(
    registered.sort(),
  )
})

describe.each(statusProtocols)("$name status over HTTP", (protocol) => {
  const get = `GET ${protocol.statusPath}`
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
  it("shares first-request renewal with confirmation of an imported selection", async () => {
    const { trace, result } = await executeHttpScenario(
      protocol,
      "alreadyChecked",
      true,
    )
    expect(trace).toEqual([get, refresh, identity, get, get])
    expect(result).toMatchObject({ kind: "skipped", reason: "already_checked" })
  })
  it("renews for the first check-in request and skips an already completed day", async () => {
    const { trace, result } = await executeHttpScenario(
      protocol,
      "alreadyChecked",
    )
    expect(trace).toEqual([get, refresh, identity, get])
    expect(result).toMatchObject({ kind: "skipped", reason: "already_checked" })
  })
})

describe.each(protocols)("$name check-in over HTTP", (protocol) => {
  const get = `GET ${protocol.statusPath}`
  const post = `POST ${protocol.claimPath}`
  it("reports authentication when a renewed imported selection is still rejected", async () => {
    const { trace, result } = await executeHttpScenario(
      protocol,
      "rejectedAfterRotation",
      true,
    )
    expect(trace).toEqual([refresh, identity, get])
    expect(result).toMatchObject({
      kind: "skipped",
      reason: "authentication_required",
    })
  })
  it.each([
    ["wrongIdentity", "skipped", "authentication_required"],
    ["persistenceFailure", "blocked", "account_unavailable"],
  ] as const)(
    "preserves the %s failure during imported method confirmation",
    async (scenario, kind, reason) => {
      const { trace, result } = await executeHttpScenario(
        protocol,
        scenario,
        true,
      )
      expect(trace).toEqual([get, refresh, identity])
      expect(result).toMatchObject({ kind, reason })
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
  it("does not start credential recovery on the claim after successful admission", async () => {
    const { trace, result } = await executeHttpScenario(
      protocol,
      "expiresAtClaim",
    )
    expect(trace).toEqual([get, post, get])
    expect(result).toMatchObject({
      kind: "executed",
      result: { status: "failed", reasonCode: "authentication_required" },
    })
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
