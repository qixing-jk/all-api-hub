import { beforeEach, describe, expect, it, vi } from "vitest"

import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
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

const { fetchApiDataMock, generateNewApiTotpCodeMock } = vi.hoisted(() => ({
  fetchApiDataMock: vi.fn(),
  generateNewApiTotpCodeMock: vi.fn(),
}))

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApiData: (...args: unknown[]) => fetchApiDataMock(...args),
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

const createUnauthorizedError = (endpoint: string) =>
  new ApiError("unauthorized", 401, endpoint, API_ERROR_CODES.HTTP_401)

describe("newApiSession", () => {
  beforeEach(() => {
    clearNewApiManagedSessionState()
    fetchApiDataMock.mockReset()
    generateNewApiTotpCodeMock.mockReset()
    vi.useRealTimers()
  })

  it("automatically completes login 2FA and secure verification when a TOTP secret is configured", async () => {
    const endpointCalls = new Map<string, number>()

    generateNewApiTotpCodeMock
      .mockReturnValueOnce("111111")
      .mockReturnValueOnce("222222")

    fetchApiDataMock.mockImplementation(async (_request, options) => {
      const endpoint = options.endpoint
      const callCount = (endpointCalls.get(endpoint) ?? 0) + 1
      endpointCalls.set(endpoint, callCount)

      switch (endpoint) {
        case "/api/user/2fa/status":
          if (callCount === 1) {
            throw createUnauthorizedError(endpoint)
          }
          return { enabled: true }
        case "/api/user/passkey":
          if (callCount === 1) {
            throw createUnauthorizedError(endpoint)
          }
          return { enabled: false }
        case "/api/user/login":
          return { require_2fa: true }
        case "/api/user/login/2fa":
          return {}
        case "/api/verify":
          return { verified: true, expires_at: 1_700_000_000 }
        default:
          throw new Error(`Unexpected endpoint: ${endpoint}`)
      }
    })

    const result = await ensureNewApiManagedSession(BASE_CONFIG)

    expect(fetchApiDataMock.mock.calls[0]?.[0]).toMatchObject({
      auth: {
        authType: "cookie",
        userId: "1",
      },
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

    fetchApiDataMock.mockImplementation(async (_request, options) => {
      const endpoint = options.endpoint
      const callCount = (endpointCalls.get(endpoint) ?? 0) + 1
      endpointCalls.set(endpoint, callCount)

      switch (endpoint) {
        case "/api/user/2fa/status":
          if (callCount === 1) {
            throw createUnauthorizedError(endpoint)
          }
          return { enabled: true }
        case "/api/user/passkey":
          if (callCount === 1) {
            throw createUnauthorizedError(endpoint)
          }
          return { enabled: false }
        case "/api/user/login":
          return { require_2fa: true }
        case "/api/user/login/2fa":
          return {}
        case "/api/verify":
          return { verified: true, expires_at: 1_700_000_123 }
        default:
          throw new Error(`Unexpected endpoint: ${endpoint}`)
      }
    })

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

    fetchApiDataMock.mockImplementation(async (_request, options) => {
      switch (options.endpoint) {
        case "/api/user/2fa/status":
          return { enabled: true }
        case "/api/user/passkey":
          return { enabled: false }
        case "/api/verify":
          return { verified: true }
        default:
          throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      }
    })
    generateNewApiTotpCodeMock.mockReturnValue("123456")

    const firstResult = await ensureNewApiManagedSession(BASE_CONFIG)
    expect(firstResult.status).toBe(NEW_API_MANAGED_SESSION_STATUSES.VERIFIED)
    expect(
      fetchApiDataMock.mock.calls.filter(
        ([, options]) =>
          (options as { endpoint?: string }).endpoint === "/api/verify",
      ),
    ).toHaveLength(1)

    fetchApiDataMock.mockClear()

    const reusedResult = await ensureNewApiManagedSession(BASE_CONFIG)
    expect(reusedResult.status).toBe(NEW_API_MANAGED_SESSION_STATUSES.VERIFIED)
    expect(
      fetchApiDataMock.mock.calls.filter(
        ([, options]) =>
          (options as { endpoint?: string }).endpoint === "/api/verify",
      ),
    ).toHaveLength(0)

    vi.advanceTimersByTime(NEW_API_VERIFIED_SESSION_WINDOW_MS + 1_000)
    fetchApiDataMock.mockClear()

    await ensureNewApiManagedSession(BASE_CONFIG)
    expect(
      fetchApiDataMock.mock.calls.filter(
        ([, options]) =>
          (options as { endpoint?: string }).endpoint === "/api/verify",
      ),
    ).toHaveLength(1)
  })

  it("redacts TOTP material from automatic 2FA failure messages", async () => {
    fetchApiDataMock.mockImplementation(async (_request, options) => {
      switch (options.endpoint) {
        case "/api/user/2fa/status":
        case "/api/user/passkey":
          throw createUnauthorizedError(options.endpoint)
        case "/api/user/login":
          return { require_2fa: true }
        case "/api/user/login/2fa":
          throw new Error("JBSWY3DPEHPK3PXP 654321 boom")
        default:
          throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      }
    })
    generateNewApiTotpCodeMock.mockReturnValue("654321")

    const result = await ensureNewApiManagedSession(BASE_CONFIG)

    expect(result).toEqual({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
      automaticAttempted: true,
      errorMessage: "[REDACTED] [REDACTED] boom",
    })
  })

  it("fetches hidden channel keys and classifies missing login or verification requirements", async () => {
    fetchApiDataMock.mockResolvedValueOnce("hidden-channel-key")

    await expect(
      fetchNewApiChannelKey({
        baseUrl: BASE_CONFIG.baseUrl,
        userId: BASE_CONFIG.userId,
        channelId: 12,
      }),
    ).resolves.toBe("hidden-channel-key")

    fetchApiDataMock.mockRejectedValueOnce(
      createUnauthorizedError("/api/channel/12/key"),
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

    fetchApiDataMock.mockRejectedValueOnce(
      new ApiError(
        "verification required",
        403,
        "/api/channel/12/key",
        API_ERROR_CODES.HTTP_403,
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
