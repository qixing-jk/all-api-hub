import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  quotaToUsd,
  RELAYFOR_ENDPOINTS,
  RELAYFOR_QUOTA_PER_USD,
  usdToQuota,
} from "~/services/apiService/relayfor/constants"
import {
  fetchRelayForData,
  isRelayForAuthFailureError,
} from "~/services/apiService/relayfor/transport"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import * as requestExecution from "~/services/apiTransport/requestExecution"
import { AuthTypeEnum } from "~/types"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

vi.mock("~/services/apiTransport/requestExecution", () => ({
  fetchPreparedJsonResponse: vi.fn(),
}))

const request = {
  baseUrl: "https://relayfor.xyz",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "test-token" },
}

describe("relayfor transport and constants", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("builds dynamic endpoint URLs and provides correct currency conversion", () => {
    expect(RELAYFOR_ENDPOINTS.self).toBe("/api/user/self")
    expect(RELAYFOR_ENDPOINTS.overview).toBe("/api/user/overview")
    expect(RELAYFOR_ENDPOINTS.tokens).toBe("/api/user/tokens")
    expect(RELAYFOR_ENDPOINTS.tokenDetail(123)).toBe("/api/user/tokens/123")
    expect(RELAYFOR_ENDPOINTS.tokenRotate(123)).toBe(
      "/api/user/tokens/123/rotate",
    )
    expect(RELAYFOR_ENDPOINTS.models).toBe("/api/user/models")
    expect(RELAYFOR_ENDPOINTS.checkinCampaigns).toBe(
      "/api/user/checkin-campaigns",
    )
    expect(RELAYFOR_ENDPOINTS.checkinClaim(5)).toBe(
      "/api/user/checkin-campaigns/5/claim",
    )
    expect(RELAYFOR_ENDPOINTS.announcement).toBe("/api/site/announcement")

    expect(RELAYFOR_QUOTA_PER_USD).toBe(500000)
    expect(quotaToUsd(500000)).toBe(1)
    expect(quotaToUsd(250000)).toBe(0.5)
    expect(usdToQuota(1)).toBe(500000)
    expect(usdToQuota(2.5)).toBe(1250000)
  })

  it("identifies 401 ApiError as auth failure", () => {
    expect(
      isRelayForAuthFailureError(
        new ApiError("unauth", 401, "/api/user/self", API_ERROR_CODES.HTTP_401),
      ),
    ).toBe(true)
    expect(
      isRelayForAuthFailureError(
        new ApiError(
          "forbidden",
          403,
          "/api/user/self",
          API_ERROR_CODES.HTTP_403,
        ),
      ),
    ).toBe(false)
    expect(isRelayForAuthFailureError(new Error("generic"))).toBe(false)
  })

  it("throws 401 ApiError immediately when access token is missing", async () => {
    await expect(
      fetchRelayForData(
        {
          baseUrl: "https://relayfor.xyz",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "  " },
        },
        "/api/user/self",
      ),
    ).rejects.toThrowError(ApiError)
  })

  it("builds URL with query parameters and handles successful GET", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValueOnce(
      {
        ok: true,
        status: 200,
        body: { id: 1, username: "relayuser" },
      } as never,
    )

    const result = await fetchRelayForData(request, "/api/user/self", {
      query: {
        page: 1,
        active: true,
        ignored: null,
        ignored2: undefined,
      },
    })

    expect(result).toEqual({ id: 1, username: "relayuser" })
    expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        url: "https://relayfor.xyz/api/user/self?page=1&active=true",
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
        body: { id: 1, name: "new-key" },
      } as never,
    )

    await fetchRelayForData(request, "/api/user/tokens", {
      method: "POST",
      body: { name: "new-key", remain_quota: 500000 },
    })

    const callArgs = atIndex(
      vi.mocked(requestExecution.fetchPreparedJsonResponse).mock.calls,
      0,
    )
    const options = atIndex(callArgs, 1).options
    expect(options.method).toBe("POST")
    expect(options.body).toBe(
      JSON.stringify({ name: "new-key", remain_quota: 500000 }),
    )
    const headers = options.headers as Headers
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(headers.get("Authorization")).toBe("Bearer test-token")
  })

  it("throws ApiError with decoded message on non-ok response", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValueOnce(
      {
        ok: false,
        status: 400,
        body: { error: { message: "Quota exceeded", type: "quota_error" } },
      } as never,
    )

    await expect(
      fetchRelayForData(request, "/api/user/tokens", { method: "POST" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("Quota exceeded"),
    })
  })
})
