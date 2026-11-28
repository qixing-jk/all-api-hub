import { http, HttpResponse } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { pmplanCapabilities } from "~/services/apiAdapters/pmplan"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import {
  createAccountCompletionHelpersMock,
  createCheckInConfig,
} from "~~/tests/services/apiAdapters/checkInFixtures"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

afterEach(() => vi.restoreAllMocks())

it.each([true, false])(
  "captures Cookie recovery before identity reads (success=%s)",
  async (success) => {
    installCookieTransport("pmplan_session", "custom-plan.example")
    const { helpers, captureRecoveryData } = createAccountCompletionHelpersMock(
      SITE_TYPES.PMPLAN,
      { automaticExecutionEnabled: false },
    )
    server.use(
      http.get("https://custom-plan.example/api/me", () => {
        expect(captureRecoveryData).toHaveBeenCalledWith({
          authType: AuthTypeEnum.Cookie,
        })
        return success
          ? HttpResponse.json({ user: { id: 661, username: "local" } })
          : HttpResponse.json({}, { status: 401 })
      }),
    )
    const result = pmplanCapabilities.account!.completion!.complete(
      {
        url: "https://custom-plan.example",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: { userId: "661", user: {}, siteType: SITE_TYPES.PMPLAN },
        context: { cookieAuthSessionCookie: "pmplan_session=saved" },
      },
      helpers,
    )
    if (success) {
      await expect(result).resolves.toMatchObject({
        userId: "661",
        username: "local",
        accessToken: "",
        authType: AuthTypeEnum.Cookie,
        checkIn: { automaticExecutionEnabled: false },
      })
      expect(captureRecoveryData).toHaveBeenLastCalledWith({
        userId: "661",
        username: "local",
        authType: AuthTypeEnum.Cookie,
      })
    } else await expect(result).rejects.toMatchObject({ statusCode: 401 })
  },
)

it("returns unhealthy refresh state for an expired session without accepting account data", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({}, { status: 401 }),
    ),
  )
  const result = await pmplanCapabilities.account!.refresh!.refreshAccount({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://plan.pmcat.top",
    auth: {
      authType: AuthTypeEnum.Cookie,
      userId: "661",
      cookie: "pmplan_session=expired",
    },
    checkIn: createCheckInConfig("unknown"),
  })
  expect(result.success).toBe(false)
  expect(result.data).toBeUndefined()
  expect(result.healthStatus?.status).not.toBe("healthy")
})
