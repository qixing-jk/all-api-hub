import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { aihubmixKeyManagement } from "~/services/apiAdapters/aihubmix/keyManagement"
import { createNewApiKeyManagement } from "~/services/apiAdapters/newApi/keyManagement"
import { sub2ApiKeyManagement } from "~/services/apiAdapters/sub2api/keyManagement"
import { voApiV2KeyManagement } from "~/services/apiAdapters/voapiV2/keyManagement"
import { AuthTypeEnum, type ApiToken } from "~/types"

const {
  mockAihubmixCreateApiToken,
  mockAihubmixDeleteApiToken,
  mockAihubmixFetchAccountAvailableModels,
  mockAihubmixFetchAccountTokens,
  mockAihubmixResolveApiTokenKey,
  mockAihubmixUpdateApiToken,
  mockCreateApiToken,
  mockDeleteApiToken,
  mockFetchAccountAvailableModels,
  mockFetchAccountTokens,
  mockFetchUserGroups,
  mockOneHubFetchAccountAvailableModels,
  mockOneHubFetchAccountTokens,
  mockOneHubFetchUserGroups,
  mockResolveApiTokenKey,
  mockSub2ApiCreateApiToken,
  mockSub2ApiDeleteApiToken,
  mockSub2ApiFetchAccountAvailableModels,
  mockSub2ApiFetchAccountTokens,
  mockSub2ApiFetchUserGroups,
  mockSub2ApiResolveApiTokenKey,
  mockSub2ApiUpdateApiToken,
  mockUpdateApiToken,
  mockVoApiV2CreateToken,
  mockVoApiV2DeleteToken,
  mockVoApiV2FetchAvailableModels,
  mockVoApiV2FetchTokens,
  mockVoApiV2FetchUserGroups,
  mockVoApiV2ResolveTokenKey,
  mockVoApiV2UpdateToken,
  mockWongResolveApiTokenKey,
} = vi.hoisted(() => ({
  mockAihubmixCreateApiToken: vi.fn(),
  mockAihubmixDeleteApiToken: vi.fn(),
  mockAihubmixFetchAccountAvailableModels: vi.fn(),
  mockAihubmixFetchAccountTokens: vi.fn(),
  mockAihubmixResolveApiTokenKey: vi.fn(),
  mockAihubmixUpdateApiToken: vi.fn(),
  mockCreateApiToken: vi.fn(),
  mockDeleteApiToken: vi.fn(),
  mockFetchAccountAvailableModels: vi.fn(),
  mockFetchAccountTokens: vi.fn(),
  mockFetchUserGroups: vi.fn(),
  mockOneHubFetchAccountAvailableModels: vi.fn(),
  mockOneHubFetchAccountTokens: vi.fn(),
  mockOneHubFetchUserGroups: vi.fn(),
  mockResolveApiTokenKey: vi.fn(),
  mockSub2ApiCreateApiToken: vi.fn(),
  mockSub2ApiDeleteApiToken: vi.fn(),
  mockSub2ApiFetchAccountAvailableModels: vi.fn(),
  mockSub2ApiFetchAccountTokens: vi.fn(),
  mockSub2ApiFetchUserGroups: vi.fn(),
  mockSub2ApiResolveApiTokenKey: vi.fn(),
  mockSub2ApiUpdateApiToken: vi.fn(),
  mockUpdateApiToken: vi.fn(),
  mockVoApiV2CreateToken: vi.fn(),
  mockVoApiV2DeleteToken: vi.fn(),
  mockVoApiV2FetchAvailableModels: vi.fn(),
  mockVoApiV2FetchTokens: vi.fn(),
  mockVoApiV2FetchUserGroups: vi.fn(),
  mockVoApiV2ResolveTokenKey: vi.fn(),
  mockVoApiV2UpdateToken: vi.fn(),
  mockWongResolveApiTokenKey: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/keyManagement", () => ({
  defaultKeyManagementImplementation: {
    createApiToken: mockCreateApiToken,
    deleteApiToken: mockDeleteApiToken,
    fetchAccountAvailableModels: mockFetchAccountAvailableModels,
    fetchAccountTokens: mockFetchAccountTokens,
    fetchUserGroups: mockFetchUserGroups,
    resolveApiTokenKey: mockResolveApiTokenKey,
    updateApiToken: mockUpdateApiToken,
  },
}))

