import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { handleGetUserFromLocalStorage } from "~/entrypoints/content/messageHandlers/handlers/storage"
import { resolveAccountSiteDefaultAuthType } from "~/services/accounts/accountSiteProfile"
import { completeAutoDetectedAccount } from "~/services/accounts/autoDetectCompletion/completion"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import { getAccountSiteType } from "~/services/siteDetection/detectSiteType"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

vi.mock("~/utils/browser/tempWindowFetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/tempWindowFetch")>()),
  canUseTempWindowFetch: vi.fn().mockResolvedValue(false),
}))

describe.each([
  "https://api.laozhang.ai",
  "https://api2.laozhang.ai",
  "https://api-vip.laozhang.ai",
  "https://api-cf.laozhang.ai",
])("LaoZhang onboarding at %s", (baseUrl) => {
  it("recognizes the hostname without network discovery", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network unavailable"))
    try {
      expect(await getAccountSiteType(baseUrl)).toBe(SITE_TYPES.LAOZHANG)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(resolveAccountSiteDefaultAuthType({ url: baseUrl })).toBe(
        AuthTypeEnum.AccessToken,
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })
  it.each([401, 403])(
    "rejects an expired or forbidden cookie session (%s)",
    async (status) => {
      server.use(
        http.get(`${baseUrl}/api/user/self`, () =>
          HttpResponse.json(
            { success: false, message: "Sign in again" },
            { status },
          ),
        ),
      )
      await expect(
        completeAutoDetectedAccount({
          url: baseUrl,
          detected: {
            siteType: SITE_TYPES.LAOZHANG,
            userId: "42",
            user: { id: 42 },
          },
          requestedAuthType: AuthTypeEnum.Cookie,
        }),
      ).rejects.toMatchObject({
        reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      })
    },
  )
  it("rejects a browser session belonging to a different saved identity", async () => {
    server.use(
      http.get(`${baseUrl}/api/user/self`, () =>
        HttpResponse.json({
          success: true,
          data: { id: 43, username: "different-user" },
        }),
      ),
    )
    await expect(
      completeAutoDetectedAccount({
        url: baseUrl,
        detected: {
          siteType: SITE_TYPES.LAOZHANG,
          userId: "42",
          user: { id: 42 },
        },
        requestedAuthType: AuthTypeEnum.Cookie,
      }),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
    })
  })
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    })
    server.use(
      http.get(`${baseUrl}/api/status`, () =>
        HttpResponse.json({
          success: true,
          data: {
            system_name: "LaoZhang API",
            price: 7,
            CheckinEnabled: false,
          },
        }),
      ),
      http.get(`${baseUrl}/api/user/self`, () =>
        HttpResponse.json({
          success: true,
          data: { id: 42, username: "test-user", access_token: "" },
        }),
      ),
    )
  })

  it("detects the console with System token authentication as its default", async () => {
    expect(await getAccountSiteType(baseUrl)).toBe("laozhang")
    expect(getAccountSiteDefinition(SITE_TYPES.LAOZHANG)).toMatchObject({
      scopes: ["account"],
      adapterFamily: "newApiFamily",
      productProfile: { auth: { defaultAuthType: AuthTypeEnum.AccessToken } },
    })
  })

  it("extracts USER_STATE identity without forwarding dashboard credentials", async () => {
    localStorage.setItem(
      "USER_STATE",
      JSON.stringify({
        user: {
          id: 42,
          username: "test-user",
          access_token: "private-token",
          password: "private-password",
        },
      }),
    )
    localStorage.setItem("X-S-Token", "private-dashboard-token")
    const result = new Promise((resolve) =>
      handleGetUserFromLocalStorage(
        { url: `${baseUrl}/account/profile`, siteType: "laozhang" },
        resolve,
      ),
    )
    await expect(result).resolves.toEqual({
      success: true,
      data: {
        userId: "42",
        user: { id: 42, username: "test-user" },
        siteTypeHint: "laozhang",
      },
    })
  })

  it("does not issue a System token when none exists", async () => {
    const onRecoveryData = vi.fn()
    const issuance = vi.fn(() =>
      HttpResponse.json({ success: true, data: "unexpected-token" }),
    )
    server.use(http.all(`${baseUrl}/api/user/token`, issuance))
    await expect(
      completeAutoDetectedAccount({
        url: baseUrl,
        detected: {
          siteType: SITE_TYPES.LAOZHANG,
          userId: "42",
          user: { id: 42 },
        },
        requestedAuthType: AuthTypeEnum.AccessToken,
        onRecoveryData,
      }),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
    })
    expect(issuance).not.toHaveBeenCalled()
    expect(
      Object.assign({}, ...onRecoveryData.mock.calls.map(([patch]) => patch)),
    ).toMatchObject({
      username: "test-user",
      siteName: "Laozhang",
      exchangeRate: 7,
      authType: AuthTypeEnum.AccessToken,
    })
  })
})
