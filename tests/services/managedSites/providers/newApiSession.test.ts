import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE } from "~/services/apiService/newApi/dashboardAuth"
import { API_ERROR_CODES, type ApiError } from "~/services/apiTransport/errors"
import {
  clearNewApiManagedSessionState,
  ensureNewApiManagedSession,
  fetchNewApiChannelKey,
  hasNewApiAuthenticatedBrowserSession,
  hasNewApiLoginAssistCredentials,
  isNewApiVerifiedSessionActive,
  NEW_API_CHANNEL_KEY_ERROR_KINDS,
  NEW_API_MANAGED_SESSION_STATUSES,
  NEW_API_SECURITY_PROOF_SCOPES,
  NEW_API_VERIFIED_SESSION_WINDOW_MS,
  NewApiChannelKeyRequirementError,
  submitNewApiLoginTwoFactorCode,
  submitNewApiSecureVerificationCode,
} from "~/services/managedSites/providers/newApiSession"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { server } from "~~/tests/msw/server"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

const MANAGE_API_KEYS_EXECUTION = userCommandExecution(
  PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
)

const {
  generateNewApiTotpCodeMock,
  sendRuntimeMessageMock,
  captureOwnedSessionMock,
  cleanupOwnedSessionMock,
  refreshOwnedSessionMock,
  touchOwnedSessionMock,
  getOwnedSessionStatusMock,
} = vi.hoisted(() => ({
  generateNewApiTotpCodeMock: vi.fn<(secret: string) => string>(),
  sendRuntimeMessageMock: vi.fn(),
  captureOwnedSessionMock: vi.fn(),
  cleanupOwnedSessionMock: vi.fn(),
  refreshOwnedSessionMock: vi.fn(),
  touchOwnedSessionMock: vi.fn(),
  getOwnedSessionStatusMock: vi.fn(),
}))

vi.mock("~/services/managedSites/newApiOwnedSession/client", () => ({
  captureNewApiOwnedSession: (...args: unknown[]) =>
    captureOwnedSessionMock(...args),
  cleanupNewApiOwnedSession: (...args: unknown[]) =>
    cleanupOwnedSessionMock(...args),
  refreshNewApiOwnedSession: (...args: unknown[]) =>
    refreshOwnedSessionMock(...args),
  touchNewApiOwnedSession: (...args: unknown[]) =>
    touchOwnedSessionMock(...args),
  getNewApiOwnedSessionStatus: (...args: unknown[]) =>
    getOwnedSessionStatusMock(...args),
}))

vi.mock(
  "~/services/managedSites/providers/newApiTotp",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/managedSites/providers/newApiTotp")
      >()

    return {
      ...actual,
      generateNewApiTotpCode: generateNewApiTotpCodeMock,
    }
  },
)

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    sendRuntimeMessage: (...args: unknown[]) => sendRuntimeMessageMock(...args),
  }
})

vi.mock("~/utils/browser/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser/index")>()

  return {
    ...actual,
    isExtensionBackground: () => false,
  }
})

const BASE_CONFIG = {
  baseUrl: "https://managed.example",
  userId: "1",
  username: "admin",
  password: "secret-password",
  totpSecret: "JBSWY3DPEHPK3PXP",
}

const jsonData = (data: unknown) =>
  HttpResponse.json({
    success: true,
    message: "",
    data,
  })

const jsonSuccessWithoutData = () =>
  HttpResponse.json({
    success: true,
    message: "",
  })

const unauthorizedResponse = () =>
  new HttpResponse(null, {
    status: 401,
    headers: {
      "content-type": "text/plain",
    },
  })

const createDashboardAuthBundle = (
  token: string,
  overrides: Record<string, unknown> = {},
) => ({
  access_token: token,
  token_type: "Bearer",
  access_expires_at: Math.floor(Date.now() / 1000) + 15 * 60,
  session: {
    sid: "example-session-id",
    current: true,
  },
  user: {
    id: 1,
    username: "example-admin",
  },
  ...overrides,
})