vi.mock("~/services/apiService/sub2api", () => ({
  createApiToken: mockSub2ApiCreateApiToken,
  deleteApiToken: mockSub2ApiDeleteApiToken,
  fetchAccountAvailableModels: mockSub2ApiFetchAccountAvailableModels,
  fetchAccountTokens: mockSub2ApiFetchAccountTokens,
  fetchUserGroups: mockSub2ApiFetchUserGroups,
  resolveApiTokenKey: mockSub2ApiResolveApiTokenKey,
  updateApiToken: mockSub2ApiUpdateApiToken,
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  createApiToken: mockAihubmixCreateApiToken,
  deleteApiToken: mockAihubmixDeleteApiToken,
  fetchAccountAvailableModels: mockAihubmixFetchAccountAvailableModels,
  fetchAccountTokens: mockAihubmixFetchAccountTokens,
  resolveApiTokenKey: mockAihubmixResolveApiTokenKey,
  updateApiToken: mockAihubmixUpdateApiToken,
}))

vi.mock("~/services/apiService/newApiFamily/variants/oneHub", () => ({
  fetchAccountAvailableModels: mockOneHubFetchAccountAvailableModels,
  fetchAccountTokens: mockOneHubFetchAccountTokens,
  fetchUserGroups: mockOneHubFetchUserGroups,
}))

vi.mock("~/services/apiService/newApiFamily/variants/wong", () => ({
  resolveApiTokenKey: mockWongResolveApiTokenKey,
}))

vi.mock("~/services/apiService/voapiV2", () => ({
  createVoApiV2Token: mockVoApiV2CreateToken,
  deleteVoApiV2Token: mockVoApiV2DeleteToken,
  fetchVoApiV2AvailableModels: mockVoApiV2FetchAvailableModels,
  fetchVoApiV2Tokens: mockVoApiV2FetchTokens,
  fetchVoApiV2UserGroups: mockVoApiV2FetchUserGroups,
  resolveVoApiV2TokenKey: mockVoApiV2ResolveTokenKey,
  updateVoApiV2Token: mockVoApiV2UpdateToken,
}))

const request = {
  baseUrl: "https://api.example.invalid",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    token: "access-token",
  },
}

const token = {
  id: 123,
  key: "sk-...",
  name: "Example token",
} as ApiToken

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

const userGroups = {
  default: { desc: "Default", ratio: 1 },
  vip: { desc: "VIP", ratio: 2 },
}

const availableModels = ["gpt-4o-mini", "claude-3-haiku"]

