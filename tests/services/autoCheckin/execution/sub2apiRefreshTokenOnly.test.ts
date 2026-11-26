import { http, HttpResponse } from "msw"
import { expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/scheduling/refresh"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { server } from "~~/tests/msw/server"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const origin = "https://refresh-only.example"
const methodId = AUTO_CHECKIN_METHOD_IDS.ApiKeyCasaDailyCheckIn

async function saveAccount(refreshToken?: string) {
  const account = buildSiteAccount({
    site_url: origin,
    site_type: SITE_TYPES.SUB2API,
    ...(refreshToken ? { sub2apiAuth: { refreshToken } } : {}),
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
  account.account_info.access_token = ""
  await accountConfigStore.mutate((config) => {
    config.accounts = [account]
    return { changed: true, result: undefined }
  })
  return account
}

function execute(account: SiteAccount) {
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
}

it("renews a saved refresh-only session before admission and uses the persisted access token for the claim", async () => {
  const account = await saveAccount("current-refresh")
  const trace: string[] = []
  server.use(
    http.all(`${origin}/*`, async ({ request }) => {
      const path = new URL(request.url).pathname
      trace.push(`${request.method} ${path}`)
      const ok = (data: Record<string, unknown>) =>
        HttpResponse.json({ code: 0, message: "ok", data })
      if (path === "/api/v1/auth/refresh") {
        expect(await request.json()).toEqual({
          refresh_token: "current-refresh",
        })
        return ok({
          access_token: "renewed",
          refresh_token: "rotated",
          expires_in: 3600,
        })
      }
      expect(request.headers.get("Authorization")).toBe("Bearer renewed")
      if (path === "/api/v1/auth/me")
        return ok({ id: 1, username: "test", balance: 1 })
      return ok({ checked_in: request.method === "POST", reward: 1 })
    }),
  )
  expect(await execute(account)).toMatchObject({
    kind: "executed",
    result: { status: "success" },
  })
  expect(trace).toEqual([
    "POST /api/v1/auth/refresh",
    "GET /api/v1/auth/me",
    "GET /api/v1/redeem/checkin",
    "POST /api/v1/redeem/checkin",
  ])
  expect(await accountQueries.getAccountById(account.id)).toMatchObject({
    account_info: { access_token: "renewed" },
    sub2apiAuth: { refreshToken: "rotated" },
  })
})

it("skips a selected method without either credential before any HTTP request", async () => {
  const account = await saveAccount()
  const unexpectedRequest = vi.fn(() => HttpResponse.error())
  server.use(http.all(`${origin}/*`, unexpectedRequest))
  expect(await execute(account)).toMatchObject({
    kind: "skipped",
    reason: "credentials_missing",
  })
  expect(unexpectedRequest).not.toHaveBeenCalled()
})

it("leaves a refresh-only session untouched during passive status checks", async () => {
  const account = await saveAccount("current-refresh")
  const unexpectedRequest = vi.fn(() => HttpResponse.error())
  server.use(http.all(`${origin}/*`, unexpectedRequest))
  expect(() => createAccountApiRequestFromStoredAccount(account)).toThrow(
    "account_api_context_missing_credential",
  )
  const config = await refreshSelectedStatus({
    config: account.checkIn,
    siteType: account.site_type,
    account,
  })
  expect(config.methodKnowledge.methods[methodId]?.status?.outcome).toBe(
    "unknown",
  )
  expect(unexpectedRequest).not.toHaveBeenCalled()
  expect(await accountQueries.getAccountById(account.id)).toMatchObject({
    account_info: { access_token: "" },
    sub2apiAuth: { refreshToken: "current-refresh" },
  })
})
