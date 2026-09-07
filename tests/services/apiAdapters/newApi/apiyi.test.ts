import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import type { AccountAutoDetectRecoveryData } from "~/services/accounts/autoDetect/recovery"
import { completeAutoDetectedAccount } from "~/services/accounts/autoDetectCompletion/completion"
import { getAccountKeyProductCapabilities } from "~/services/accounts/keyProductCapabilities"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

vi.mock("~/utils/browser/tempWindowFetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/tempWindowFetch")>()),
  canUseTempWindowFetch: vi.fn().mockResolvedValue(false),
}))

const baseUrl = "https://api.apiyi.com"
const detected = {
  siteType: SITE_TYPES.APIYI,
  userId: "42",
  user: { id: 42, username: "apiyi-user" },
}

describe("APIyi account capabilities", () => {
  let tokenRequests: string[]
  let checkInRequests: string[]

  beforeEach(() => {
    tokenRequests = []
    checkInRequests = []
    server.use(
      http.get(`${baseUrl}/api/status`, () =>
        HttpResponse.json({
          success: true,
          data: { system_name: "APIyi", price: 7 },
        }),
      ),
      http.get(`${baseUrl}/api/user/self`, () =>
        HttpResponse.json({
          success: true,
          data: { id: 42, username: "apiyi-user", access_token: "" },
        }),
      ),
      http.all(`${baseUrl}/api/user/checkin`, ({ request }) => {
        checkInRequests.push(request.method)
        return new HttpResponse(null, { status: 404 })
      }),
      http.all(`${baseUrl}/api/user/token`, ({ request }) => {
        tokenRequests.push(`${request.method} /api/user/token`)
        return HttpResponse.json({ success: true, data: "generated-token" })
      }),
      http.all(`${baseUrl}/api/user/access_token/`, ({ request }) => {
        tokenRequests.push(`${request.method} /api/user/access_token/`)
        return HttpResponse.json({ success: true, data: "generated-token" })
      }),
    )
  })

  it("keeps detected details for manual verification without generating a token", async () => {
    const recovery: AccountAutoDetectRecoveryData = {}

    await expect(
      completeAutoDetectedAccount({
        url: baseUrl,
        detected,
        requestedAuthType: AuthTypeEnum.AccessToken,
        onRecoveryData: (data) => Object.assign(recovery, data),
      }),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
    })
    expect(recovery).toMatchObject({
      username: "apiyi-user",
      authType: AuthTypeEnum.AccessToken,
      siteName: "APIyi",
      exchangeRate: 7,
    })
    expect(recovery.accessToken).toBeUndefined()
    expect(tokenRequests).toEqual([])
  })

  it("reuses an existing management token without regenerating it", async () => {
    server.use(
      http.get(`${baseUrl}/api/user/self`, () =>
        HttpResponse.json({
          success: true,
          data: {
            id: 42,
            username: "apiyi-user",
            access_token: "existing-token",
          },
        }),
      ),
    )

    await expect(
      completeAutoDetectedAccount({
        url: baseUrl,
        detected,
        requestedAuthType: AuthTypeEnum.AccessToken,
      }),
    ).resolves.toMatchObject({
      siteType: SITE_TYPES.APIYI,
      userId: "42",
      username: "apiyi-user",
      accessToken: "existing-token",
      authType: AuthTypeEnum.AccessToken,
    })
    expect(tokenRequests).toEqual([])
  })

  it("allows cookie onboarding without generating or requiring a management token", async () => {
    await expect(
      completeAutoDetectedAccount({
        url: baseUrl,
        detected,
        requestedAuthType: AuthTypeEnum.Cookie,
      }),
    ).resolves.toMatchObject({
      siteType: SITE_TYPES.APIYI,
      userId: "42",
      authType: AuthTypeEnum.Cookie,
      accessToken: "",
      checkIn: { automaticExecutionEnabled: false },
    })
    expect(tokenRequests).toEqual([])
    expect(checkInRequests).toEqual([])
  })

  it.each([401, 403])(
    "does not mistake a %s session failure for password verification",
    async (status) => {
      server.use(
        http.get(`${baseUrl}/api/user/self`, () =>
          HttpResponse.json(
            {
              success: false,
              message: "Session is not authorized",
            },
            { status },
          ),
        ),
      )

      await expect(
        completeAutoDetectedAccount({
          url: baseUrl,
          detected,
          requestedAuthType: AuthTypeEnum.AccessToken,
        }),
      ).rejects.toMatchObject({
        reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      })
      expect(tokenRequests).toEqual([])
    },
  )

  it("does not offer token generation when the user response has no valid identity", async () => {
    server.use(
      http.get(`${baseUrl}/api/user/self`, () =>
        HttpResponse.json({
          success: true,
          data: { username: "apiyi-user", access_token: "" },
        }),
      ),
    )

    await expect(
      completeAutoDetectedAccount({
        url: baseUrl,
        detected,
        requestedAuthType: AuthTypeEnum.AccessToken,
      }),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
    })
    expect(tokenRequests).toEqual([])
  })

  it.each([AuthTypeEnum.Cookie, AuthTypeEnum.AccessToken])(
    "refreshes balance with %s through the shared account transport",
    async (authType) => {
      let authorization: string | null = null
      let sessionToken: string | null = null
      server.use(
        http.get(`${baseUrl}/api/user/self`, ({ request }) => {
          authorization = request.headers.get("authorization")
          sessionToken = request.headers.get("x-s-token")
          return HttpResponse.json({
            success: true,
            data: {
              id: 42,
              username: "apiyi-user",
              quota: 1500000,
              used_quota: 500000,
            },
          })
        }),
      )

      const account = getSiteTypeCapabilities(SITE_TYPES.APIYI).account!
      const result = await account.refresh!.refreshAccount({
        baseUrl,
        siteType: SITE_TYPES.APIYI,
        auth: {
          authType,
          userId: "42",
          ...(authType === AuthTypeEnum.AccessToken
            ? { accessToken: "saved-token" }
            : {}),
        },
        checkIn: createCompatibilityCheckInConfig({
          siteType: SITE_TYPES.APIYI,
          supported: false,
          automaticExecutionEnabled: false,
        }),
        includeTodayCashflow: false,
      })

      expect(result).toMatchObject({ success: true, data: { quota: 1500000 } })
      expect(authorization).toBe(
        authType === AuthTypeEnum.AccessToken ? "Bearer saved-token" : null,
      )
      expect(sessionToken).toBeNull()
      expect(tokenRequests).toEqual([])
    },
  )

  it("loads models and group pricing without the incompatible key-management model endpoint", async () => {
    let keyModelRequests = 0
    server.use(
      http.get(`${baseUrl}/api/user/models`, () => {
        keyModelRequests += 1
        return new HttpResponse(null, { status: 401 })
      }),
      http.get(`${baseUrl}/api/pricing`, () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              model_name: "gpt-6-astra",
              vendor_id: 1,
              quota_type: 0,
              model_ratio: 5,
              completion_ratio: 5,
              model_price: 0,
              enable_groups: [
                "CodexResponses",
                "CodexReverse",
                "default",
                "svip",
              ],
              supported_endpoint_types: ["openai"],
            },
          ],
          vendors: [{ id: 1, name: "OpenAI" }],
          group_ratio: {
            CodexResponses: 1,
            CodexReverse: 0.5,
            default: 1,
            svip: 1,
          },
          usable_group: {
            CodexResponses: "CodexResponses",
            CodexReverse: "Codex_Reverse",
            default: "Default",
            svip: "SVIP",
          },
          supported_endpoint: {
            openai: { path: "/v1/chat/completions", method: "POST" },
          },
        }),
      ),
    )

    const account = getSiteTypeCapabilities(SITE_TYPES.APIYI).account!
    await expect(
      account.modelPricing!.fetchPricing({
        baseUrl,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "42",
          accessToken: "saved-token",
        },
      }),
    ).resolves.toMatchObject({
      success: true,
      data: [
        {
          model_name: "gpt-6-astra",
          model_ratio: 5,
          completion_ratio: 5,
          enable_groups: ["CodexResponses", "CodexReverse", "default", "svip"],
          vendorEvidence: { name: "OpenAI" },
        },
      ],
      group_ratio: {
        CodexResponses: 1,
        CodexReverse: 0.5,
        default: 1,
        svip: 1,
      },
      usable_group: {
        CodexResponses: "CodexResponses",
        CodexReverse: "Codex_Reverse",
        default: "Default",
        svip: "SVIP",
      },
    })
    expect(keyModelRequests).toBe(0)
  })

  it("enables default token management and automation for authenticated accounts", () => {
    expect(
      getAccountKeyProductCapabilities({
        id: "apiyi-account",
        siteType: SITE_TYPES.APIYI,
        baseUrl,
        userId: "42",
        authType: AuthTypeEnum.AccessToken,
        token: "saved-token",
      }),
    ).toMatchObject({
      runtimeKeys: { list: true, resolveSecret: true },
      apiTokens: { create: true, update: true, delete: true },
      tokenMetadata: { fetchAvailableModels: true, fetchUserGroups: true },
      defaultTokenAutomation: { run: true },
    })
  })

  it("loads token model choices from APIyi's available-model endpoint", async () => {
    let defaultEndpointRequests = 0
    server.use(
      http.get(`${baseUrl}/api/user/models`, () => {
        defaultEndpointRequests += 1
        return new HttpResponse(null, { status: 401 })
      }),
      http.get(`${baseUrl}/api/user/available_model/`, () =>
        HttpResponse.json({
          success: true,
          data: ["gpt-4o-mini", "claude-sonnet-4"],
        }),
      ),
    )

    await expect(
      getSiteTypeCapabilities(
        SITE_TYPES.APIYI,
      ).account!.keyManagement!.fetchAvailableModels({
        baseUrl,
        auth: { authType: AuthTypeEnum.Cookie, userId: "42" },
      }),
    ).resolves.toEqual(["gpt-4o-mini", "claude-sonnet-4"])
    expect(defaultEndpointRequests).toBe(0)
  })

  it("loads every selectable token group through APIyi's paginated group endpoint", async () => {
    const selectableGroups = [
      { name: "default", display_name: "Default", convert_ratio: 1 },
      {
        name: "CodexResponses",
        display_name: "CodexResponses",
        convert_ratio: 1,
      },
      {
        name: "CodexReverse",
        display_name: "Codex_Reverse",
        convert_ratio: 0.5,
      },
      { name: "svip", display_name: "SVIP", convert_ratio: 1 },
      ...Array.from({ length: 997 }, (_, index) => ({
        name: `extra-group-${index}`,
        display_name: `Extra group ${index}`,
        convert_ratio: 2,
      })),
    ]
    let defaultEndpointRequests = 0
    const pages: number[] = []
    server.use(
      http.get(`${baseUrl}/api/user/self/groups`, () => {
        defaultEndpointRequests += 1
        return new HttpResponse(null, { status: 404 })
      }),
      http.get(`${baseUrl}/api/groupPro/selectable`, ({ request }) => {
        const params = new URL(request.url).searchParams
        const page = Number(params.get("p") ?? 0)
        const size = Number(params.get("pageSize") ?? 10)
        pages.push(page)
        return HttpResponse.json({
          success: true,
          data: selectableGroups.slice(page * size, (page + 1) * size),
        })
      }),
    )

    const groups = await getSiteTypeCapabilities(
      SITE_TYPES.APIYI,
    ).account!.keyManagement!.userGroups!.fetch({
      baseUrl,
      auth: { authType: AuthTypeEnum.Cookie, userId: "42" },
    })

    expect(Object.keys(groups)).toHaveLength(1001)
    expect(groups).toMatchObject({
      default: { desc: "Default", ratio: 1 },
      CodexResponses: { desc: "CodexResponses", ratio: 1 },
      CodexReverse: { desc: "Codex_Reverse", ratio: 0.5 },
      svip: { desc: "SVIP", ratio: 1 },
      "extra-group-996": { desc: "Extra group 996", ratio: 2 },
    })
    expect(defaultEndpointRequests).toBe(0)
    expect(pages).toEqual([0, 1])
  })

  it("rejects an unsuccessful pricing envelope without exposing its contents", async () => {
    server.use(
      http.get(`${baseUrl}/api/pricing`, () =>
        HttpResponse.json({
          success: false,
          message: "session=private-session",
          data: [],
          group_ratio: {},
          usable_group: {},
        }),
      ),
    )

    await expect(
      getSiteTypeCapabilities(
        SITE_TYPES.APIYI,
      ).account!.modelPricing!.fetchPricing({
        baseUrl,
        auth: { authType: AuthTypeEnum.Cookie, userId: "42" },
      }),
    ).rejects.toMatchObject({
      message: "APIyi model pricing request failed",
      endpoint: "/api/pricing",
    })
  })
})
