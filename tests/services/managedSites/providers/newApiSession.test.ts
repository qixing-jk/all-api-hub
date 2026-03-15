import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearNewApiManagedSessionState,
  ensureNewApiManagedSession,
  fetchNewApiChannelKey,
  NEW_API_CHANNEL_KEY_ERROR_KINDS,
  NEW_API_MANAGED_SESSION_STATUSES,
  NEW_API_VERIFIED_SESSION_WINDOW_MS,
  NewApiChannelKeyRequirementError,
  submitNewApiLoginTwoFactorCode,
  submitNewApiSecureVerificationCode,
} from "~/services/managedSites/providers/newApiSession"
import { server } from "~~/tests/msw/server"

const { generateNewApiTotpCodeMock } = vi.hoisted(() => ({
  generateNewApiTotpCodeMock: vi.fn(),
}))

vi.mock(
  "~/services/managedSites/providers/newApiTotp",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("~/services/managedSites/providers/newApiTotp")
    >("~/services/managedSites/providers/newApiTotp")

    return {
      ...actual,
      generateNewApiTotpCode: (...args: unknown[]) =>
        generateNewApiTotpCodeMock(...args),
    }
  },
)

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

const unauthorizedResponse = () =>
  new HttpResponse(null, {
    status: 401,
    headers: {
      "content-type": "text/plain",
    },
  })

describe("newApiSession", () => {
  beforeEach(() => {
    clearNewApiManagedSessionState()
    generateNewApiTotpCodeMock.mockReset()
    vi.useRealTimers()
  })

  it("automatically completes login 2FA and secure verification when a TOTP secret is configured", async () => {
    const endpointCalls = new Map<string, number>()
    let loginPayload: Record<string, string> | null = null
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
      http.post(`${BASE_CONFIG.baseUrl}/api/user/login/2fa`, () =>
        jsonData({}),
      ),
      http.post(`${BASE_CONFIG.baseUrl}/api/verify`, () =>
        jsonData({ verified: true, expires_at: 1_700_000_000 }),
      ),
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
      http.post(`${BASE_CONFIG.baseUrl}/api/channel/12/key`, () =>
        jsonData("hidden-channel-key"),
      ),
    )

    await expect(
      fetchNewApiChannelKey({
        baseUrl: BASE_CONFIG.baseUrl,
        userId: BASE_CONFIG.userId,
        channelId: 12,
      }),
    ).resolves.toBe("hidden-channel-key")
  })

  it("classifies missing login requirements when reading a hidden channel key", async () => {
    server.use(
      http.post(`${BASE_CONFIG.baseUrl}/api/channel/12/key`, () =>
        unauthorizedResponse(),
      ),
    )

    await expect(
      fetchNewApiChannelKey({
        baseUrl: BASE_CONFIG.baseUrl,
        userId: BASE_CONFIG.userId,
        channelId: 12,
      }),
    ).rejects.toMatchObject<NewApiChannelKeyRequirementError>({
      kind: NEW_API_CHANNEL_KEY_ERROR_KINDS.LOGIN_REQUIRED,
    })
  })

  it("classifies secure verification requirements when reading a hidden channel key", async () => {
    server.use(
      http.post(`${BASE_CONFIG.baseUrl}/api/channel/12/key`, () =>
        HttpResponse.json({
          success: false,
          message: "verification required",
          data: null,
        }),
      ),
    )

    await expect(
      fetchNewApiChannelKey({
        baseUrl: BASE_CONFIG.baseUrl,
        userId: BASE_CONFIG.userId,
        channelId: 12,
      }),
    ).rejects.toMatchObject<NewApiChannelKeyRequirementError>({
      kind: NEW_API_CHANNEL_KEY_ERROR_KINDS.SECURE_VERIFICATION_REQUIRED,
    })
  })
})
