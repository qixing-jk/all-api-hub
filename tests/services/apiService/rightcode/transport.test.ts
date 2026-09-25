import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  RIGHTCODE_ENDPOINTS,
  RIGHTCODE_INVITE_PATH,
} from "~/services/apiService/rightcode/constants"
import {
  fetchRightCodeData,
  isRightCodeAuthFailureError,
} from "~/services/apiService/rightcode/transport"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import * as requestExecution from "~/services/apiTransport/requestExecution"
import { AuthTypeEnum } from "~/types"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

vi.mock("~/services/apiTransport/requestExecution", () => ({
  fetchPreparedJsonResponse: vi.fn(),
}))

const request = {
  baseUrl: "https://www.right.codes",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "valid-token" },
}

describe("rightcode transport and constants", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("builds dynamic endpoint URLs and provides invite path", () => {
    expect(RIGHTCODE_ENDPOINTS.apiKeyDetail(42)).toBe("/api-key/42")
    expect(RIGHTCODE_ENDPOINTS.apiKeyExpire(42)).toBe("/api-key/42/expire")
    expect(RIGHTCODE_ENDPOINTS.apiKeyResetUsage(42)).toBe(
      "/api-key/42/reset-usage",
    )
    expect(RIGHTCODE_INVITE_PATH).toBe("/register")
  })

  it("identifies 401 ApiError as auth failure", () => {
    expect(
      isRightCodeAuthFailureError(
        new ApiError("unauth", 401, "/auth/me", API_ERROR_CODES.HTTP_401),
      ),
    ).toBe(true)
    expect(
      isRightCodeAuthFailureError(
        new ApiError("forbidden", 403, "/auth/me", API_ERROR_CODES.HTTP_403),
      ),
    ).toBe(false)
    expect(isRightCodeAuthFailureError(new Error("generic"))).toBe(false)
  })

  it("throws 401 ApiError immediately when access token is missing", async () => {
    await expect(
      fetchRightCodeData(
        {
          baseUrl: "https://www.right.codes",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "  " },
        },
        "/test",
      ),
    ).rejects.toThrowError(ApiError)
  })

  it("builds URL with query parameters and handles successful GET", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValueOnce(
      {
        ok: true,
        status: 200,
        body: { result: "ok" },
      } as never,
    )

    const result = await fetchRightCodeData(request, "/items", {
      query: {
        page: 1,
        active: true,
        filter: "test",
        ignored: null,
        ignored2: undefined,
      },
    })

    expect(result).toEqual({ result: "ok" })
    expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        url: "https://www.right.codes/items?page=1&active=true&filter=test",
        options: expect.objectContaining({
          method: "GET",
        }),
      }),
    )
  })

  it("sends body and sets Content-Type header on mutations", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValueOnce(
      {
        ok: true,
        status: 200,
        body: { updated: true },
      } as never,
    )

    const body = { name: "new-name" }
    const result = await fetchRightCodeData(request, "/items/1", {
      method: "PATCH",
      body,
    })

    expect(result).toEqual({ updated: true })
    const call = atIndex(
      vi.mocked(requestExecution.fetchPreparedJsonResponse).mock.calls,
      0,
    )
    const callArgs = atIndex(call, 1)
    expect(callArgs.options.method).toBe("PATCH")
    expect(callArgs.options.body).toBe(JSON.stringify(body))
    expect((callArgs.options.headers as Headers).get("Content-Type")).toBe(
      "application/json",
    )
  })

  it.each([
    [401, API_ERROR_CODES.HTTP_401],
    [403, API_ERROR_CODES.HTTP_403],
    [429, API_ERROR_CODES.HTTP_429],
    [500, API_ERROR_CODES.HTTP_OTHER],
  ])(
    "maps HTTP %i to error code %s on failure",
    async (status, expectedCode) => {
      vi.mocked(
        requestExecution.fetchPreparedJsonResponse,
      ).mockResolvedValueOnce({
        ok: false,
        status,
        body: { message: `failed with ${status}` },
      } as never)

      await expect(fetchRightCodeData(request, "/fail")).rejects.toMatchObject({
        statusCode: status,
        code: expectedCode,
      })
    },
  )
})
