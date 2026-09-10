import { beforeEach, describe, expect, it, vi } from "vitest"

import { SUB2API_SESSION_BINDING_MISMATCH_CODE } from "~/services/apiService/sub2api/browserAuth"
import {
  refreshSub2ApiTokens,
  SUB2API_TOKEN_REFRESH_BUFFER_MS,
  SUB2API_TOKEN_REFRESH_FAILURE_REASONS,
  Sub2ApiTokenRefreshError,
} from "~/services/apiService/sub2api/tokenRefresh"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

const { mockFetchApiResponse } = vi.hoisted(() => ({
  mockFetchApiResponse: vi.fn(),
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiResponse: mockFetchApiResponse,
}))

const createRequest = (
  overrides: Partial<ApiServiceRequest> = {},
): ApiServiceRequest => ({
  baseUrl: "https://auth.example.invalid",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "42",
    accessToken: "current-access",
  },
  ...overrides,
})

const captureRefreshError = async (
  params: Parameters<typeof refreshSub2ApiTokens>[0],
): Promise<unknown> => {
  try {
    await refreshSub2ApiTokens(params)
  } catch (error) {
    return error
  }

  throw new Error("Expected Sub2API token refresh to fail")
}

describe("Sub2API token refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exports the upstream refresh buffer constant", () => {
    expect(SUB2API_TOKEN_REFRESH_BUFFER_MS).toBe(120 * 1000)
  })

  it("rejects when the refresh token is blank after normalization", async () => {
    await expect(
      refreshSub2ApiTokens({
        request: createRequest(),
        refreshToken: "   ",
      }),
    ).rejects.toThrow("Sub2API refresh token missing")
  })

  it("dispatches token rotation through the request transport and preserves its browser context", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    mockFetchApiResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {},
      body: {
        code: 0,
        data: {
          access_token: " next-access ",
          refresh_token: " next-refresh ",
          expires_in: 1800,
        },
      },
    })
    const request = createRequest({
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "42",
        accessToken: " current-access ",
      },
      fetchContext: {
        kind: "current-tab",
        tabId: 17,
        origin: "https://auth.example.invalid",
      },
    })

    const result = await refreshSub2ApiTokens({
      request,
      refreshToken: " current-refresh ",
    })

    expect(mockFetchApiResponse).toHaveBeenCalledWith(
      {
        ...request,
        auth: {
          ...request.auth,
          accessToken: "current-access",
        },
      },
      {
        endpoint: "/api/v1/auth/refresh",
        options: {
          method: "POST",
          body: JSON.stringify({ refresh_token: "current-refresh" }),
        },
      },
    )
    expect(result).toEqual({
      accessToken: "next-access",
      refreshToken: "next-refresh",
      tokenExpiresAt: 1_700_001_800_000,
    })

    nowSpy.mockRestore()
  })

  it("removes a blank current access token before dispatch", async () => {
    mockFetchApiResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {},
      body: {
        code: 0,
        data: {
          access_token: "fresh-access",
          refresh_token: "fresh-refresh",
          expires_in: 60,
        },
      },
    })

    await refreshSub2ApiTokens({
      request: createRequest({
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "  ",
        },
      }),
      refreshToken: " refresh-token ",
    })

    expect(mockFetchApiResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: undefined }),
      }),
      expect.anything(),
    )
  })

  it("treats a lost refresh response as an uncertain rotation", async () => {
    mockFetchApiResponse.mockRejectedValueOnce(
      new Error("raw upstream failure"),
    )

    const error = await captureRefreshError({
      request: createRequest(),
      refreshToken: "refresh-token",
    })

    expect(error).toBeInstanceOf(Sub2ApiTokenRefreshError)
    expect(error).toMatchObject({
      reason: SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
    })
  })

  it("classifies a rejected refresh token as invalid", async () => {
    mockFetchApiResponse.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: {},
      body: { code: 401, message: "expired" },
    })

    const error = await captureRefreshError({
      request: createRequest(),
      refreshToken: "refresh-token",
    })

    expect(error).toBeInstanceOf(Sub2ApiTokenRefreshError)
    expect(error).toMatchObject({
      reason: SUB2API_TOKEN_REFRESH_FAILURE_REASONS.INVALID_REFRESH_TOKEN,
    })
  })

  it("keeps a session-binding rejection distinct from an invalid refresh token", async () => {
    mockFetchApiResponse.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: {},
      body: {
        code: SUB2API_SESSION_BINDING_MISMATCH_CODE,
        message: "Session network fingerprint changed",
      },
    })

    const error = await captureRefreshError({
      request: createRequest(),
      refreshToken: "refresh-token",
    })

    expect(error).toMatchObject({
      reason: SUB2API_TOKEN_REFRESH_FAILURE_REASONS.SESSION_BINDING_MISMATCH,
    })
  })

  it("treats a server-side refresh failure as an uncertain rotation", async () => {
    mockFetchApiResponse.mockResolvedValueOnce({
      ok: false,
      status: 503,
      headers: {},
      body: { code: 503, message: "service unavailable" },
    })

    const error = await captureRefreshError({
      request: createRequest(),
      refreshToken: "refresh-token",
    })

    expect(error).toMatchObject({
      reason: SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
    })
  })

  it("treats a non-object refresh envelope as an uncertain rotation", async () => {
    mockFetchApiResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {},
      body: null,
    })

    const error = await captureRefreshError({
      request: createRequest(),
      refreshToken: "refresh-token",
    })

    expect(error).toMatchObject({
      reason: SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
    })
  })

  it.each([
    ["missing data", null],
    [
      "non-positive expiry",
      {
        access_token: "next-access",
        refresh_token: "next-refresh",
        expires_in: 0,
      },
    ],
    [
      "missing rotated refresh token",
      { access_token: "next-access", expires_in: 3600 },
    ],
  ])("treats %s as an uncertain rotation", async (_name, data) => {
    mockFetchApiResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {},
      body: { code: 0, data },
    })

    const error = await captureRefreshError({
      request: createRequest(),
      refreshToken: "single-use-refresh-token",
    })

    expect(error).toMatchObject({
      reason: SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
    })
  })
})
