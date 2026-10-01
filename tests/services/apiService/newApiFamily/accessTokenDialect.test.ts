import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearNewApiAccessTokenDialectsForTests,
  forgetNewApiAccessTokenDialect,
  isAccessTokenContractAbsent,
  NEW_API_ACCESS_TOKEN_DIALECTS,
  resolveNewApiAccessTokenDialect,
} from "~/services/apiService/newApiFamily/default/accessTokenDialect"
import { ApiError } from "~/services/apiTransport/errors"
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

const { SCOPED_ACCESS_TOKENS, DASHBOARD_PAT } = NEW_API_ACCESS_TOKEN_DIALECTS

const baseUrl = "https://dialect.example.invalid"

const request = {
  baseUrl,
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "1",
    accessToken: "dashboard-token",
  },
}

const statusError = (statusCode: number, upstreamCode?: string) =>
  new ApiError(
    `HTTP ${statusCode}`,
    statusCode,
    "/api/user/access_tokens",
    undefined,
    upstreamCode,
  )

describe("New API access token dialect", () => {
  beforeEach(() => {
    mockFetchApiData.mockReset()
    clearNewApiAccessTokenDialectsForTests()
  })

  it("reads the scoped contract from the deployment that answers the list endpoint", async () => {
    mockFetchApiData.mockResolvedValueOnce({ items: [], legacy: null })

    await expect(resolveNewApiAccessTokenDialect(request)).resolves.toBe(
      SCOPED_ACCESS_TOKENS,
    )
    expect(mockFetchApiData).toHaveBeenCalledWith(request, {
      endpoint: "/api/user/access_tokens",
    })
  })

  it("reads the dashboard-PAT contract from a deployment without the route", async () => {
    mockFetchApiData.mockRejectedValueOnce(statusError(404))

    await expect(resolveNewApiAccessTokenDialect(request)).resolves.toBe(
      DASHBOARD_PAT,
    )
  })

  it("reads a 405 refusal as the older contract too", async () => {
    mockFetchApiData.mockRejectedValueOnce(statusError(405))

    await expect(resolveNewApiAccessTokenDialect(request)).resolves.toBe(
      DASHBOARD_PAT,
    )
  })

  it("remembers the deployment's answer instead of asking twice", async () => {
    mockFetchApiData.mockResolvedValueOnce({ items: [], legacy: null })

    await resolveNewApiAccessTokenDialect(request)
    await resolveNewApiAccessTokenDialect(request)

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
  })

  it("shares one memory across spellings of the same deployment", async () => {
    mockFetchApiData.mockResolvedValueOnce({ items: [], legacy: null })

    await resolveNewApiAccessTokenDialect(request)
    await expect(
      resolveNewApiAccessTokenDialect({
        ...request,
        baseUrl: `${baseUrl}/`,
      }),
    ).resolves.toBe(SCOPED_ACCESS_TOKENS)
    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
  })

  it("keeps one deployment's answer out of another's", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({ items: [], legacy: null })
      .mockRejectedValueOnce(statusError(404))

    await expect(resolveNewApiAccessTokenDialect(request)).resolves.toBe(
      SCOPED_ACCESS_TOKENS,
    )
    await expect(
      resolveNewApiAccessTokenDialect({
        ...request,
        baseUrl: "https://other.example.invalid",
      }),
    ).resolves.toBe(DASHBOARD_PAT)
  })

  it("probes again after the remembered answer is forgotten", async () => {
    mockFetchApiData
      .mockRejectedValueOnce(statusError(404))
      .mockResolvedValueOnce({ items: [], legacy: null })

    await expect(resolveNewApiAccessTokenDialect(request)).resolves.toBe(
      DASHBOARD_PAT,
    )

    forgetNewApiAccessTokenDialect(baseUrl)

    await expect(resolveNewApiAccessTokenDialect(request)).resolves.toBe(
      SCOPED_ACCESS_TOKENS,
    )
  })

  it.each([
    ["an unauthorized probe", statusError(401)],
    ["a refused probe", statusError(403)],
    ["a server failure", statusError(500)],
    ["a transport failure", new Error("network down")],
  ])(
    "keeps the current contract without remembering %s",
    async (_label, error) => {
      mockFetchApiData
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ items: [], legacy: null })

      await expect(resolveNewApiAccessTokenDialect(request)).resolves.toBe(
        DASHBOARD_PAT,
      )

      // Nothing was remembered, so the next resolution asks the deployment again.
      await expect(resolveNewApiAccessTokenDialect(request)).resolves.toBe(
        SCOPED_ACCESS_TOKENS,
      )
      expect(mockFetchApiData).toHaveBeenCalledTimes(2)
    },
  )
})

describe("isAccessTokenContractAbsent", () => {
  it.each([
    ["a missing route", statusError(404), true],
    ["a method refusal", statusError(405), true],
    [
      "the route another New API path answers instead",
      statusError(403, "AUTH_INSUFFICIENT_PRIVILEGE"),
      true,
    ],
    [
      "a security-proof rejection of a route that exists",
      statusError(403, "SECURITY_PROOF_REQUIRED"),
      false,
    ],
    ["an unauthorized answer", statusError(401), false],
    ["a server failure", statusError(500), false],
    ["a transport failure", new Error("network down"), false],
  ])("reads %s as %s", (_label, error, expected) => {
    expect(isAccessTokenContractAbsent(error)).toBe(expected)
  })
})
