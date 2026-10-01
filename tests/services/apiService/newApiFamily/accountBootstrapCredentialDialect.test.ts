import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearNewApiAccessTokenDialectsForTests,
  NEW_API_SCOPED_ACCESS_TOKENS_ENDPOINT,
} from "~/services/apiService/newApiFamily/default/accessTokenDialect"
import { getOrCreateAccessToken } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

const { mockFetchApiData } = vi.hoisted(() => ({
  mockFetchApiData: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: {
    data: mockFetchApiData,
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}))

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string) => key),
}))

const baseUrl = "https://credential.example.invalid"

const request = {
  baseUrl,
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "1",
    accessToken: "dashboard-token",
  },
}

/** First call of every flow: the account as the deployment reports it. */
const accountWithoutToken = { id: 1, username: "alice", access_token: "" }
const scopedListAnswer = { items: [], legacy: null }
const verifiedAccount = { id: 1, username: "alice" }

const statusError = (
  statusCode: number,
  endpoint: string,
  upstreamCode?: string,
) =>
  new ApiError(
    `HTTP ${statusCode}`,
    statusCode,
    endpoint,
    undefined,
    upstreamCode,
  )

describe("New API account credential dialect", () => {
  beforeEach(() => {
    mockFetchApiData.mockReset()
    clearNewApiAccessTokenDialectsForTests()
  })

  it("reports the security check a scoped deployment demands", async () => {
    mockFetchApiData
      .mockResolvedValueOnce(accountWithoutToken)
      .mockResolvedValueOnce(scopedListAnswer)

    await expect(getOrCreateAccessToken(request)).rejects.toMatchObject({
      name: "ApiError",
      code: API_ERROR_CODES.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      endpoint: NEW_API_SCOPED_ACCESS_TOKENS_ENDPOINT,
    })

    // The deployment refuses token creation to this caller by construction, so
    // the flow reports that instead of spending a request on the attempt.
    expect(mockFetchApiData).toHaveBeenCalledTimes(2)
  })

  it("keeps rotating the dashboard token on a deployment without those routes", async () => {
    mockFetchApiData
      .mockResolvedValueOnce(accountWithoutToken)
      .mockRejectedValueOnce(
        statusError(404, NEW_API_SCOPED_ACCESS_TOKENS_ENDPOINT),
      )
      .mockResolvedValueOnce("generated-token")
      .mockResolvedValueOnce(verifiedAccount)

    await expect(getOrCreateAccessToken(request)).resolves.toEqual({
      username: "alice",
      access_token: "generated-token",
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(3, request, {
      endpoint: "/api/user/token",
      currentTabTransport: "disabled",
      tempWindowFallback: { statusCodes: [], codes: [] },
    })
  })

  it("does not replay the rotating call after a transport failure", async () => {
    const transportFailure = new Error("network down")
    mockFetchApiData
      .mockResolvedValueOnce(accountWithoutToken)
      .mockRejectedValueOnce(
        statusError(404, NEW_API_SCOPED_ACCESS_TOKENS_ENDPOINT),
      )
      .mockRejectedValueOnce(transportFailure)

    await expect(getOrCreateAccessToken(request)).rejects.toBe(transportFailure)

    // One probe, one rotation attempt, and no second attempt of a call that may
    // already have rotated the account's credential.
    expect(mockFetchApiData).toHaveBeenCalledTimes(3)
  })

  it("does not replay the rotating call when it is refused for a security proof", async () => {
    const proofRequired = statusError(
      403,
      "/api/user/token",
      "SECURITY_PROOF_REQUIRED",
    )
    mockFetchApiData
      .mockResolvedValueOnce(accountWithoutToken)
      .mockRejectedValueOnce(
        statusError(404, NEW_API_SCOPED_ACCESS_TOKENS_ENDPOINT),
      )
      .mockRejectedValueOnce(proofRequired)

    await expect(getOrCreateAccessToken(request)).rejects.toBe(proofRequired)

    // The route exists and refused this attempt, so the contract did not change
    // and the rotating call is not sent again.
    expect(mockFetchApiData).toHaveBeenCalledTimes(3)
  })

  it("asks a deployment again when its remembered contract stopped answering", async () => {
    mockFetchApiData
      // First account: the deployment answers as an older build.
      .mockResolvedValueOnce(accountWithoutToken)
      .mockRejectedValueOnce(
        statusError(404, NEW_API_SCOPED_ACCESS_TOKENS_ENDPOINT),
      )
      .mockResolvedValueOnce("generated-token")
      .mockResolvedValueOnce(verifiedAccount)
      // Second account on the same deployment, now upgraded: the remembered
      // build answers the removed route instead of the rotating one.
      .mockResolvedValueOnce(accountWithoutToken)
      .mockRejectedValueOnce(
        statusError(403, "/api/user/token", "AUTH_INSUFFICIENT_PRIVILEGE"),
      )
      .mockResolvedValueOnce(scopedListAnswer)

    await expect(getOrCreateAccessToken(request)).resolves.toEqual({
      username: "alice",
      access_token: "generated-token",
    })
    await expect(getOrCreateAccessToken(request)).rejects.toMatchObject({
      code: API_ERROR_CODES.ACCESS_TOKEN_VERIFICATION_REQUIRED,
    })

    // Reused the remembered build, then asked again and switched: account,
    // rotation, re-probe.
    expect(mockFetchApiData).toHaveBeenCalledTimes(7)
  })
})
