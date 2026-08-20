import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchAccountAvailableModels } from "~/services/apiService/newApiFamily/variants/vApi"
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

  it("keeps the legacy model endpoint as a compatibility fallback", async () => {
    const currentEndpointError = new Error("current endpoint unavailable")
    const models = ["legacy-model"]
    fetchApiDataMock.mockRejectedValueOnce(currentEndpointError)
    fetchLegacyAccountAvailableModelsMock.mockResolvedValueOnce(models)

    await expect(fetchAccountAvailableModels(request)).resolves.toBe(models)
    expect(fetchLegacyAccountAvailableModelsMock).toHaveBeenCalledWith(request)
  })

  it("preserves the current endpoint error when both generations fail", async () => {
    const currentEndpointError = new Error("current endpoint unavailable")
    fetchApiDataMock.mockRejectedValueOnce(currentEndpointError)
    fetchLegacyAccountAvailableModelsMock.mockRejectedValueOnce(
      new Error("legacy endpoint unavailable"),
    )

    await expect(fetchAccountAvailableModels(request)).rejects.toBe(
      currentEndpointError,
    )
  })
})
