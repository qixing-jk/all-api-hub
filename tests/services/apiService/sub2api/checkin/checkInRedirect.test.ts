import { once } from "node:events"
import { createServer } from "node:http"
import { http, passthrough } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { accountSub2ApiAuthSession } from "~/services/accounts/accountSiteProfile/sub2apiAuthSession"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { server as interception } from "~~/tests/msw/server"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

afterEach(() => vi.restoreAllMocks())

it.each([
  { redirect: 302, readbackAvailable: true, outcome: "success" },
  { redirect: 307, readbackAvailable: false, outcome: "uncertain" },
])(
  "reconciles a $redirect claim only through status readback",
  async ({ redirect, readbackAvailable, outcome }) => {
    const trace: string[] = []
    const claim = "/api/v1/redeem/checkin"
    let granted = false
    const server = createServer((req, res) => {
      const path = new URL(req.url!, "http://localhost").pathname
      trace.push(`${req.method} ${path}`)
      res.setHeader("content-type", "application/json")
      if (path === claim && req.method === "POST") {
        granted = true
        res.writeHead(redirect, { Location: "/login" }).end()
      } else if (path === claim && req.method === "GET") {
        if (granted && !readbackAvailable) res.writeHead(503).end()
        else
          res.end(
            JSON.stringify({
              code: 0,
              message: "ok",
              data: { checked_in: granted, reward: 1 },
            }),
          )
      } else {
        res.writeHead(401).end(
          JSON.stringify({
            code: "INVALID_TOKEN",
            message: "Invalid token",
          }),
        )
      }
    })
    server.listen(0, "127.0.0.1")
    try {
      await once(server, "listening")
      const address = server.address()
      if (!address || typeof address === "string")
        throw new Error("No listener")
      const origin = `http://127.0.0.1:${address.port}`
      interception.use(http.all(`${origin}/*`, () => passthrough()))
      const methodId = AUTO_CHECKIN_METHOD_IDS.ApiKeyCasaDailyCheckIn
      const account = buildSiteAccount({
        id: `redirect-${address.port}`,
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
      vi.spyOn(accountSub2ApiAuthSession, "getLatestAuth").mockResolvedValue(
        null,
      )
      const result = await executeSelectedCheckIn({
        account,
        globalAutomaticExecutionEnabled: true,
        context: {
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
          protectionBypassExecution: userCommandExecution(
            PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
          ),
        },
      })
      expect(trace).toEqual([`GET ${claim}`, `POST ${claim}`, `GET ${claim}`])
      expect(result).toMatchObject({
        kind: "executed",
        result: { status: outcome },
      })
      expect(result).not.toHaveProperty("result.awards")
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  },
)
