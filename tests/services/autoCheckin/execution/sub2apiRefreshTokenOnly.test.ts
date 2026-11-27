import { http, HttpResponse } from "msw"
import { expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { CURRENT_CONFIG_VERSION } from "~/services/accounts/migrations/accountDataMigration"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import { runCheckins } from "~/services/checkin/autoCheckin/execution/runCheckins"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/scheduling/refresh"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import { AUTO_CHECKIN_RUN_TYPE } from "~/types/autoCheckin"
import type { CheckInMethodDetection } from "~/types/checkIn"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { server } from "~~/tests/msw/server"
import {
  automaticExecution,
  userCommandExecution,
} from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const origin = "https://refresh-only.example"
const methodId = AUTO_CHECKIN_METHOD_IDS.ApiKeyCasaDailyCheckIn
const previousTimeout: CheckInMethodDetection = {
  outcome: "unknown",
  reason: "timeout",
  attemptedAt: 100,
}
const previousUnsupported: CheckInMethodDetection = {
  outcome: "unsupported",
  evidence: { source: "probe", observedAt: 100 },
}

it.each([
  [AUTO_CHECKIN_RUN_TYPE.MANUAL, "manual", undefined],
  [AUTO_CHECKIN_RUN_TYPE.MANUAL, "automatic", undefined],
  [AUTO_CHECKIN_RUN_TYPE.DAILY, "manual", undefined],
  [AUTO_CHECKIN_RUN_TYPE.DAILY, "automatic", undefined],
  [AUTO_CHECKIN_RUN_TYPE.MANUAL, "manual", previousTimeout],
  [AUTO_CHECKIN_RUN_TYPE.MANUAL, "manual", previousUnsupported],
  [AUTO_CHECKIN_RUN_TYPE.DAILY, "manual", previousUnsupported],
] as const)(
  "%s confirms an imported %s choice with prior detection %j using its saved refresh token",
  async (runType, mode, detection) => {
    const account = await saveAccount("current-refresh", {
      automaticExecutionEnabled: true,
      selection: { mode, methodId },
      methodKnowledge: {
        methods: detection ? { [methodId]: { detection } } : {},
      },
    })
    await userPreferences.savePreferences({
      autoCheckin: { ...DEFAULT_PREFERENCES.autoCheckin!, globalEnabled: true },
    })
    const requestsAfterRenewal: string[] = []
    server.use(
      http.all(`${origin}/*`, ({ request }) => {
        const path = new URL(request.url).pathname
        const ok = (data: unknown) =>
          HttpResponse.json({ code: 0, message: "ok", data })
        if (path === "/api/v1/auth/refresh") {
          requestsAfterRenewal.push(`${request.method} ${path}`)
          return ok({
            access_token: "renewed",
            refresh_token: "rotated",
            expires_in: 3600,
          })
        }
        if (request.headers.get("Authorization") !== "Bearer renewed")
          return HttpResponse.json(
            { code: "INVALID_TOKEN", message: "expired" },
            { status: 401 },
          )
        requestsAfterRenewal.push(`${request.method} ${path}`)
        if (path === "/api/v1/auth/me")
          return ok({ id: 1, username: "test", balance: 1 })
        if (path === "/api/v1/redeem/checkin" && request.method === "GET")
          return ok({ checked_in: true, reward: 1 })
        return HttpResponse.json({}, { status: 404 })
      }),
    )
    await runCheckins({
      runType,
      protectionBypassExecution:
        runType === AUTO_CHECKIN_RUN_TYPE.DAILY
          ? automaticExecution(
              PROTECTION_BYPASS_FEATURES.Checkin,
              PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
            )
          : userCommandExecution(PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin),
    })
    expect(
      (await autoCheckinStorage.getStatus())?.perAccount?.[account.id]
        ?.reasonCode,
    ).toBe("already_checked_today")
    expect(requestsAfterRenewal).toEqual([
      "POST /api/v1/auth/refresh",
      "GET /api/v1/auth/me",
      "GET /api/v1/redeem/checkin",
      "GET /api/v1/redeem/checkin",
    ])
    expect(
      (await accountQueries.getAccountById(account.id))?.checkIn.methodKnowledge
        .methods[methodId]?.detection?.outcome,
    ).toBe("matched")
  },
)

async function saveAccount(
  refreshToken?: string,
  checkIn?: SiteAccount["checkIn"],
) {
  const account = buildSiteAccount({
    configVersion: CURRENT_CONFIG_VERSION,
    site_url: origin,
    site_type: SITE_TYPES.SUB2API,
    ...(refreshToken ? { sub2apiAuth: { refreshToken } } : {}),
    checkIn: checkIn ?? {
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

it("waits for the daily discovery cooldown before renewing an unconfirmed selection", async () => {
  const account = await saveAccount("current-refresh", {
    automaticExecutionEnabled: true,
    selection: { mode: "manual", methodId },
    methodKnowledge: {
      lastAutomaticDiscoveryAttemptAt: Date.now(),
      methods: {
        [methodId]: {
          detection: {
            outcome: "unknown",
            reason: "authentication_required",
            attemptedAt: Date.now(),
          },
        },
      },
    },
  })
  await userPreferences.savePreferences({
    autoCheckin: { ...DEFAULT_PREFERENCES.autoCheckin!, globalEnabled: true },
  })
  const unexpectedRequest = vi.fn(() => HttpResponse.error())
  server.use(http.all(`${origin}/*`, unexpectedRequest))
  await runCheckins({
    runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
    protectionBypassExecution: automaticExecution(
      PROTECTION_BYPASS_FEATURES.Checkin,
      PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
    ),
  })
  expect(
    (await autoCheckinStorage.getStatus())?.perAccount?.[account.id]
      ?.reasonCode,
  ).toBe("method_not_matched")
  expect(unexpectedRequest).not.toHaveBeenCalled()
})

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