describe("apiAdapter keyManagement", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("delegates New API-family key operations through the New API-family implementation", async () => {
    const expectedTokens = [token]
    mockFetchAccountTokens.mockResolvedValueOnce(expectedTokens)
    mockCreateApiToken.mockResolvedValueOnce(true)
    mockUpdateApiToken.mockResolvedValueOnce(true)
    mockResolveApiTokenKey.mockResolvedValueOnce("sk-real")
    mockDeleteApiToken.mockResolvedValueOnce(true)
    mockFetchUserGroups.mockResolvedValueOnce(userGroups)
    mockFetchAccountAvailableModels.mockResolvedValueOnce(availableModels)

    const keyManagement = createNewApiKeyManagement(SITE_TYPES.NEW_API)

    await expect(
      keyManagement.fetchTokens(request, { page: 2, size: 25 }),
    ).resolves.toBe(expectedTokens)
    await expect(keyManagement.createToken(request, tokenData)).resolves.toBe(
      true,
    )
    await expect(
      keyManagement.updateToken({
        request,
        tokenId: token.id,
        tokenData,
      }),
    ).resolves.toBe(true)
    await expect(
      keyManagement.resolveTokenKey({ request, token }),
    ).resolves.toBe("sk-real")
    await expect(
      keyManagement.deleteToken({ request, tokenId: token.id }),
    ).resolves.toBe(true)
    await expect(keyManagement.userGroups?.fetch(request)).resolves.toBe(
      userGroups,
    )
    await expect(keyManagement.fetchAvailableModels(request)).resolves.toBe(
      availableModels,
    )

    expect(mockFetchAccountTokens).toHaveBeenCalledWith(request, 2, 25)
    expect(mockCreateApiToken).toHaveBeenCalledWith(request, tokenData)
    expect(mockUpdateApiToken).toHaveBeenCalledWith(
      request,
      token.id,
      tokenData,
    )
    expect(mockResolveApiTokenKey).toHaveBeenCalledWith(request, token)
    expect(mockDeleteApiToken).toHaveBeenCalledWith(request, token.id)
    expect(mockFetchUserGroups).toHaveBeenCalledWith(request)
    expect(mockFetchAccountAvailableModels).toHaveBeenCalledWith(request)
  })

  it("uses OneHub-family key inventory overrides at the adapter layer", async () => {
    const expectedTokens = [token]
    mockOneHubFetchAccountTokens.mockResolvedValueOnce(expectedTokens)
    mockOneHubFetchUserGroups.mockResolvedValueOnce(userGroups)
    mockOneHubFetchAccountAvailableModels.mockResolvedValueOnce(availableModels)

    const keyManagement = createNewApiKeyManagement(SITE_TYPES.ONE_HUB)

    await expect(
      keyManagement.fetchTokens(request, { page: 2, size: 25 }),
    ).resolves.toBe(expectedTokens)
    await expect(keyManagement.userGroups?.fetch(request)).resolves.toBe(
      userGroups,
    )
    await expect(keyManagement.fetchAvailableModels(request)).resolves.toBe(
      availableModels,
    )

    expect(mockOneHubFetchAccountTokens).toHaveBeenCalledWith(request, 2, 25)
    expect(mockOneHubFetchUserGroups).toHaveBeenCalledWith(request)
    expect(mockOneHubFetchAccountAvailableModels).toHaveBeenCalledWith(request)
    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
    expect(mockFetchUserGroups).not.toHaveBeenCalled()
    expect(mockFetchAccountAvailableModels).not.toHaveBeenCalled()
  })

  it("uses WONG token-key resolution override at the adapter layer", async () => {
    mockWongResolveApiTokenKey.mockResolvedValueOnce("sk-wong-secret")

    const keyManagement = createNewApiKeyManagement(SITE_TYPES.WONG_GONGYI)

    await expect(
      keyManagement.resolveTokenKey({ request, token }),
    ).resolves.toBe("sk-wong-secret")

    expect(mockWongResolveApiTokenKey).toHaveBeenCalledWith(request, token)
    expect(mockResolveApiTokenKey).not.toHaveBeenCalled()
  })

  it("propagates New API-family key lifecycle errors from the implementation Module", async () => {
    const error = new Error("delete failed")
    mockDeleteApiToken.mockRejectedValueOnce(error)

    const keyManagement = createNewApiKeyManagement(SITE_TYPES.ONE_HUB)

    await expect(
      keyManagement.deleteToken({ request, tokenId: token.id }),
    ).rejects.toBe(error)
    expect(mockDeleteApiToken).toHaveBeenCalledWith(request, token.id)
  })

  it("delegates Sub2API key operations to backend key helpers", async () => {
    const expectedTokens = [token]
    mockSub2ApiFetchAccountTokens.mockResolvedValueOnce(expectedTokens)
    mockSub2ApiCreateApiToken.mockResolvedValueOnce(token)
    mockSub2ApiUpdateApiToken.mockResolvedValueOnce(true)
    mockSub2ApiResolveApiTokenKey.mockResolvedValueOnce("sk-sub2api")
    mockSub2ApiDeleteApiToken.mockResolvedValueOnce(true)
    mockSub2ApiFetchUserGroups.mockResolvedValueOnce(userGroups)
    mockSub2ApiFetchAccountAvailableModels.mockResolvedValueOnce(
      availableModels,
    )

    await expect(
      sub2ApiKeyManagement.fetchTokens(request, { page: 3, size: 50 }),
    ).resolves.toBe(expectedTokens)
    await expect(
      sub2ApiKeyManagement.createToken(request, tokenData),
    ).resolves.toBe(token)
    await expect(
      sub2ApiKeyManagement.updateToken({
        request,
        tokenId: token.id,
        tokenData,
      }),
    ).resolves.toBe(true)
    await expect(
      sub2ApiKeyManagement.resolveTokenKey({ request, token }),
    ).resolves.toBe("sk-sub2api")
    await expect(
      sub2ApiKeyManagement.deleteToken({ request, tokenId: token.id }),
    ).resolves.toBe(true)
    await expect(sub2ApiKeyManagement.userGroups?.fetch(request)).resolves.toBe(
      userGroups,
    )
    await expect(
      sub2ApiKeyManagement.fetchAvailableModels(request),
    ).resolves.toBe(availableModels)

    expect(mockSub2ApiFetchAccountTokens).toHaveBeenCalledWith(request, 3, 50)
    expect(mockSub2ApiCreateApiToken).toHaveBeenCalledWith(request, tokenData)
    expect(mockSub2ApiUpdateApiToken).toHaveBeenCalledWith(
      request,
      token.id,
      tokenData,
    )
    expect(mockSub2ApiResolveApiTokenKey).toHaveBeenCalledWith(request, token)
    expect(mockSub2ApiDeleteApiToken).toHaveBeenCalledWith(request, token.id)
    expect(mockSub2ApiFetchUserGroups).toHaveBeenCalledWith(request)
    expect(mockSub2ApiFetchAccountAvailableModels).toHaveBeenCalledWith(request)
  })

  it("delegates VoAPI v2 key operations to backend key helpers", async () => {
    const expectedTokens = [token]
    mockVoApiV2FetchTokens.mockResolvedValueOnce(expectedTokens)
    mockVoApiV2CreateToken.mockResolvedValueOnce(true)
    mockVoApiV2UpdateToken.mockResolvedValueOnce(true)
    mockVoApiV2ResolveTokenKey.mockResolvedValueOnce("sk-voapi-v2")
    mockVoApiV2DeleteToken.mockResolvedValueOnce(true)
    mockVoApiV2FetchAvailableModels.mockResolvedValueOnce(availableModels)
    mockVoApiV2FetchUserGroups.mockResolvedValueOnce(userGroups)

    await expect(
      voApiV2KeyManagement.fetchTokens(request, { page: 4, size: 40 }),
    ).resolves.toBe(expectedTokens)
    await expect(
      voApiV2KeyManagement.createToken(request, tokenData),
    ).resolves.toBe(true)
    await expect(
      voApiV2KeyManagement.updateToken({
        request,
        tokenId: token.id,
        tokenData,
      }),
    ).resolves.toBe(true)
    await expect(
      voApiV2KeyManagement.resolveTokenKey({ request, token }),
    ).resolves.toBe("sk-voapi-v2")
    await expect(
      voApiV2KeyManagement.deleteToken({ request, tokenId: token.id }),
    ).resolves.toBe(true)
    await expect(
      voApiV2KeyManagement.fetchAvailableModels(request),
    ).resolves.toBe(availableModels)
    await expect(voApiV2KeyManagement.userGroups?.fetch(request)).resolves.toBe(
      userGroups,
    )

    expect(mockVoApiV2FetchTokens).toHaveBeenCalledWith(request, 4, 40)
    expect(mockVoApiV2CreateToken).toHaveBeenCalledWith(request, tokenData)
    expect(mockVoApiV2UpdateToken).toHaveBeenCalledWith(
      request,
      token.id,
      tokenData,
    )
    expect(mockVoApiV2ResolveTokenKey).toHaveBeenCalledWith(request, token)
    expect(mockVoApiV2DeleteToken).toHaveBeenCalledWith(request, token.id)
    expect(mockVoApiV2FetchAvailableModels).toHaveBeenCalledWith(request)
    expect(mockVoApiV2FetchUserGroups).toHaveBeenCalledWith(request)
  })

  it("propagates Sub2API key inventory errors from backend helpers", async () => {
    const error = new Error("model inventory failed")
    mockSub2ApiFetchAccountAvailableModels.mockRejectedValueOnce(error)

    await expect(
      sub2ApiKeyManagement.fetchAvailableModels(request),
    ).rejects.toBe(error)
    expect(mockSub2ApiFetchAccountAvailableModels).toHaveBeenCalledWith(request)
  })

  it("delegates AIHubMix key operations while preserving fetch option behavior", async () => {
    const expectedTokens = [token]
    mockAihubmixFetchAccountTokens.mockResolvedValueOnce(expectedTokens)
    mockAihubmixCreateApiToken.mockResolvedValueOnce(token)
    mockAihubmixUpdateApiToken.mockResolvedValueOnce(true)
    mockAihubmixResolveApiTokenKey.mockResolvedValueOnce("aihubmix-secret")
    mockAihubmixDeleteApiToken.mockResolvedValueOnce(true)
    mockAihubmixFetchAccountAvailableModels.mockResolvedValueOnce(
      availableModels,
    )

    await expect(
      aihubmixKeyManagement.fetchTokens(request, { page: 4, size: 10 }),
    ).resolves.toBe(expectedTokens)
    await expect(
      aihubmixKeyManagement.createToken(request, tokenData),
    ).resolves.toBe(token)
    await expect(
      aihubmixKeyManagement.updateToken({
        request,
        tokenId: token.id,
        tokenData,
      }),
    ).resolves.toBe(true)
    await expect(
      aihubmixKeyManagement.resolveTokenKey({ request, token }),
    ).resolves.toBe("aihubmix-secret")
    await expect(
      aihubmixKeyManagement.deleteToken({ request, tokenId: token.id }),
    ).resolves.toBe(true)
    expect(aihubmixKeyManagement.userGroups).toBeUndefined()
    await expect(
      aihubmixKeyManagement.fetchAvailableModels(request),
    ).resolves.toBe(availableModels)

    expect(mockAihubmixFetchAccountTokens).toHaveBeenCalledWith(request)
    expect(mockAihubmixCreateApiToken).toHaveBeenCalledWith(request, tokenData)
    expect(mockAihubmixUpdateApiToken).toHaveBeenCalledWith(
      request,
      token.id,
      tokenData,
    )
    expect(mockAihubmixResolveApiTokenKey).toHaveBeenCalledWith(request, token)
    expect(mockAihubmixDeleteApiToken).toHaveBeenCalledWith(request, token.id)
    expect(mockAihubmixFetchAccountAvailableModels).toHaveBeenCalledWith(
      request,
    )
  })
})
