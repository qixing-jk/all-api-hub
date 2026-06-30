import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
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
  NEW_API_VERIFIED_SESSION_WINDOW_MS,
  NewApiChannelKeyRequirementError,
  submitNewApiLoginTwoFactorCode,
  submitNewApiSecureVerificationCode,
} from "~/services/managedSites/providers/newApiSession"
import { server } from "~~/tests/msw/server"

const { generateNewApiTotpCodeMock, sendRuntimeMessageMock } = vi.hoisted(
  () => ({
    generateNewApiTotpCodeMock: vi.fn<(secret: string) => string>(),
    sendRuntimeMessageMock: vi.fn(),
  }),
)

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

describe("newApiSession", () => {
  beforeEach(() => {
    clearNewApiManagedSessionState()
    generateNewApiTotpCodeMock.mockReset()
    sendRuntimeMessageMock.mockReset()
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
      }),
    ).resolves.toBe("hidden-channel-key")
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
      }),
    ).resolves.toBe("hidden-channel-key-via-temp-context")

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.TempWindowFetch,
        originUrl: BASE_CONFIG.baseUrl,
        fetchUrl: `${BASE_CONFIG.baseUrl}/api/channel/12/key`,
      }),
    )
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
