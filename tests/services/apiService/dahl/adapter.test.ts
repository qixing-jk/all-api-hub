import { beforeEach, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_BOOTSTRAP_ROUTE_KINDS as routes } from "~/services/apiAdapters/contracts/accountBootstrap"
import { dahlCapabilities } from "~/services/apiAdapters/dahl"
import { fetchAccountData, fetchUserInfo } from "~/services/apiService/dahl"
import { ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

import {
  createAccountCompletionHelpersMock,
  createCheckInConfig,
} from "../../apiAdapters/checkInFixtures"

vi.mock("~/services/apiService/dahl", async (original) => ({
  ...(await original<typeof import("~/services/apiService/dahl")>()),
  fetchUserInfo: vi.fn(),
  fetchAccountData: vi.fn(),
}))
const request = {
  baseUrl: "https://inference.dahl.global",
  auth: { authType: AuthTypeEnum.Cookie, userId: "uuid-example" },
}
beforeEach(() => {
  vi.mocked(fetchUserInfo).mockReset()
  vi.mocked(fetchAccountData).mockReset()
})

it("completes Cookie onboarding using verified identity and captures recoverable identity facts", async () => {
  vi.mocked(fetchUserInfo).mockResolvedValue({
    id: "uuid-example",
    username: "Work",
    access_token: null,
  })
  const { helpers, captureRecoveryData } = createAccountCompletionHelpersMock(
    SITE_TYPES.DAHL,
    { automaticExecutionEnabled: false },
  )
  const result = await dahlCapabilities.account!.completion!.complete(
    {
      url: request.baseUrl,
      requestedAuthType: AuthTypeEnum.Cookie,
      detected: { userId: "", user: {}, siteType: SITE_TYPES.DAHL },
      context: {},
    },
    helpers,
  )
  expect(fetchUserInfo).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUrl: request.baseUrl,
      auth: { authType: AuthTypeEnum.Cookie, userId: "" },
    }),
  )
  expect(captureRecoveryData).toHaveBeenCalledWith({
    userId: "uuid-example",
    username: "Work",
    authType: AuthTypeEnum.Cookie,
  })
  expect(result).toMatchObject({
    userId: "uuid-example",
    username: "Work",
    authType: AuthTypeEnum.Cookie,
    accessToken: "",
    siteName: "Dahl",
  })
})

it("does not advertise access tokens or check-in and resolves the account console route", async () => {
  const bootstrap = dahlCapabilities.account!.bootstrap!
  await expect(bootstrap.getOrCreateAccessToken(request)).rejects.toMatchObject(
    { code: "FEATURE_UNSUPPORTED" },
  )
  expect(await bootstrap.fetchCheckInSupport(request, {})).toBe(false)
  expect(
    await bootstrap.resolveRoutePath(
      { baseUrl: request.baseUrl, siteType: SITE_TYPES.DAHL },
      routes.Usage,
    ),
  ).toBe("/account#profile")
})

it("returns an unhealthy refresh result when the saved Cookie session expires", async () => {
  vi.mocked(fetchAccountData).mockRejectedValue(
    new ApiError("Expired", 401, "/v1/account", "HTTP_401"),
  )
  const result = await dahlCapabilities.account!.refresh!.refreshAccount({
    ...request,
    checkIn: createCheckInConfig(SITE_TYPES.DAHL),
  })
  expect(result.success).toBe(false)
  expect(result.healthStatus.status).not.toBe(SiteHealthStatus.Healthy)
})
