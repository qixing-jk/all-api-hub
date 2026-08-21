import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchAccountAvailableModels,
  fetchUserGroups,
} from "~/services/apiService/newApiFamily/variants/vApi"
import { ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

const { fetchApiDataMock, fetchLegacyAccountAvailableModelsMock } = vi.hoisted(
  () => ({
    fetchApiDataMock: vi.fn(),
    fetchLegacyAccountAvailableModelsMock: vi.fn(),
  }),
)

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiData: fetchApiDataMock,
}))

vi.mock("~/services/apiService/newApiFamily/default/keyManagement", () => ({
  fetchAccountAvailableModels: fetchLegacyAccountAvailableModelsMock,
}))

const request = {
  baseUrl: "https://v-api.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "access-token",
    userId: "user-1",
  },
}

describe("V-API key management transport", () => {
  beforeEach(() => {
    fetchApiDataMock.mockReset()
    fetchLegacyAccountAvailableModelsMock.mockReset()
  })

  it("uses the current account-available-model endpoint", async () => {
    const models = ["example-model"]
    fetchApiDataMock.mockResolvedValueOnce(models)

    await expect(fetchAccountAvailableModels(request)).resolves.toBe(models)
    expect(fetchApiDataMock).toHaveBeenCalledWith(request, {
      endpoint: "/api/user/available_models",
    })
    expect(fetchLegacyAccountAvailableModelsMock).not.toHaveBeenCalled()
  })

  it.each([404, 405])(
    "keeps the legacy model endpoint as a compatibility fallback for HTTP %i",
    async (statusCode) => {
      const currentEndpointError = new ApiError(
        "current endpoint unavailable",
        statusCode,
      )
      const models = ["legacy-model"]
      fetchApiDataMock.mockRejectedValueOnce(currentEndpointError)
      fetchLegacyAccountAvailableModelsMock.mockResolvedValueOnce(models)

      await expect(fetchAccountAvailableModels(request)).resolves.toBe(models)
      expect(fetchLegacyAccountAvailableModelsMock).toHaveBeenCalledWith(
        request,
      )
    },
  )

  it.each([401, 403, 429, 500])(
    "does not hide HTTP %i from the current model endpoint behind a legacy request",
    async (statusCode) => {
      const currentEndpointError = new ApiError(
        "current endpoint unavailable",
        statusCode,
      )
      fetchApiDataMock.mockRejectedValueOnce(currentEndpointError)

      await expect(fetchAccountAvailableModels(request)).rejects.toBe(
        currentEndpointError,
      )
      expect(fetchLegacyAccountAvailableModelsMock).not.toHaveBeenCalled()
    },
  )

  it("does not fall back for transport errors without an HTTP status", async () => {
    const currentEndpointError = new Error("network unavailable")
    fetchApiDataMock.mockRejectedValueOnce(currentEndpointError)

    await expect(fetchAccountAvailableModels(request)).rejects.toBe(
      currentEndpointError,
    )
    expect(fetchLegacyAccountAvailableModelsMock).not.toHaveBeenCalled()
  })

  it("preserves the current endpoint error when its compatibility fallback fails", async () => {
    const currentEndpointError = new ApiError(
      "current endpoint unavailable",
      404,
    )
    fetchApiDataMock.mockRejectedValueOnce(currentEndpointError)
    fetchLegacyAccountAvailableModelsMock.mockRejectedValueOnce(
      new Error("legacy endpoint unavailable"),
    )

    await expect(fetchAccountAvailableModels(request)).rejects.toBe(
      currentEndpointError,
    )
  })

  it("normalizes current V-API string-valued user groups", async () => {
    fetchApiDataMock.mockResolvedValueOnce({
      default: "General route=x 1倍",
      secondary: "Secondary route=x 1.25倍",
    })

    await expect(fetchUserGroups(request)).resolves.toEqual({
      default: { desc: "General route", ratio: 1 },
      secondary: { desc: "Secondary route", ratio: 1.25 },
    })
    expect(fetchApiDataMock).toHaveBeenCalledWith(request, {
      endpoint: "/api/user/self/groups",
    })
  })

  it("preserves legacy object-valued user groups", async () => {
    const groups = {
      default: { desc: "General route", ratio: 1 },
    }
    fetchApiDataMock.mockResolvedValueOnce(groups)

    await expect(fetchUserGroups(request)).resolves.toEqual(groups)
  })
})
