import { http, HttpResponse } from "msw"
import { expect, it } from "vitest"

import { completeAutoDetectedAccount } from "~/services/accounts/autoDetectCompletion/completion"
import { aimlApiCapabilities } from "~/services/apiAdapters/aimlapi"
import { aimlApiAccountBootstrap } from "~/services/apiAdapters/aimlapi/accountBootstrap"
import { aimlApiAccountPersistence } from "~/services/apiAdapters/aimlapi/accountPersistence"
import { aimlApiAccountRefresh } from "~/services/apiAdapters/aimlapi/accountRefresh"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const request = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: "https://aimlapi.com",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "management" },
  checkIn: buildCheckInConfig(),
}
const key = {
  prefix: "abcdefgh",
  name: "Management key",
  disabled: false,
  created_at: "2026-10-01",
  updated_at: "2026-10-01",
  expires_at: null,
  total_usage_usd: 0,
  monthly_usage_usd: 0,
}
const completionRequest = {
  url: "https://aimlapi.com",
  requestedAuthType: AuthTypeEnum.AccessToken,
  detected: {
    siteType: "aimlapi",
    userId: "123",
    user: { username: "Console name" },
    accessToken: "management",
  },
} as const

it("completes a management-only account with a verified key identity and no check-in", async () => {
  server.use(
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json({ data: key }),
    ),
  )
  const result = await completeAutoDetectedAccount(completionRequest as never)
  expect(result).toMatchObject({
    userId: "abcdefgh",
    username: "Management key",
    accessToken: "management",
    siteName: "AI/ML API",
    exchangeRate: 7.2,
  })
  expect(
    await aimlApiAccountBootstrap.fetchCheckInSupport(
      request,
      await aimlApiAccountBootstrap.loadBootstrapFacts(request),
    ),
  ).toBe(false)
  expect(await aimlApiAccountBootstrap.getOrCreateAccessToken(request)).toEqual(
    { username: "Management key", access_token: "management" },
  )
})

it("completion can reuse an explicitly supplied key but never a console session token", async () => {
  server.use(
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json({ data: { ...key, name: null } }),
    ),
  )
  const result = await completeAutoDetectedAccount({
    ...completionRequest,
    detected: { ...completionRequest.detected, accessToken: undefined },
    existingAccessToken: "management",
  } as never)
  expect(result).toMatchObject({
    userId: "abcdefgh",
    username: "abcdefgh",
    accessToken: "management",
  })
  await expect(
    completeAutoDetectedAccount({
      ...completionRequest,
      detected: { ...completionRequest.detected, accessToken: undefined },
    } as never),
  ).rejects.toMatchObject({ reason: "access_token_missing" })
})

it("completion retains credential-verification failure rather than accepting browser identity", async () => {
  server.use(
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json({}, { status: 401 }),
    ),
  )
  await expect(
    completeAutoDetectedAccount(completionRequest as never),
  ).rejects.toMatchObject({ reason: "token_fetch_failed" })
})

it("reports verification guidance without exposing a challenge response", () => {
  const error = new ApiError(
    "<html>private credential details</html>",
    403,
    "/v1/key",
    API_ERROR_CODES.ROBOT_CHALLENGE,
  )
  expect(aimlApiAccountPersistence.getValidationFailureMessage(error)).toBe(
    "messages:errors.api.verificationRequired",
  )
  expect(aimlApiAccountPersistence.getHealthFailureReason(error)).toBe(
    "messages:errors.api.verificationRequired",
  )
})

it("retains an untouched saved identity without sending requests", async () => {
  const existingAccount = {
    site_type: "aimlapi",
    account_info: { access_token: " management " },
    aimlApiAuth: { apiKey: " regular " },
  }
  await expect(
    aimlApiAccountPersistence.prepareIdentity({
      accessToken: "management",
      aimlApiKey: "regular",
      userId: " 123 ",
      existingAccount,
    } as never),
  ).resolves.toBe("123")
})

it("retains a management-only saved identity without inventing a regular credential", async () => {
  await expect(
    aimlApiAccountPersistence.prepareIdentity({
      accessToken: "management",
      userId: "prefix-id",
      existingAccount: {
        site_type: "aimlapi",
        account_info: { access_token: "management" },
      },
    } as never),
  ).resolves.toBe("prefix-id")
})

