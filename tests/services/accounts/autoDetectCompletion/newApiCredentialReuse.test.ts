import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { completeAutoDetectedAccount } from "~/services/accounts/autoDetectCompletion/completion"
import { NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND } from "~/services/accountSiteOnboarding/contracts"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://credential-reuse.example.invalid"

function mockNewApi(
  readUser: (request: Request) => Response = () =>
    HttpResponse.json({ success: true, data: { id: 7, username: "alice" } }),
) {
  const requests = { tokenCreations: 0, authentications: [] as string[] }
  server.use(
    http.get(`${baseUrl}/api/user/self`, ({ request }) => {
      requests.authentications.push(request.headers.get("Authorization") ?? "")
      return readUser(request)
    }),
    http.get(`${baseUrl}/api/user/token`, () => {
      requests.tokenCreations += 1
      return HttpResponse.json({ success: true, data: "replacement-pat" })
    }),
    http.get(`${baseUrl}/api/status`, () =>
      HttpResponse.json({
        success: true,
        data: { system_name: "Example API", checkin_enabled: false, price: 1 },
      }),
    ),
    http.get(`${baseUrl}/api/user/checkin`, () =>
      HttpResponse.json({ success: true, data: { enabled: false } }),
    ),
  )
  return requests
}

describe("New API account credential reuse", () => {
  it("keeps a valid existing PAT when the user endpoint omits the token", async () => {
    let tokenCreations = 0
    const credentialChecks: Array<{
      authorization: string | null
      credentials: RequestCredentials
    }> = []
    server.use(
      http.get(`${baseUrl}/api/user/self`, ({ request }) => {
        credentialChecks.push({
          authorization: request.headers.get("Authorization"),
          credentials: request.credentials,
        })
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
          data: {
            system_name: "Example API",
            checkin_enabled: false,
            price: 1,
          },
        }),
      ),
      http.get(`${baseUrl}/api/user/checkin`, () =>
        HttpResponse.json({ success: true, data: { enabled: false } }),
      ),
    )

    const request = {
      url: baseUrl,
      requestedAuthType: AuthTypeEnum.AccessToken,
      detected: { siteType: SITE_TYPES.NEW_API, userId: "7" },
      existingAccessToken: "existing-pat",
    }
    const result = await completeAutoDetectedAccount(request)

    expect(result).toMatchObject({
      accessToken: "existing-pat",
      userId: "7",
      username: "alice",
    })
    expect(tokenCreations).toBe(0)
    expect(credentialChecks).toContainEqual({
      authorization: "Bearer existing-pat",
      credentials: "omit",
    })
  })

  it("reuses an existing PAT even when the dashboard login has expired", async () => {
    const requests = mockNewApi()

    const result = await completeAutoDetectedAccount({
      url: baseUrl,
      requestedAuthType: AuthTypeEnum.AccessToken,
      existingAccessToken: "existing-pat",
      detected: {
        siteType: SITE_TYPES.NEW_API,
        userId: "7",
        transientAuth: {
          kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
          origin: baseUrl,
          token: "expired-dashboard-jwt",
          sessionId: "dashboard-session",
          expiresAt: 1,
        },
      },
    })

    expect(result.accessToken).toBe("existing-pat")
    expect(requests.tokenCreations).toBe(0)
    expect(requests.authentications).not.toContain(
      "Bearer expired-dashboard-jwt",
    )
  })

  it("rejects a valid credential for a different user without generating a token", async () => {
    const requests = mockNewApi(() =>
      HttpResponse.json({ success: true, data: { id: 8, username: "bob" } }),
    )

    await expect(
      completeAutoDetectedAccount({
        url: baseUrl,
        requestedAuthType: AuthTypeEnum.AccessToken,
        existingAccessToken: "another-users-pat",
        detected: { siteType: SITE_TYPES.NEW_API, userId: "7" },
      }),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
    })
    expect(requests.tokenCreations).toBe(0)
  })

  it("loads saved PATs only after the current PAT is rejected as unauthorized", async () => {
    const requests = mockNewApi((request) =>
      request.headers.get("Authorization") === "Bearer revoked-pat"
        ? HttpResponse.json(
            {
              success: false,
              code: "AUTH_UNAUTHORIZED",
              message: "Invalid token",
            },
            { status: 401 },
          )
        : HttpResponse.json({
            success: true,
            data: { id: 7, username: "alice" },
          }),
    )

    const result = await completeAutoDetectedAccount({
      url: baseUrl,
      requestedAuthType: AuthTypeEnum.AccessToken,
      existingAccessToken: "revoked-pat",
      loadSavedAccessTokens: async () => {
        expect(requests.authentications).toEqual(["Bearer revoked-pat"])
        return ["revoked-pat", "existing-pat"]
      },
      detected: { siteType: SITE_TYPES.NEW_API, userId: "7" },
    })

    expect(result.accessToken).toBe("existing-pat")
    expect(requests.tokenCreations).toBe(0)
    expect(requests.authentications).toEqual([
      "Bearer revoked-pat",
      "Bearer existing-pat",
    ])
  })

  it.each([
    ["network failure", () => HttpResponse.error()],
    [
      "permission denied",
      () => HttpResponse.json({ success: false }, { status: 403 }),
    ],
    [
      "rate limited",
      () => HttpResponse.json({ success: false }, { status: 429 }),
    ],
    [
      "server failure",
      () => HttpResponse.json({ success: false }, { status: 500 }),
    ],
    [
      "disabled account",
      () =>
        HttpResponse.json(
          { success: false, code: "AUTH_USER_DISABLED" },
          { status: 401 },
        ),
    ],
    [
      "missing identity",
      () => HttpResponse.json({ success: true, data: { username: "alice" } }),
    ],
  ])("does not replace credentials after %s", async (_label, response) => {
    const requests = mockNewApi(response)
    const loadSavedAccessTokens = vi.fn().mockResolvedValue(["saved-pat"])

    await expect(
      completeAutoDetectedAccount({
        url: baseUrl,
        requestedAuthType: AuthTypeEnum.AccessToken,
        existingAccessToken: "existing-pat",
        loadSavedAccessTokens,
        detected: { siteType: SITE_TYPES.NEW_API, userId: "7" },
      }),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
    })
    expect(requests.tokenCreations).toBe(0)
    expect(loadSavedAccessTokens).not.toHaveBeenCalled()
  })

  it("reuses a persistent token already read from the browser session", async () => {
    const requests = mockNewApi()

    const result = await completeAutoDetectedAccount({
      url: baseUrl,
      requestedAuthType: AuthTypeEnum.AccessToken,
      detected: {
        siteType: SITE_TYPES.NEW_API,
        userId: "7",
        accessToken: "detected-pat",
      },
    })

    expect(result.accessToken).toBe("detected-pat")
    expect(requests.tokenCreations).toBe(0)
  })

  it.each([AuthTypeEnum.Cookie, AuthTypeEnum.AccessToken])(
    "checks browser-authenticated identity before completing %s accounts",
    async (authType) => {
      const requests = mockNewApi(() =>
        HttpResponse.json({ success: true, data: { id: 8, username: "bob" } }),
      )
      await expect(
        completeAutoDetectedAccount({
          url: baseUrl,
          requestedAuthType: authType,
          detected: { siteType: SITE_TYPES.NEW_API, userId: "7" },
        }),
      ).rejects.toMatchObject({
        reason: AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
      })
      expect(requests.tokenCreations).toBe(0)
    },
  )

  it("checks dashboard identity before exchanging a login bearer for a PAT", async () => {
    const requests = mockNewApi(() =>
      HttpResponse.json({ success: true, data: { id: 8, username: "bob" } }),
    )
    await expect(
      completeAutoDetectedAccount({
        url: baseUrl,
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          siteType: SITE_TYPES.NEW_API,
          userId: "7",
          transientAuth: {
            kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
            origin: baseUrl,
            token: "dashboard-jwt",
            sessionId: "dashboard-session",
            expiresAt: 4_102_444_800,
          },
        },
      }),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
    })
    expect(requests.tokenCreations).toBe(0)
  })

  it("does not expose a credential echoed in a failed verification response", async () => {
    const requests = mockNewApi(() =>
      HttpResponse.json(
        {
          success: false,
          code: "AUTH_INTERNAL_ERROR",
          message: "Cannot validate secret-existing-pat",
        },
        { status: 500 },
      ),
    )
    await expect(
      completeAutoDetectedAccount({
        url: baseUrl,
        requestedAuthType: AuthTypeEnum.AccessToken,
        existingAccessToken: "secret-existing-pat",
        detected: { siteType: SITE_TYPES.NEW_API, userId: "7" },
      }),
    ).rejects.toMatchObject({
      message: "Existing account access token could not be verified",
      cause: { statusCode: 500, upstreamCode: "AUTH_INTERNAL_ERROR" },
    })
    expect(requests.tokenCreations).toBe(0)
  })

  it("stops credential recovery after an inconclusive current-token verification", async () => {
    const requests = mockNewApi((request) =>
      request.headers.get("Authorization") === "Bearer temporarily-unverifiable"
        ? HttpResponse.json({ success: false }, { status: 500 })
        : HttpResponse.json({
            success: true,
            data: { id: 7, username: "alice" },
          }),
    )
    const loadSavedAccessTokens = vi.fn().mockResolvedValue(["working-pat"])
    await expect(
      completeAutoDetectedAccount({
        url: baseUrl,
        requestedAuthType: AuthTypeEnum.AccessToken,
        existingAccessToken: "temporarily-unverifiable",
        loadSavedAccessTokens,
        detected: {
          siteType: SITE_TYPES.NEW_API,
          userId: "7",
          accessToken: "detected-pat",
        },
      }),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
    })
    expect(requests.authentications).toEqual([
      "Bearer temporarily-unverifiable",
    ])
    expect(loadSavedAccessTokens).not.toHaveBeenCalled()
    expect(requests.tokenCreations).toBe(0)
  })

  it("does not adopt a generated PAT if the browser session changed accounts", async () => {
    const requests = mockNewApi((request) =>
      HttpResponse.json({
        success: true,
        data:
          request.headers.get("Authorization") === "Bearer replacement-pat"
            ? { id: 8, username: "bob" }
            : { id: 7, username: "alice" },
      }),
    )
    await expect(
      completeAutoDetectedAccount({
        url: baseUrl,
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: { siteType: SITE_TYPES.NEW_API, userId: "7" },
      }),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
    })
    expect(requests.tokenCreations).toBe(1)
  })

  it("does not expose a newly generated token when its verification fails", async () => {
    const requests = mockNewApi((request) =>
      request.headers.get("Authorization") === "Bearer replacement-pat"
        ? HttpResponse.json(
            { success: false, message: "Cannot verify replacement-pat" },
            { status: 500 },
          )
        : HttpResponse.json({
            success: true,
            data: { id: 7, username: "alice" },
          }),
    )
    await expect(
      completeAutoDetectedAccount({
        url: baseUrl,
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: { siteType: SITE_TYPES.NEW_API, userId: "7" },
      }),
    ).rejects.toMatchObject({
      message: "Account access token could not be obtained",
      cause: { statusCode: 500 },
    })
    expect(requests.tokenCreations).toBe(1)
  })
})
