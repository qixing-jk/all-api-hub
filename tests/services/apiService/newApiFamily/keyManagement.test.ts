import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createKeyManagementImplementation } from "~/services/apiService/newApiFamily/keyManagement"
import { AuthTypeEnum, type ApiToken } from "~/types"

const {
  commonCreateApiToken,
  commonDeleteApiToken,
  commonFetchAccountAvailableModels,
  commonFetchAccountTokens,
  commonFetchUserGroups,
  commonResolveApiTokenKey,
  commonUpdateApiToken,
  oneHubFetchAccountAvailableModels,
  oneHubFetchAccountTokens,
  oneHubFetchUserGroups,
  wongResolveApiTokenKey,
} = vi.hoisted(() => ({
  commonCreateApiToken: vi.fn(),
  commonDeleteApiToken: vi.fn(),
  commonFetchAccountAvailableModels: vi.fn(),
  commonFetchAccountTokens: vi.fn(),
  commonFetchUserGroups: vi.fn(),
  commonResolveApiTokenKey: vi.fn(),
  commonUpdateApiToken: vi.fn(),
  oneHubFetchAccountAvailableModels: vi.fn(),
  oneHubFetchAccountTokens: vi.fn(),
  oneHubFetchUserGroups: vi.fn(),
  wongResolveApiTokenKey: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  createApiToken: commonCreateApiToken,
  deleteApiToken: commonDeleteApiToken,
  fetchAccountAvailableModels: commonFetchAccountAvailableModels,
  fetchAccountTokens: commonFetchAccountTokens,
  fetchUserGroups: commonFetchUserGroups,
  resolveApiTokenKey: commonResolveApiTokenKey,
  updateApiToken: commonUpdateApiToken,
}))

vi.mock("~/services/apiService/oneHub", () => ({
  fetchAccountAvailableModels: oneHubFetchAccountAvailableModels,
  fetchAccountTokens: oneHubFetchAccountTokens,
  fetchUserGroups: oneHubFetchUserGroups,
}))

vi.mock("~/services/apiService/wong", () => ({
  resolveApiTokenKey: wongResolveApiTokenKey,
}))

describe("newApiFamily keyManagement", () => {
  const request = {
    baseUrl: "https://api.example.invalid",
    accountId: "account-1",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: "access-token",
      userId: "user-1",
    },
  }

  const token: ApiToken = {
    id: 123,
    user_id: 1,
    key: "sk-abcd************wxyz",
    status: 1,
    name: "Example token",
    created_time: 0,
    accessed_time: 0,
    expired_time: -1,
    remain_quota: 500000,
    unlimited_quota: false,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: "",
    used_quota: 0,
    group: "",
  }
  const tokenKeyReference: Pick<ApiToken, "id" | "key"> = {
    id: token.id,
    key: token.key,
  }

  const tokenData = {
    name: "Example token",
    remain_quota: 500000,
    expired_time: -1,
    unlimited_quota: false,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: "",
    group: "",
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses common-compatible key-management helpers by default for New API", async () => {
    const keyManagement = createKeyManagementImplementation(SITE_TYPES.NEW_API)

    commonFetchAccountTokens.mockResolvedValue([token])
    commonCreateApiToken.mockResolvedValue(true)
    commonUpdateApiToken.mockResolvedValue(true)
    commonResolveApiTokenKey.mockResolvedValue("sk-resolved")
    commonDeleteApiToken.mockResolvedValue(true)
    commonFetchUserGroups.mockResolvedValue({ default: { desc: "", ratio: 1 } })
    commonFetchAccountAvailableModels.mockResolvedValue(["gpt-4o"])

    await expect(
      keyManagement.fetchAccountTokens(request, 2, 25),
    ).resolves.toEqual([token])
    await expect(
      keyManagement.createApiToken(request, tokenData),
    ).resolves.toBe(true)
    await expect(
      keyManagement.updateApiToken(request, token.id, tokenData),
    ).resolves.toBe(true)
    await expect(
      keyManagement.resolveApiTokenKey(request, tokenKeyReference),
    ).resolves.toBe("sk-resolved")
    await expect(keyManagement.deleteApiToken(request, token.id)).resolves.toBe(
      true,
    )
    await expect(keyManagement.fetchUserGroups(request)).resolves.toEqual({
      default: { desc: "", ratio: 1 },
    })
    await expect(
      keyManagement.fetchAccountAvailableModels(request),
    ).resolves.toEqual(["gpt-4o"])

    expect(commonFetchAccountTokens).toHaveBeenCalledWith(request, 2, 25)
    expect(commonCreateApiToken).toHaveBeenCalledWith(request, tokenData)
    expect(commonUpdateApiToken).toHaveBeenCalledWith(
      request,
      token.id,
      tokenData,
    )
    expect(commonResolveApiTokenKey).toHaveBeenCalledWith(
      request,
      tokenKeyReference,
    )
    expect(commonDeleteApiToken).toHaveBeenCalledWith(request, token.id)
    expect(commonFetchUserGroups).toHaveBeenCalledWith(request)
    expect(commonFetchAccountAvailableModels).toHaveBeenCalledWith(request)
  })

  it.each([SITE_TYPES.ONE_HUB, SITE_TYPES.DONE_HUB])(
    "uses OneHub-family helpers for %s token list, groups, and models",
    async (siteType) => {
      const keyManagement = createKeyManagementImplementation(siteType)

      oneHubFetchAccountTokens.mockResolvedValue([token])
      oneHubFetchUserGroups.mockResolvedValue({
        default: { desc: "", ratio: 1 },
      })
      oneHubFetchAccountAvailableModels.mockResolvedValue(["gpt-4o"])

      await expect(
        keyManagement.fetchAccountTokens(request, 4, 10),
      ).resolves.toEqual([token])
      await expect(keyManagement.fetchUserGroups(request)).resolves.toEqual({
        default: { desc: "", ratio: 1 },
      })
      await expect(
        keyManagement.fetchAccountAvailableModels(request),
      ).resolves.toEqual(["gpt-4o"])

      expect(oneHubFetchAccountTokens).toHaveBeenCalledWith(request, 4, 10)
      expect(oneHubFetchUserGroups).toHaveBeenCalledWith(request)
      expect(oneHubFetchAccountAvailableModels).toHaveBeenCalledWith(request)
      expect(commonFetchAccountTokens).not.toHaveBeenCalled()
      expect(commonFetchUserGroups).not.toHaveBeenCalled()
      expect(commonFetchAccountAvailableModels).not.toHaveBeenCalled()
    },
  )

  it("uses the Wong key resolver while keeping token listing common-compatible", async () => {
    const keyManagement = createKeyManagementImplementation(
      SITE_TYPES.WONG_GONGYI,
    )

    wongResolveApiTokenKey.mockResolvedValue("sk-wong-resolved")
    commonFetchAccountTokens.mockResolvedValue([token])

    await expect(
      keyManagement.resolveApiTokenKey(request, tokenKeyReference),
    ).resolves.toBe("sk-wong-resolved")
    await expect(keyManagement.fetchAccountTokens(request)).resolves.toEqual([
      token,
    ])

    expect(wongResolveApiTokenKey).toHaveBeenCalledWith(
      request,
      tokenKeyReference,
    )
    expect(commonResolveApiTokenKey).not.toHaveBeenCalled()
    expect(commonFetchAccountTokens).toHaveBeenCalledWith(request, 0, 100)
    expect(oneHubFetchAccountTokens).not.toHaveBeenCalled()
  })
})
