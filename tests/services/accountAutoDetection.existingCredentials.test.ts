import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { autoDetectAccount } from "~/services/accounts/accountAutoDetection"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const { detectBrowserAccount } = vi.hoisted(() => ({
  detectBrowserAccount: vi.fn(),
}))

vi.mock("~/services/siteDetection/autoDetectService", () => ({
  autoDetectSmart: detectBrowserAccount,
}))

const baseUrl = "https://existing-account.example.invalid"
let tokenCreations = 0
let authentications: string[] = []

beforeEach(() => {
  tokenCreations = 0
  authentications = []
  detectBrowserAccount.mockResolvedValue({
    success: true,
    data: {
      userId: "7",
      user: { id: 7, username: "alice" },
      siteType: SITE_TYPES.NEW_API,
    },
  })
  server.use(
    http.get(`${baseUrl}/api/user/self`, ({ request }) => {
      authentications.push(request.headers.get("Authorization") ?? "")
      return HttpResponse.json({
        success: true,
        data: { id: 7, username: "alice" },
      })
    }),
    http.get(`${baseUrl}/api/user/token`, () => {
      tokenCreations += 1
      return HttpResponse.json({ success: true, data: "replacement-pat" })
    }),
    http.get(`${baseUrl}/api/status`, () =>
      HttpResponse.json({
        success: true,
        data: { system_name: "Example API", checkin_enabled: false },
      }),
    ),
    http.get(`${baseUrl}/api/user/checkin`, () =>
      HttpResponse.json({ success: true, data: { enabled: false } }),
    ),
  )
})

describe("account detection with existing credentials", () => {
  it.each([
    { url: baseUrl, userId: "8" },
    { url: "https://another.example.invalid", userId: "7" },
    { url: `${baseUrl}/another-deployment`, userId: "7" },
  ])(
    "stops redetection before accessing credentials for a different target: %j",
    async (target) => {
      const result = await autoDetectAccount(
        baseUrl,
        AuthTypeEnum.AccessToken,
        undefined,
        undefined,
        {
          existingAccount: {
            ...target,
            siteType: SITE_TYPES.NEW_API,
            accessToken: "old-pat",
          },
        },
      )

      expect(result).toMatchObject({
        success: false,
        autoDetectFailureReason:
          AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
      })
      expect(result.recoveryData?.userId).toBeUndefined()
      expect(result.recoveryData?.accessToken).toBeUndefined()
      expect(authentications).toEqual([])
      expect(tokenCreations).toBe(0)
    },
  )

  it("reuses an unsaved form credential during redetection", async () => {
    const options = {
      existingAccount: {
        url: baseUrl,
        siteType: SITE_TYPES.NEW_API,
        userId: "7",
        accessToken: "draft-pat",
      },
    }
    const result = await autoDetectAccount(
      baseUrl,
      AuthTypeEnum.AccessToken,
      undefined,
      undefined,
      options,
    )

    expect(result).toMatchObject({
      success: true,
      data: { accessToken: "draft-pat", userId: "7" },
    })
    expect(tokenCreations).toBe(0)
  })

  it.each([SITE_TYPES.NEW_API, SITE_TYPES.ONE_API])(
    "reuses a saved %s account PAT during another add or import attempt",
    async (savedSiteType) => {
      const savedId = await accountMutations.addAccount(
        buildSiteAccount({
          site_url: baseUrl,
          site_type: savedSiteType,
          account_info: {
            ...buildSiteAccount().account_info,
            id: "7",
            username: "alice",
            access_token: "saved-pat",
          },
        }),
      )

      const result = await autoDetectAccount(baseUrl, AuthTypeEnum.AccessToken)

      expect(result).toMatchObject({
        success: true,
        data: { accessToken: "saved-pat", userId: "7" },
      })
      expect(tokenCreations).toBe(0)
      expect(authentications).toContain("Bearer saved-pat")
      expect(
        (await accountQueries.getAccountById(savedId))?.account_info
          .access_token,
      ).toBe("saved-pat")
    },
  )
})