describe("newApiSession", () => {
  beforeEach(() => {
    clearNewApiManagedSessionState()
    generateNewApiTotpCodeMock.mockReset()
    sendRuntimeMessageMock.mockReset()
    captureOwnedSessionMock.mockReset().mockResolvedValue({ success: true })
    cleanupOwnedSessionMock.mockReset().mockResolvedValue({ status: "none" })
    refreshOwnedSessionMock.mockReset().mockResolvedValue({
      success: true,
      owned: false,
    })
    touchOwnedSessionMock.mockReset().mockResolvedValue({
      success: true,
      owned: false,
    })
    getOwnedSessionStatusMock.mockReset().mockResolvedValue({ owned: false })
    vi.useRealTimers()
    server.use(
      http.post(
        `${BASE_CONFIG.baseUrl}/api/user/auth/refresh`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    )
  })

  it("classifies the active-session cap and reports whether owned cleanup is available", async () => {
    getOwnedSessionStatusMock.mockResolvedValue({ owned: true })
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/auth/refresh`, () =>
        HttpResponse.json(
          {
            code: "AUTH_SESSION_LIMIT",
            message: "too many active sessions",
          },
          { status: 409 },
        ),
      ),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).resolves.toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.SESSION_ACTIVE_LIMIT,
      cleanupAvailable: true,
    })
    expect(getOwnedSessionStatusMock).toHaveBeenCalledWith(BASE_CONFIG.baseUrl)
  })

  it("propagates the active-session cap through hidden-key recovery", async () => {
    getOwnedSessionStatusMock.mockResolvedValue({ owned: true })
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/auth/refresh`, () =>
        HttpResponse.json(
          {
            code: "AUTH_SESSION_LIMIT",
            message: "too many active sessions",
          },
          { status: 409 },
        ),
      ),
    )

    await expect(
      fetchNewApiChannelKey({ ...BASE_CONFIG, channelId: 12 }),
    ).rejects.toMatchObject({
      kind: NEW_API_CHANNEL_KEY_ERROR_KINDS.SESSION_LIMIT,
      sessionResult: {
        status: NEW_API_MANAGED_SESSION_STATUSES.SESSION_ACTIVE_LIMIT,
        cleanupAvailable: true,
      },
    } satisfies Pick<
      NewApiChannelKeyRequirementError,
      "kind" | "sessionResult"
    >)
  })

  it("classifies the daily issuance cap without suggesting session cleanup", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        HttpResponse.json(
          {
            code: "AUTH_SESSION_ISSUANCE_LIMIT",
            message: "daily issuance cap reached",
          },
          { status: 429 },
        ),
      ),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).resolves.toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.SESSION_ISSUANCE_LIMIT,
    })
    expect(getOwnedSessionStatusMock).not.toHaveBeenCalled()
  })

  it("captures a modern AuthBundle only when credential login creates it", async () => {
    const token = "fresh-owned-dashboard-token"
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${token}`
          ? jsonData({ enabled: false })
          : unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${token}`
          ? jsonData({ enabled: false })
          : unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData(createDashboardAuthBundle(token)),
      ),
    )

    await ensureNewApiManagedSession(BASE_CONFIG)

    expect(cleanupOwnedSessionMock).toHaveBeenCalledWith(BASE_CONFIG.baseUrl)
    expect(captureOwnedSessionMock).toHaveBeenCalledWith({
      baseUrl: BASE_CONFIG.baseUrl,
      sessionId: "example-session-id",
      accessToken: token,
      accessExpiresAt: expect.any(Number),
    })
    expect(cleanupOwnedSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      captureOwnedSessionMock.mock.invocationCallOrder[0],
    )
    expect(refreshOwnedSessionMock).not.toHaveBeenCalled()
  })

  it("refreshes ownership only through the matching-receipt path", async () => {
    const token = "refreshed-owned-dashboard-token"
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${token}`
          ? jsonData({ enabled: false })
          : unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${token}`
          ? jsonData({ enabled: false })
          : unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/auth/refresh`, () =>
        jsonData(createDashboardAuthBundle(token)),
      ),
    )

    await ensureNewApiManagedSession(BASE_CONFIG)

    expect(refreshOwnedSessionMock).toHaveBeenCalledWith({
      baseUrl: BASE_CONFIG.baseUrl,
      sessionId: "example-session-id",
      accessToken: token,
      accessExpiresAt: expect.any(Number),
    })
    expect(captureOwnedSessionMock).not.toHaveBeenCalled()
  })

  it("automatically completes login 2FA and secure verification when a TOTP secret is configured", async () => {
    const endpointCalls = new Map<string, number>()
    let loginPayload: Record<string, string> | null = null
    let loginTwoFactorPayload: Record<string, string> | null = null
    let verifyPayload: Record<string, string> | null = null
    let firstProbeUserHeader: string | null = null

    generateNewApiTotpCodeMock
      .mockReturnValueOnce("111111")
      .mockReturnValueOnce("222222")

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, ({ request }) => {
        const callCount = (endpointCalls.get("/api/user/2fa/status") ?? 0) + 1
        endpointCalls.set("/api/user/2fa/status", callCount)
        firstProbeUserHeader ??= request.headers.get("New-API-User")

        return callCount === 1
          ? unauthorizedResponse()
          : jsonData({ enabled: true })
      }),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () => {
        const callCount = (endpointCalls.get("/api/user/passkey") ?? 0) + 1
        endpointCalls.set("/api/user/passkey", callCount)

        return callCount === 1
          ? unauthorizedResponse()
          : jsonData({ enabled: false })
      }),
      http.post(
        `${BASE_CONFIG.baseUrl}/api/user/login`,
        async ({ request }) => {
          loginPayload = (await request.json()) as Record<string, string>
          return jsonData({ require_2fa: true })
        },
      ),
      http.post(
        `${BASE_CONFIG.baseUrl}/api/user/login/2fa`,
        async ({ request }) => {
          loginTwoFactorPayload = (await request.json()) as Record<
            string,
            string
          >
          return jsonData({})
        },
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, async ({ request }) => {
        verifyPayload = (await request.json()) as Record<string, string>
        return jsonData({ verified: true, expires_at: 1_700_000_000 })
      }),
    )

    const result = await ensureNewApiManagedSession({
      ...BASE_CONFIG,
      password: "  secret-password  ",
    })

    expect(firstProbeUserHeader).toBe("1")
    expect(loginPayload).toEqual({
      username: "admin",
      password: "  secret-password  ",
    })
    expect(loginTwoFactorPayload).toEqual({ code: "111111" })
    expect(verifyPayload).toEqual({
      method: "2fa",
      code: "222222",
    })
    expect(result).toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
      verifiedUntil: 1_700_000_000_000,
    })
    expect(generateNewApiTotpCodeMock).toHaveBeenCalledTimes(2)
  })

  it("supports a manual login-code step followed by a manual secure-verification step", async () => {
    const endpointCalls = new Map<string, number>()

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () => {
        const callCount = (endpointCalls.get("/api/user/2fa/status") ?? 0) + 1
        endpointCalls.set("/api/user/2fa/status", callCount)

        return callCount === 1
          ? unauthorizedResponse()
          : jsonData({ enabled: true })
      }),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () => {
        const callCount = (endpointCalls.get("/api/user/passkey") ?? 0) + 1
        endpointCalls.set("/api/user/passkey", callCount)

        return callCount === 1
          ? unauthorizedResponse()
          : jsonData({ enabled: false })
      }),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData({ require_2fa: true }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login/2fa`, () =>
        jsonData({}),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        jsonData({ verified: true, expires_at: 1_700_000_123 }),
      ),
    )

    const initialResult = await ensureNewApiManagedSession({
      ...BASE_CONFIG,
      totpSecret: "",
    })

    expect(initialResult).toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
      automaticAttempted: false,
    })

    const login2faResult = await submitNewApiLoginTwoFactorCode(
      {
        ...BASE_CONFIG,
        totpSecret: "",
      },
      "345678",
    )

    expect(login2faResult).toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
      automaticAttempted: false,
    })

    const verifyResult = await submitNewApiSecureVerificationCode(
      BASE_CONFIG,
      "456789",
    )

    expect(verifyResult).toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
      verifiedUntil: 1_700_000_123_000,
    })
  })

  it("continues the current login flow and manages the session with its dashboard bearer", async () => {
    const flowToken = "example-flow-token"
    const dashboardToken = "example-dashboard-token"
    let loginTwoFactorPayload: Record<string, unknown> | null = null
    let verifyAuthorization: string | null = null
    const authenticatedProbeHeaders: Array<string | null> = []

    generateNewApiTotpCodeMock
      .mockReturnValueOnce("111111")
      .mockReturnValueOnce("222222")

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, ({ request }) => {
        const authorization = request.headers.get("authorization")
        if (authorization !== `Bearer ${dashboardToken}`) {
          return unauthorizedResponse()
        }

        authenticatedProbeHeaders.push(authorization)
        return jsonData({ enabled: true })
      }),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, ({ request }) => {
        const authorization = request.headers.get("authorization")
        if (authorization !== `Bearer ${dashboardToken}`) {
          return unauthorizedResponse()
        }

        authenticatedProbeHeaders.push(authorization)
        return jsonData({ enabled: false })
      }),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData({
          require_2fa: true,
          flow_token: flowToken,
          expires_at: Math.floor(Date.now() / 1000) + 5 * 60,
        }),
      ),
      http.post(
        `${BASE_CONFIG.baseUrl}/api/user/login/2fa`,
        async ({ request }) => {
          loginTwoFactorPayload = (await request.json()) as Record<
            string,
            unknown
          >
          if (loginTwoFactorPayload.flow_token !== flowToken) {
            return HttpResponse.json({
              success: false,
              message: "Login flow expired",
              data: null,
            })
          }

          return jsonData({
            access_token: dashboardToken,
            token_type: "Bearer",
            access_expires_at: Math.floor(Date.now() / 1000) + 15 * 60,
            session: {
              sid: "example-session-id",
              current: true,
            },
            user: {
              id: 1,
              username: "example-admin",
            },
          })
        },
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, ({ request }) => {
        verifyAuthorization = request.headers.get("authorization")
        return jsonData({ verified: true, expires_at: 1_700_000_456 })
      }),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).resolves.toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
      verifiedUntil: 1_700_000_456_000,
    })
    expect(loginTwoFactorPayload).toEqual({
      code: "111111",
      flow_token: flowToken,
    })
    expect(authenticatedProbeHeaders.length).toBeGreaterThan(0)
    expect(
      authenticatedProbeHeaders.every(
        (header) => header === `Bearer ${dashboardToken}`,
      ),
    ).toBe(true)
    expect(verifyAuthorization).toBe(`Bearer ${dashboardToken}`)
  })

  it("does not replace an unexpired modern login flow when the session check repeats", async () => {
    let loginCalls = 0
    const flowToken = "example-reused-flow-token"

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () => {
        loginCalls += 1
        return jsonData({
          require_2fa: true,
          flow_token: flowToken,
          expires_at: Math.floor(Date.now() / 1000) + 300,
        })
      }),
    )

    await expect(
      ensureNewApiManagedSession({ ...BASE_CONFIG, totpSecret: "" }),
    ).resolves.toMatchObject({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
    })
    await expect(
      ensureNewApiManagedSession({ ...BASE_CONFIG, totpSecret: "" }),
    ).resolves.toMatchObject({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
    })
    expect(loginCalls).toBe(1)
  })

  it("treats a malformed login-flow expiry as an unbounded manual flow", async () => {
    const flowToken = "example-malformed-expiry-flow"
    let loginTwoFactorPayload: Record<string, unknown> | null = null

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData({
          require_2fa: true,
          flow_token: flowToken,
          expires_at: "not-a-timestamp",
        }),
      ),
      http.post(
        `${BASE_CONFIG.baseUrl}/api/user/login/2fa`,
        async ({ request }) => {
          loginTwoFactorPayload = (await request.json()) as Record<
            string,
            unknown
          >
          return jsonData({})
        },
      ),
    )

    const manualConfig = { ...BASE_CONFIG, totpSecret: "" }
    await expect(ensureNewApiManagedSession(manualConfig)).resolves.toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
      automaticAttempted: false,
    })

    await expect(
      submitNewApiLoginTwoFactorCode(manualConfig, "123456"),
    ).resolves.toMatchObject({
      status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
    })
    expect(loginTwoFactorPayload).toMatchObject({ flow_token: flowToken })
  })

  it("clears expired login flows before manual submission and retrying login", async () => {
    let loginCalls = 0
    const expiredAt = Math.floor(Date.now() / 1000) - 1

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () => {
        loginCalls += 1
        return jsonData({
          require_2fa: true,
          flow_token: `example-expired-flow-${loginCalls}`,
          expires_at: expiredAt,
        })
      }),
    )

    const manualConfig = { ...BASE_CONFIG, totpSecret: "" }
    await expect(
      ensureNewApiManagedSession(manualConfig),
    ).resolves.toMatchObject({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
    })
    await expect(
      submitNewApiLoginTwoFactorCode(manualConfig, "123456"),
    ).rejects.toThrow("New API login flow expired")

    await expect(
      ensureNewApiManagedSession(manualConfig),
    ).resolves.toMatchObject({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
    })
    await expect(
      ensureNewApiManagedSession(manualConfig),
    ).resolves.toMatchObject({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
    })
    expect(loginCalls).toBe(3)
  })

  it("accepts a direct modern login AuthBundle without entering the legacy login-2FA path", async () => {
    const dashboardToken = "example-direct-dashboard-token"
    let loginCalls = 0
    let loginTwoFactorCalls = 0
    let verifyAuthorization: string | null = null
    let verifyUserHeader: string | null = null

    generateNewApiTotpCodeMock.mockReturnValue("333333")

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: true })
          : unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: false })
          : unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () => {
        loginCalls += 1
        return jsonData(createDashboardAuthBundle(dashboardToken))
      }),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login/2fa`, () => {
        loginTwoFactorCalls += 1
        return jsonData({})
      }),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, ({ request }) => {
        verifyAuthorization = request.headers.get("authorization")
        verifyUserHeader = request.headers.get("New-API-User")
        return jsonData({ verified: true, expires_at: 1_700_000_789 })
      }),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).resolves.toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
      verifiedUntil: 1_700_000_789_000,
    })
    expect(loginCalls).toBe(1)
    expect(loginTwoFactorCalls).toBe(0)
    expect(verifyAuthorization).toBe(`Bearer ${dashboardToken}`)
    expect(verifyUserHeader).toBeNull()
  })

  it("refreshes a modern dashboard session before creating another login session", async () => {
    const dashboardToken = "example-refreshed-dashboard-token"
    let refreshCalls = 0
    let loginCalls = 0

    generateNewApiTotpCodeMock.mockReturnValue("444444")

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: true })
          : unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: false })
          : unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/auth/refresh`, () => {
        refreshCalls += 1
        return jsonData(createDashboardAuthBundle(dashboardToken))
      }),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () => {
        loginCalls += 1
        return jsonData({ require_2fa: true })
      }),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, ({ request }) => {
        if (
          request.headers.get("authorization") !== `Bearer ${dashboardToken}`
        ) {
          return unauthorizedResponse()
        }
        return jsonData({ verified: true, expires_at: 1_700_000_890 })
      }),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).resolves.toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
      verifiedUntil: 1_700_000_890_000,
    })
    expect(refreshCalls).toBe(1)
    expect(loginCalls).toBe(0)
  })

  it("does not create another credential session when a valid refresh bundle cannot authenticate probes", async () => {
    let loginCalls = 0

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/auth/refresh`, () =>
        jsonData(createDashboardAuthBundle("example-unusable-token")),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () => {
        loginCalls += 1
        return jsonData({ require_2fa: true })
      }),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).rejects.toMatchObject(
      {
        message: "New API dashboard session could not be authenticated",
        code: API_ERROR_CODES.HTTP_401,
      },
    )
    expect(loginCalls).toBe(0)
  })

  it("refreshes instead of sending an expired cached dashboard bearer", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))

    const firstToken = "example-expiring-dashboard-token"
    const refreshedToken = "example-after-refresh-dashboard-token"
    const observedAuthorizations: string[] = []
    let refreshCalls = 0
    let loginCalls = 0

    generateNewApiTotpCodeMock
      .mockReturnValueOnce("777777")
      .mockReturnValueOnce("888888")

    const bearerMethods =
      (tokens: string[], enabled: boolean) =>
      ({ request }: { request: Request }) => {
        const authorization = request.headers.get("authorization")
        if (authorization) observedAuthorizations.push(authorization)
        return tokens.some((token) => authorization === `Bearer ${token}`)
          ? jsonData({ enabled })
          : unauthorizedResponse()
      }

    server.use(
      http.get(
        `${BASE_CONFIG.baseUrl}/api/user/2fa/status`,
        bearerMethods([firstToken, refreshedToken], true),
      ),
      http.get(
        `${BASE_CONFIG.baseUrl}/api/user/passkey`,
        bearerMethods([firstToken, refreshedToken], false),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () => {
        loginCalls += 1
        return jsonData(
          createDashboardAuthBundle(firstToken, {
            access_expires_at: Math.floor(Date.now() / 1000) + 60,
          }),
        )
      }),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/auth/refresh`, () => {
        refreshCalls += 1
        if (refreshCalls === 1) {
          return new HttpResponse(null, { status: 404 })
        }
        return jsonData(
          createDashboardAuthBundle(refreshedToken, {
            access_expires_at: Math.floor(Date.now() / 1000) + 900,
          }),
        )
      }),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, ({ request }) =>
        [firstToken, refreshedToken].some(
          (token) => request.headers.get("authorization") === `Bearer ${token}`,
        )
          ? jsonData({
              verified: true,
              expires_at: Math.floor(Date.now() / 1000) + 120,
            })
          : unauthorizedResponse(),
      ),
    )

    await expect(
      ensureNewApiManagedSession(BASE_CONFIG),
    ).resolves.toMatchObject({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
    })

    const initialAuthorizationCount = observedAuthorizations.length

    vi.advanceTimersByTime(61_000)

    await expect(
      ensureNewApiManagedSession(BASE_CONFIG),
    ).resolves.toMatchObject({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
    })
    expect(refreshCalls).toBe(2)
    expect(loginCalls).toBe(1)
    expect(
      observedAuthorizations.slice(initialAuthorizationCount),
    ).not.toContain(`Bearer ${firstToken}`)
    expect(observedAuthorizations.slice(initialAuthorizationCount)).toContain(
      `Bearer ${refreshedToken}`,
    )
  })

  it.each([401, 404, 405])(
    "keeps credential login compatible when dashboard refresh returns HTTP %i",
    async (status) => {
      let loginCalls = 0

      server.use(
        http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
          unauthorizedResponse(),
        ),
        http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
          unauthorizedResponse(),
        ),
        http.post(
          `${BASE_CONFIG.baseUrl}/api/user/auth/refresh`,
          () => new HttpResponse(null, { status }),
        ),
        http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () => {
          loginCalls += 1
          return jsonData({ require_2fa: true })
        }),
      )

      await expect(
        ensureNewApiManagedSession({ ...BASE_CONFIG, totpSecret: "" }),
      ).resolves.toEqual({
        status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
        automaticAttempted: false,
      })
      expect(loginCalls).toBe(1)
    },
  )

  it("keeps credential login compatible when refresh returns an unrelated successful body", async () => {
    let loginCalls = 0

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(
        `${BASE_CONFIG.baseUrl}/api/user/auth/refresh`,
        () =>
          new HttpResponse("<html>legacy page</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () => {
        loginCalls += 1
        return jsonData({ require_2fa: true })
      }),
    )

    await expect(
      ensureNewApiManagedSession({ ...BASE_CONFIG, totpSecret: "" }),
    ).resolves.toMatchObject({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
    })
    expect(loginCalls).toBe(1)
  })

  it.each([
    [{ code: "ONLY_CODE", message: "" }, "ONLY_CODE"],
    [{ code: "", message: "Only refresh message" }, "Only refresh message"],
    [{}, "New API session refresh failed (409)"],
  ] as const)(
    "preserves the useful controlled refresh diagnostic when the body has %j",
    async (body, expectedMessage) => {
      server.use(
        http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
          unauthorizedResponse(),
        ),
        http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
          unauthorizedResponse(),
        ),
        http.post(
          `${BASE_CONFIG.baseUrl}/api/user/auth/refresh`,
          () =>
            new HttpResponse(JSON.stringify(body), {
              status: 409,
              headers: { "content-type": "application/json" },
            }),
        ),
      )

      await expect(ensureNewApiManagedSession(BASE_CONFIG)).rejects.toEqual(
        new Error(expectedMessage),
      )
    },
  )

  it("reports an unexpected dashboard refresh status without starting login", async () => {
    let loginCalls = 0

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(
        `${BASE_CONFIG.baseUrl}/api/user/auth/refresh`,
        () => new HttpResponse("upstream failure", { status: 500 }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () => {
        loginCalls += 1
        return jsonData({ require_2fa: true })
      }),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).rejects.toEqual(
      new Error("New API session refresh failed (500)"),
    )
    expect(loginCalls).toBe(0)
  })

  it("falls back to credential login when refresh returns unrelated JSON", async () => {
    let loginCalls = 0

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/auth/refresh`, () =>
        jsonData({ legacy: true }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () => {
        loginCalls += 1
        return jsonData({ require_2fa: true })
      }),
    )

    await expect(
      ensureNewApiManagedSession({ ...BASE_CONFIG, totpSecret: "" }),
    ).resolves.toMatchObject({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
    })
    expect(loginCalls).toBe(1)
  })

  it("returns a stable error when dashboard refresh cannot be dispatched", async () => {
    let loginCalls = 0

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/auth/refresh`, () =>
        HttpResponse.error(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () => {
        loginCalls += 1
        return jsonData({ require_2fa: true })
      }),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).rejects.toEqual(
      new Error("New API session refresh request failed"),
    )
    expect(loginCalls).toBe(0)
  })

  it("rejects a recognizable but malformed modern dashboard response without starting another login", async () => {
    let loginCalls = 0

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/auth/refresh`, () =>
        jsonData({ access_token: "incomplete-dashboard-token" }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () => {
        loginCalls += 1
        return jsonData({ require_2fa: true })
      }),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).rejects.toThrow(
      NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE,
    )
    expect(loginCalls).toBe(0)
  })

  it.each([409, 429])(
    "preserves safe dashboard refresh diagnostics for HTTP %i without issuing another session",
    async (status) => {
      let loginCalls = 0
      const sensitiveToken = "must-not-leak-dashboard-token"

      server.use(
        http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
          unauthorizedResponse(),
        ),
        http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
          unauthorizedResponse(),
        ),
        http.post(`${BASE_CONFIG.baseUrl}/api/user/auth/refresh`, () =>
          HttpResponse.json(
            {
              success: false,
              code: `AUTH_${status}`,
              message: "Session issuance unavailable",
              data: { access_token: sensitiveToken },
            },
            { status },
          ),
        ),
        http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () => {
          loginCalls += 1
          return jsonData({ require_2fa: true })
        }),
      )

      let caught: unknown
      try {
        await ensureNewApiManagedSession(BASE_CONFIG)
      } catch (error) {
        caught = error
      }

      expect(caught).toEqual(
        new Error(`AUTH_${status}: Session issuance unavailable`),
      )
      expect((caught as Error).message).not.toContain(sensitiveToken)
      expect(loginCalls).toBe(0)
    },
  )

  it("reuses an active verified session until the expiry window passes", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))

    let verifyCalls = 0

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        jsonData({ enabled: true }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        jsonData({ enabled: false }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () => {
        verifyCalls += 1
        return jsonData({ verified: true })
      }),
    )
    generateNewApiTotpCodeMock.mockReturnValue("123456")

    const firstResult = await ensureNewApiManagedSession(BASE_CONFIG)
    expect(firstResult.status).toBe(NEW_API_MANAGED_SESSION_STATUSES.VERIFIED)
    expect(verifyCalls).toBe(1)

    const reusedResult = await ensureNewApiManagedSession(BASE_CONFIG)
    expect(reusedResult.status).toBe(NEW_API_MANAGED_SESSION_STATUSES.VERIFIED)
    expect(verifyCalls).toBe(1)

    vi.advanceTimersByTime(NEW_API_VERIFIED_SESSION_WINDOW_MS + 1_000)

    await ensureNewApiManagedSession(BASE_CONFIG)
    expect(verifyCalls).toBe(2)
  })

  it("reports browser-session availability and propagates unexpected probe failures", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        jsonData({ enabled: false }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
    )

    await expect(
      hasNewApiAuthenticatedBrowserSession(BASE_CONFIG),
    ).resolves.toBe(true)

    clearNewApiManagedSessionState()
    server.use(
      http.get(
        `${BASE_CONFIG.baseUrl}/api/user/2fa/status`,
        () => new HttpResponse("boom", { status: 500 }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
    )

    await expect(
      hasNewApiAuthenticatedBrowserSession(BASE_CONFIG),
    ).rejects.toMatchObject({
      message: expect.stringContaining("500"),
    })
  })

  it("distinguishes when stored login-assist credentials are usable", () => {
    expect(
      hasNewApiLoginAssistCredentials({
        username: " admin ",
        password: "secret",
      }),
    ).toBe(true)
    expect(
      hasNewApiLoginAssistCredentials({
        username: " ",
        password: "secret",
      }),
    ).toBe(false)
    expect(hasNewApiLoginAssistCredentials(null)).toBe(false)
  })

  it("returns passkey-manual-required when passkeys are enabled without 2FA", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        jsonData({ enabled: false }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        jsonData({ enabled: true }),
      ),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).resolves.toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.PASSKEY_MANUAL_REQUIRED,
      methods: {
        twoFactorEnabled: false,
        passkeyEnabled: true,
      },
    })
  })

  it("falls back to logged-in defaults when login succeeds but follow-up method probes are unavailable", async () => {
    const endpointCalls = new Map<string, number>()

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () => {
        const callCount = (endpointCalls.get("/api/user/2fa/status") ?? 0) + 1
        endpointCalls.set("/api/user/2fa/status", callCount)
        return unauthorizedResponse()
      }),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () => {
        const callCount = (endpointCalls.get("/api/user/passkey") ?? 0) + 1
        endpointCalls.set("/api/user/passkey", callCount)
        return unauthorizedResponse()
      }),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData({ require_2fa: false }),
      ),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).resolves.toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
      methods: {
        twoFactorEnabled: false,
        passkeyEnabled: false,
      },
      automaticAttempted: false,
    })

    expect(endpointCalls.get("/api/user/2fa/status")).toBe(2)
    expect(endpointCalls.get("/api/user/passkey")).toBe(2)
  })

  it("rejects a non-record login response with a stable error", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        HttpResponse.json(null),
      ),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).rejects.toMatchObject(
      {
        message: "messages:errors.api.invalidResponseFormat",
        code: API_ERROR_CODES.JSON_PARSE_ERROR,
      } satisfies Pick<ApiError, "code" | "message">,
    )
  })

  it("rejects a successful login response that omits data", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonSuccessWithoutData(),
      ),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).rejects.toMatchObject(
      {
        message: "messages:errors.api.invalidResponseFormat",
        code: API_ERROR_CODES.JSON_PARSE_ERROR,
      } satisfies Pick<ApiError, "code" | "message">,
    )
  })

  it("rejects a malformed modern AuthBundle returned by login", async () => {
    let loginTwoFactorCalls = 0

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData({ access_token: "incomplete-login-dashboard-token" }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login/2fa`, () => {
        loginTwoFactorCalls += 1
        return jsonData({})
      }),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).rejects.toThrow(
      "New API dashboard session response is invalid",
    )
    expect(loginTwoFactorCalls).toBe(0)
  })

  it("uses logged-in compatibility defaults when login data is not a record", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData("legacy-login-payload"),
      ),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).resolves.toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
      methods: {
        twoFactorEnabled: false,
        passkeyEnabled: false,
      },
      automaticAttempted: false,
    })
  })

  it("redacts TOTP material when automatic secure verification fails after login succeeds", async () => {
    generateNewApiTotpCodeMock.mockReturnValue("222222")

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        jsonData({ enabled: true }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        jsonData({ enabled: false }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        HttpResponse.json({
          success: false,
          message: "JBSWY3DPEHPK3PXP 222222 secure verify failed",
          data: null,
        }),
      ),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).resolves.toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
      automaticAttempted: true,
      errorMessage: "[REDACTED] [REDACTED] secure verify failed",
    })
  })

  it("preserves automaticAttempted when login 2FA succeeds but secure verification is still required", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        jsonData({ enabled: false }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        jsonData({ enabled: false }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login/2fa`, () =>
        jsonData({}),
      ),
    )

    await expect(
      submitNewApiLoginTwoFactorCode(BASE_CONFIG, " 123456 ", {
        automaticAttempted: true,
      }),
    ).resolves.toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
      methods: {
        twoFactorEnabled: false,
        passkeyEnabled: false,
      },
      automaticAttempted: true,
    })
  })

  it("accepts login 2FA success responses without a data payload", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        jsonData({ enabled: false }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        jsonData({ enabled: false }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login/2fa`, () =>
        jsonSuccessWithoutData(),
      ),
    )

    await expect(
      submitNewApiLoginTwoFactorCode(BASE_CONFIG, "123456"),
    ).resolves.toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
      methods: {
        twoFactorEnabled: false,
        passkeyEnabled: false,
      },
      automaticAttempted: false,
    })
  })

  it("rejects a malformed modern AuthBundle returned by login 2FA", async () => {
    server.use(
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login/2fa`, () =>
        jsonData({ access_token: "incomplete-login-2fa-dashboard-token" }),
      ),
    )

    await expect(
      submitNewApiLoginTwoFactorCode(BASE_CONFIG, "123456"),
    ).rejects.toThrow(NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE)
  })

  it("uses the stable fallback when login 2FA failure messages are not strings", async () => {
    server.use(
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login/2fa`, () =>
        HttpResponse.json({
          success: false,
          message: { detail: "unexpected shape" },
          data: null,
        }),
      ),
    )

    await expect(
      submitNewApiLoginTwoFactorCode(BASE_CONFIG, "123456"),
    ).rejects.toMatchObject({
      message: "messages:errors.api.invalidResponseFormat",
    } satisfies Pick<ApiError, "message">)
  })

  it("uses the stable fallback when login failure messages are not strings", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        HttpResponse.json({
          success: false,
          message: { detail: "unexpected shape" },
          data: null,
        }),
      ),
    )

    await expect(ensureNewApiManagedSession(BASE_CONFIG)).rejects.toMatchObject(
      {
        message: "messages:errors.api.invalidResponseFormat",
        code: API_ERROR_CODES.BUSINESS_ERROR,
      } satisfies Pick<ApiError, "code" | "message">,
    )
  })

  it("rejects non-record login 2FA responses with a stable error", async () => {
    server.use(
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login/2fa`, () =>
        HttpResponse.json(null),
      ),
    )

    await expect(
      submitNewApiLoginTwoFactorCode(BASE_CONFIG, "123456"),
    ).rejects.toMatchObject({
      message: "messages:errors.api.invalidResponseFormat",
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    } satisfies Pick<ApiError, "code" | "message">)
  })

  it("redacts TOTP material from automatic 2FA failure messages", async () => {
    generateNewApiTotpCodeMock.mockReturnValue("654321")

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData({ require_2fa: true }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login/2fa`, () =>
        HttpResponse.json({
          success: false,
          message: "JBSWY3DPEHPK3PXP 654321 boom",
          data: null,
        }),
      ),
    )

    const result = await ensureNewApiManagedSession(BASE_CONFIG)

    expect(result).toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
      automaticAttempted: true,
      errorMessage: "[REDACTED] [REDACTED] boom",
    })
  })

  it("fetches hidden channel keys when the browser session is already verified", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        jsonData({ enabled: true }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        jsonData({ enabled: false }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        jsonData({ verified: true, expires_at: 1_700_000_000 }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/channel/12/key`, () =>
        jsonData("hidden-channel-key"),
      ),
    )
    generateNewApiTotpCodeMock.mockReturnValue("123456")

    await expect(
      fetchNewApiChannelKey({
        ...BASE_CONFIG,
        channelId: 12,
        protectionBypassExecution: MANAGE_API_KEYS_EXECUTION,
      }),
    ).resolves.toBe("hidden-channel-key")
  })

  it("uses the modern dashboard bearer for hidden channel-key reads", async () => {
    const dashboardToken = "example-key-dashboard-token"
    const proofToken = "example-channel-key-proof-token"
    let verifyPayload: Record<string, string> | null = null
    let keyAuthorization: string | null = null
    let keyUserHeader: string | null = null
    let keyProof: string | null = null

    generateNewApiTotpCodeMock.mockReturnValue("555555")

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: true })
          : unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: false })
          : unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData(createDashboardAuthBundle(dashboardToken)),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, async ({ request }) => {
        if (
          request.headers.get("authorization") !== `Bearer ${dashboardToken}`
        ) {
          return unauthorizedResponse()
        }
        verifyPayload = (await request.json()) as Record<string, string>
        if (
          verifyPayload.scope !== NEW_API_SECURITY_PROOF_SCOPES.CHANNEL_KEY_READ
        ) {
          return HttpResponse.json({
            success: false,
            message: "不支持的安全验证范围",
            data: null,
          })
        }
        return jsonData({
          proof_token: proofToken,
          expires_at: Math.floor(Date.now() / 1000) + 300,
          method: "2fa",
          scope: NEW_API_SECURITY_PROOF_SCOPES.CHANNEL_KEY_READ,
        })
      }),
      http.post(`${BASE_CONFIG.baseUrl}/api/channel/12/key`, ({ request }) => {
        keyAuthorization = request.headers.get("authorization")
        keyUserHeader = request.headers.get("New-API-User")
        keyProof = request.headers.get("X-Security-Proof")
        return jsonData("modern-hidden-channel-key")
      }),
    )

    await expect(
      ensureNewApiManagedSession(BASE_CONFIG),
    ).resolves.toMatchObject({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
    })

    await expect(
      fetchNewApiChannelKey({
        ...BASE_CONFIG,
        channelId: 12,
        protectionBypassExecution: MANAGE_API_KEYS_EXECUTION,
      }),
    ).resolves.toBe("modern-hidden-channel-key")

    expect(keyAuthorization).toBe(`Bearer ${dashboardToken}`)
    expect(keyUserHeader).toBeNull()
    expect(verifyPayload).toEqual({
      method: "2fa",
      code: "555555",
      scope: NEW_API_SECURITY_PROOF_SCOPES.CHANNEL_KEY_READ,
    })
    expect(keyProof).toBe(proofToken)
    expect(touchOwnedSessionMock).toHaveBeenCalledWith(
      BASE_CONFIG.baseUrl,
      "example-session-id",
    )
    expect(sendRuntimeMessageMock).not.toHaveBeenCalled()
  })

  it("preserves the scoped proof across repeated hidden channel-key reads", async () => {
    const dashboardToken = "example-reused-dashboard-token"
    const proofToken = "example-reused-channel-key-proof"
    const observedProofs: Array<string | null> = []
    let keyReadCount = 0

    generateNewApiTotpCodeMock.mockReturnValue("777777")

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: true })
          : unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: false })
          : unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData(createDashboardAuthBundle(dashboardToken)),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        jsonData({
          proof_token: proofToken,
          expires_at: Math.floor(Date.now() / 1000) + 300,
        }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/channel/12/key`, ({ request }) => {
        const proof = request.headers.get("X-Security-Proof")
        observedProofs.push(proof)
        if (proof !== proofToken) {
          return HttpResponse.json({
            success: false,
            message: "verification required",
            data: null,
          })
        }

        keyReadCount += 1
        return jsonData(`reused-proof-key-${keyReadCount}`)
      }),
    )

    await ensureNewApiManagedSession(BASE_CONFIG)

    const keyRequest = {
      ...BASE_CONFIG,
      channelId: 12,
      protectionBypassExecution: MANAGE_API_KEYS_EXECUTION,
    }
    await expect(fetchNewApiChannelKey(keyRequest)).resolves.toBe(
      "reused-proof-key-1",
    )
    await expect(fetchNewApiChannelKey(keyRequest)).resolves.toBe(
      "reused-proof-key-2",
    )

    expect(observedProofs).toEqual([proofToken, proofToken])
  })

  it("clears an expired security proof together with the verified window", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))

    const dashboardToken = "example-expiring-proof-dashboard-token"
    const proofToken = "example-expiring-security-proof"
    generateNewApiTotpCodeMock.mockReturnValue("999999")

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: true })
          : unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: false })
          : unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData(createDashboardAuthBundle(dashboardToken)),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        jsonData({
          proof_token: proofToken,
          expires_at: Math.floor(Date.now() / 1000) + 60,
        }),
      ),
    )

    await expect(
      ensureNewApiManagedSession(BASE_CONFIG),
    ).resolves.toMatchObject({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
    })
    expect(isNewApiVerifiedSessionActive(BASE_CONFIG.baseUrl)).toBe(true)

    vi.advanceTimersByTime(61_000)

    expect(isNewApiVerifiedSessionActive(BASE_CONFIG.baseUrl)).toBe(false)
    await expect(
      ensureNewApiManagedSession({ ...BASE_CONFIG, totpSecret: "" }),
    ).resolves.toMatchObject({
      status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
    })
  })

  it("redacts transient dashboard credentials from generic channel-read errors", async () => {
    const dashboardToken = "example-generic-error-dashboard-token"
    const proofToken = "example-generic-error-proof-token"
    generateNewApiTotpCodeMock.mockReturnValue("121212")

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: true })
          : unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: false })
          : unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData(createDashboardAuthBundle(dashboardToken)),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        jsonData({
          proof_token: proofToken,
          expires_at: Math.floor(Date.now() / 1000) + 300,
        }),
      ),
    )

    await ensureNewApiManagedSession(BASE_CONFIG)

    const transientError = new Error(
      `${dashboardToken} ${proofToken} channel read failed`,
    )
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(transientError)

    try {
      await expect(
        fetchNewApiChannelKey({
          baseUrl: BASE_CONFIG.baseUrl,
          userId: BASE_CONFIG.userId,
          channelId: 12,
        }),
      ).rejects.toMatchObject({
        name: "Error",
        message: "[REDACTED] [REDACTED] channel read failed",
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("preserves an ordinary generic channel-read error when it has no secret", async () => {
    const dashboardToken = "example-ordinary-error-dashboard-token"
    generateNewApiTotpCodeMock.mockReturnValue("343434")

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: true })
          : unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: false })
          : unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData(createDashboardAuthBundle(dashboardToken)),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        jsonData({
          verified: true,
          expires_at: Math.floor(Date.now() / 1000) + 300,
        }),
      ),
    )

    await ensureNewApiManagedSession(BASE_CONFIG)

    const ordinaryError = new Error("ordinary channel read failure")
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(ordinaryError)

    try {
      await expect(
        fetchNewApiChannelKey({
          baseUrl: BASE_CONFIG.baseUrl,
          userId: BASE_CONFIG.userId,
          channelId: 12,
        }),
      ).rejects.toBe(ordinaryError)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("does not put modern dashboard credentials into the legacy temp-context fallback task", async () => {
    const dashboardToken = "example-blocked-dashboard-token"
    const proofToken = "example-blocked-channel-key-proof"

    generateNewApiTotpCodeMock.mockReturnValue("666666")

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: true })
          : unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({ enabled: false })
          : unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData(createDashboardAuthBundle(dashboardToken)),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, ({ request }) =>
        request.headers.get("authorization") === `Bearer ${dashboardToken}`
          ? jsonData({
              proof_token: proofToken,
              expires_at: Math.floor(Date.now() / 1000) + 300,
            })
          : unauthorizedResponse(),
      ),
      http.post(
        `${BASE_CONFIG.baseUrl}/api/channel/12/key`,
        () =>
          new HttpResponse("<html>blocked</html>", {
            status: 403,
            headers: { "content-type": "text/html" },
          }),
      ),
    )

    await ensureNewApiManagedSession(BASE_CONFIG)

    await expect(
      fetchNewApiChannelKey({
        ...BASE_CONFIG,
        channelId: 12,
        protectionBypassExecution: MANAGE_API_KEYS_EXECUTION,
      }),
    ).rejects.toMatchObject({
      kind: NEW_API_CHANNEL_KEY_ERROR_KINDS.SECURE_VERIFICATION_REQUIRED,
    })
    expect(sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(JSON.stringify(sendRuntimeMessageMock.mock.calls)).not.toContain(
      dashboardToken,
    )
    expect(JSON.stringify(sendRuntimeMessageMock.mock.calls)).not.toContain(
      proofToken,
    )
  })

  it("retries hidden channel-key reads through the shared temp-context pipeline when the direct request is blocked", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        jsonData({ enabled: true }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        jsonData({ enabled: false }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        jsonData({ verified: true, expires_at: 1_700_000_000 }),
      ),
      http.post(
        `${BASE_CONFIG.baseUrl}/api/channel/12/key`,
        () =>
          new HttpResponse("<html>blocked</html>", {
            status: 403,
            headers: {
              "content-type": "text/html",
            },
          }),
      ),
    )
    generateNewApiTotpCodeMock.mockReturnValue("123456")
    sendRuntimeMessageMock.mockResolvedValueOnce({
      success: true,
      data: {
        success: true,
        message: "",
        data: "hidden-channel-key-via-temp-context",
      },
    })

    await expect(
      fetchNewApiChannelKey({
        ...BASE_CONFIG,
        channelId: 12,
        protectionBypassExecution: MANAGE_API_KEYS_EXECUTION,
      }),
    ).resolves.toBe("hidden-channel-key-via-temp-context")

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
        task: {
          kind: "new_api_session_read",
          params: expect.objectContaining({
            origin: BASE_CONFIG.baseUrl,
            action: "channel_key",
            channelId: 12,
            userId: BASE_CONFIG.userId,
          }),
        },
        execution: MANAGE_API_KEYS_EXECUTION,
      }),
    )
    expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(1)
    const envelope = sendRuntimeMessageMock.mock.calls[0]?.[0]
    expect(envelope).toBeDefined()
    expect(envelope).not.toHaveProperty("protectionBypassExecution")
    expect(envelope).not.toHaveProperty("tempWindowRequestSource")
    expect(envelope?.task).not.toHaveProperty("execution")
    expect(envelope?.task?.params).not.toHaveProperty(
      "protectionBypassExecution",
    )
    expect(envelope?.task?.params).not.toHaveProperty("tempWindowRequestSource")
  })

  it("preserves structured temp-context errors when rollback is impossible for a hidden key read", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        jsonData({ enabled: true }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        jsonData({ enabled: false }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        jsonData({ verified: true, expires_at: 1_700_000_000 }),
      ),
      http.post(
        `${BASE_CONFIG.baseUrl}/api/channel/12/key`,
        () =>
          new HttpResponse("<html>blocked</html>", {
            status: 403,
            headers: {
              "content-type": "text/html",
            },
          }),
      ),
    )
    generateNewApiTotpCodeMock.mockReturnValue("123456")
    sendRuntimeMessageMock.mockResolvedValueOnce({
      success: false,
      error: "messages:background.windowCreationUnavailable",
      code: API_ERROR_CODES.TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE,
    })

    await expect(
      fetchNewApiChannelKey({
        ...BASE_CONFIG,
        channelId: 12,
        protectionBypassExecution: MANAGE_API_KEYS_EXECUTION,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: "messages:background.windowCreationUnavailable",
        code: API_ERROR_CODES.TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE,
      } satisfies Pick<ApiError, "code" | "message">),
    )
  })

  it("skips the per-channel key endpoint when preflight determines login 2FA is still required", async () => {
    let keyEndpointCalls = 0

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        unauthorizedResponse(),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        unauthorizedResponse(),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login`, () =>
        jsonData({ require_2fa: true }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/channel/12/key`, () => {
        keyEndpointCalls += 1
        return jsonData("should-not-be-requested")
      }),
    )

    await expect(
      fetchNewApiChannelKey({
        baseUrl: BASE_CONFIG.baseUrl,
        userId: BASE_CONFIG.userId,
        channelId: 12,
      }),
    ).rejects.toMatchObject({
      kind: NEW_API_CHANNEL_KEY_ERROR_KINDS.LOGIN_REQUIRED,
      sessionResult: {
        status: NEW_API_MANAGED_SESSION_STATUSES.CREDENTIALS_MISSING,
      },
    } satisfies Pick<
      NewApiChannelKeyRequirementError,
      "kind" | "sessionResult"
    >)

    expect(keyEndpointCalls).toBe(0)
  })

  it("skips the per-channel key endpoint when preflight determines secure verification is still required", async () => {
    let keyEndpointCalls = 0

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        jsonData({ enabled: true }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        jsonData({ enabled: false }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/channel/12/key`, () => {
        keyEndpointCalls += 1
        return jsonData("should-not-be-requested")
      }),
    )

    await expect(
      fetchNewApiChannelKey({
        baseUrl: BASE_CONFIG.baseUrl,
        userId: BASE_CONFIG.userId,
        username: BASE_CONFIG.username,
        password: BASE_CONFIG.password,
        totpSecret: "",
        channelId: 12,
      }),
    ).rejects.toMatchObject({
      kind: NEW_API_CHANNEL_KEY_ERROR_KINDS.SECURE_VERIFICATION_REQUIRED,
      sessionResult: {
        status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
        methods: {
          twoFactorEnabled: true,
          passkeyEnabled: false,
        },
        automaticAttempted: false,
      },
    } satisfies Pick<
      NewApiChannelKeyRequirementError,
      "kind" | "sessionResult"
    >)

    expect(keyEndpointCalls).toBe(0)
  })

  it("still classifies key-endpoint verification failures after a verified session preflight", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        jsonData({ enabled: true }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        jsonData({ enabled: false }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        jsonData({ verified: true, expires_at: 1_700_000_000 }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/channel/12/key`, () =>
        HttpResponse.json({
          success: false,
          message: "verification required",
          data: null,
        }),
      ),
    )
    generateNewApiTotpCodeMock.mockReturnValue("123456")

    await expect(
      fetchNewApiChannelKey({
        ...BASE_CONFIG,
        channelId: 12,
      }),
    ).rejects.toMatchObject({
      kind: NEW_API_CHANNEL_KEY_ERROR_KINDS.SECURE_VERIFICATION_REQUIRED,
    } satisfies Pick<NewApiChannelKeyRequirementError, "kind">)
  })

  it("reuses an already-verified session for hidden key reads without re-running preflight probes", async () => {
    let twoFactorCalls = 0

    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () => {
        twoFactorCalls += 1
        return jsonData({ enabled: true })
      }),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        jsonData({ enabled: false }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        jsonData({ verified: true }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/channel/99/key`, () =>
        jsonData({ key: "cached-session-key" }),
      ),
    )
    generateNewApiTotpCodeMock.mockReturnValue("123456")

    await ensureNewApiManagedSession(BASE_CONFIG)
    expect(isNewApiVerifiedSessionActive(BASE_CONFIG.baseUrl)).toBe(true)
    const preflightCalls = twoFactorCalls

    await expect(
      fetchNewApiChannelKey({
        ...BASE_CONFIG,
        channelId: 99,
      }),
    ).resolves.toBe("cached-session-key")

    expect(twoFactorCalls).toBe(preflightCalls)
  })

  it("treats unauthorized key reads as a login-required recovery state", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        jsonData({ enabled: true }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        jsonData({ enabled: false }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        jsonData({ verified: true, expires_at: 1_700_000_000 }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/channel/77/key`, () =>
        unauthorizedResponse(),
      ),
    )
    generateNewApiTotpCodeMock.mockReturnValue("123456")

    await expect(
      fetchNewApiChannelKey({
        ...BASE_CONFIG,
        channelId: 77,
      }),
    ).rejects.toMatchObject({
      kind: NEW_API_CHANNEL_KEY_ERROR_KINDS.LOGIN_REQUIRED,
    } satisfies Pick<NewApiChannelKeyRequirementError, "kind">)

    expect(isNewApiVerifiedSessionActive(BASE_CONFIG.baseUrl)).toBe(false)
  })

  it("throws a stable error when the key endpoint returns an empty payload", async () => {
    server.use(
      http.get(`${BASE_CONFIG.baseUrl}/api/user/2fa/status`, () =>
        jsonData({ enabled: true }),
      ),
      http.get(`${BASE_CONFIG.baseUrl}/api/user/passkey`, () =>
        jsonData({ enabled: false }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        jsonData({ verified: true, expires_at: 1_700_000_000 }),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/channel/55/key`, () =>
        jsonData({ key: "   " }),
      ),
    )
    generateNewApiTotpCodeMock.mockReturnValue("123456")

    await expect(
      fetchNewApiChannelKey({
        ...BASE_CONFIG,
        channelId: 55,
      }),
    ).rejects.toThrow("new_api_channel_key_missing")
  })
})