it("verifies changed credentials and tolerates a missing billing email", async () => {
  server.use(
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json({ data: key }),
    ),
    http.get("https://api.aimlapi.com/v2/billing/detail", () =>
      HttpResponse.json({
        user_id: 456,
        email: null,
        current_balance: 2,
        currency: "USD",
      }),
    ),
  )
  await expect(
    aimlApiAccountPersistence.prepareIdentity({
      accessToken: "management",
      aimlApiKey: "regular",
      userId: "123",
    }),
  ).resolves.toBe("456")
})

it("re-verifies identity when only the saved regular key changes", async () => {
  let billingAuthorization: string | null = null
  server.use(
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json({ data: key }),
    ),
    http.get("https://api.aimlapi.com/v2/billing/detail", ({ request }) => {
      billingAuthorization = request.headers.get("authorization")
      return HttpResponse.json({
        user_id: 456,
        email: null,
        current_balance: 2,
        currency: "USD",
      })
    }),
  )
  await expect(
    aimlApiAccountPersistence.prepareIdentity({
      accessToken: "management",
      aimlApiKey: "replacement-regular",
      userId: "123",
      existingAccount: {
        site_type: "aimlapi",
        account_info: { access_token: "management" },
        aimlApiAuth: { apiKey: "old-regular" },
      },
    } as never),
  ).resolves.toBe("456")
  expect(billingAuthorization).toBe("Bearer replacement-regular")
})

it.each([
  [API_ERROR_CODES.HTTP_401, "credentialInvalid"],
  [API_ERROR_CODES.HTTP_403, "credentialScopeDenied"],
  [API_ERROR_CODES.NETWORK_ERROR, "networkFallback"],
  [API_ERROR_CODES.JSON_PARSE_ERROR, "malformedResponse"],
  [API_ERROR_CODES.CONTENT_TYPE_MISMATCH, "malformedResponse"],
] as const)("sanitizes persistence and health errors: %s", (code, expected) => {
  const error = new ApiError(
    "secret upstream detail",
    undefined,
    undefined,
    code,
  )
  expect(aimlApiAccountPersistence.getValidationFailureMessage(error)).toBe(
    `messages:aimlapi.${expected}`,
  )
  expect(aimlApiAccountPersistence.getHealthFailureReason(error)).toBe(
    `messages:aimlapi.${expected}`,
  )
  expect(
    aimlApiAccountPersistence.getOperationLogDetails(
      { secret: "raw" },
      { safe: true },
    ),
  ).toEqual({ safe: true })
})

it("uses controlled fallbacks for unknown failures and reports failed refreshes", async () => {
  const unknownApiError = new ApiError(
    "secret upstream detail",
    500,
    "/private/route",
    API_ERROR_CODES.HTTP_OTHER,
  )
  expect(
    aimlApiAccountPersistence.getValidationFailureMessage(unknownApiError),
  ).toBe("messages:aimlapi.networkFallback")
  expect(
    aimlApiAccountPersistence.getHealthFailureReason(unknownApiError),
  ).toBe("account:healthStatus.unknownError")
  expect(
    aimlApiAccountPersistence.getValidationFailureMessage(new Error("secret")),
  ).not.toContain("secret")
  expect(aimlApiAccountPersistence.getHealthFailureReason(null)).toBe(
    "account:healthStatus.unknownError",
  )
  server.use(
    http.get("https://api.aimlapi.com/v2/billing", () =>
      HttpResponse.json({}, { status: 401 }),
    ),
    http.get("https://api.aimlapi.com/v2/usage/detail", () =>
      HttpResponse.json({}, { status: 401 }),
    ),
  )
  expect(
    await aimlApiAccountRefresh.refreshAccount({
      ...request,
      aimlApiKey: "regular",
    }),
  ).toMatchObject({ success: false })
  expect(await aimlApiAccountRefresh.fetchCheckInSupport!(request)).toBe(false)
})

it("dispatches usage history through the registered account capability", async () => {
  server.use(
    http.get("https://api.aimlapi.com/v2/logs", () =>
      HttpResponse.json({ data: [], pagination: { total: 0 } }),
    ),
  )
  expect(
    await aimlApiCapabilities.account!.usageHistory!.fetchPage(
      { ...request, aimlApiKey: "regular" },
      { page: 1, pageSize: 50, startTimestamp: 0, endTimestamp: 1 },
    ),
  ).toEqual({ items: [], total: 0 })
})
