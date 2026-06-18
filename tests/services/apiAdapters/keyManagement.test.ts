import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { aihubmixKeyManagement } from "~/services/apiAdapters/aihubmix/keyManagement"
import { createNewApiKeyManagement } from "~/services/apiAdapters/newApi/keyManagement"
import { sub2ApiKeyManagement } from "~/services/apiAdapters/sub2api/keyManagement"
import { AuthTypeEnum, type ApiToken } from "~/types"

const {
  mockAihubmixCreateApiToken,
  mockAihubmixFetchAccountTokens,
  mockAihubmixResolveApiTokenKey,
  mockCreateApiToken,
  mockFetchAccountTokens,
  mockGetApiService,
  mockResolveApiTokenKey,
  mockSub2ApiCreateApiToken,
  mockSub2ApiFetchAccountTokens,
  mockSub2ApiResolveApiTokenKey,
} = vi.hoisted(() => ({
  mockAihubmixCreateApiToken: vi.fn(),
  mockAihubmixFetchAccountTokens: vi.fn(),
  mockAihubmixResolveApiTokenKey: vi.fn(),
  mockCreateApiToken: vi.fn(),
  mockFetchAccountTokens: vi.fn(),
  mockGetApiService: vi.fn(),
  mockResolveApiTokenKey: vi.fn(),
  mockSub2ApiCreateApiToken: vi.fn(),
  mockSub2ApiFetchAccountTokens: vi.fn(),
  mockSub2ApiResolveApiTokenKey: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
}))

vi.mock("~/services/apiService/sub2api", () => ({
  createApiToken: mockSub2ApiCreateApiToken,
  fetchAccountTokens: mockSub2ApiFetchAccountTokens,
  resolveApiTokenKey: mockSub2ApiResolveApiTokenKey,
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  createApiToken: mockAihubmixCreateApiToken,
  fetchAccountTokens: mockAihubmixFetchAccountTokens,
  resolveApiTokenKey: mockAihubmixResolveApiTokenKey,
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

describe("apiAdapter keyManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiService.mockReturnValue({
      createApiToken: mockCreateApiToken,
      fetchAccountTokens: mockFetchAccountTokens,
      resolveApiTokenKey: mockResolveApiTokenKey,
    })
  })

  it("delegates New API-family key operations through the site-specific apiService", async () => {
    const expectedTokens = [token]
    mockFetchAccountTokens.mockResolvedValueOnce(expectedTokens)
    mockCreateApiToken.mockResolvedValueOnce(true)
    mockResolveApiTokenKey.mockResolvedValueOnce("sk-real")

    const keyManagement = createNewApiKeyManagement(SITE_TYPES.ONE_HUB)

    expect(mockGetApiService).not.toHaveBeenCalled()

    await expect(
      keyManagement.fetchTokens(request, { page: 2, size: 25 }),
    ).resolves.toBe(expectedTokens)
    await expect(keyManagement.createToken(request, tokenData)).resolves.toBe(
      true,
    )
    await expect(
      keyManagement.resolveTokenKey({ request, token }),
    ).resolves.toBe("sk-real")

    expect(mockGetApiService).toHaveBeenCalledWith(SITE_TYPES.ONE_HUB)
    expect(mockFetchAccountTokens).toHaveBeenCalledWith(request, 2, 25)
    expect(mockCreateApiToken).toHaveBeenCalledWith(request, tokenData)
    expect(mockResolveApiTokenKey).toHaveBeenCalledWith(request, token)
  })

  it("delegates Sub2API key operations to backend key helpers", async () => {
    const expectedTokens = [token]
    mockSub2ApiFetchAccountTokens.mockResolvedValueOnce(expectedTokens)
    mockSub2ApiCreateApiToken.mockResolvedValueOnce(token)
    mockSub2ApiResolveApiTokenKey.mockResolvedValueOnce("sk-sub2api")

    await expect(
      sub2ApiKeyManagement.fetchTokens(request, { page: 3, size: 50 }),
    ).resolves.toBe(expectedTokens)
    await expect(
      sub2ApiKeyManagement.createToken(request, tokenData),
    ).resolves.toBe(token)
    await expect(
      sub2ApiKeyManagement.resolveTokenKey({ request, token }),
    ).resolves.toBe("sk-sub2api")

    expect(mockSub2ApiFetchAccountTokens).toHaveBeenCalledWith(request, 3, 50)
    expect(mockSub2ApiCreateApiToken).toHaveBeenCalledWith(request, tokenData)
    expect(mockSub2ApiResolveApiTokenKey).toHaveBeenCalledWith(request, token)
  })

  it("delegates AIHubMix key operations while preserving fetch option behavior", async () => {
    const expectedTokens = [token]
    mockAihubmixFetchAccountTokens.mockResolvedValueOnce(expectedTokens)
    mockAihubmixCreateApiToken.mockResolvedValueOnce(token)
    mockAihubmixResolveApiTokenKey.mockResolvedValueOnce("aihubmix-secret")

    await expect(
      aihubmixKeyManagement.fetchTokens(request, { page: 4, size: 10 }),
    ).resolves.toBe(expectedTokens)
    await expect(
      aihubmixKeyManagement.createToken(request, tokenData),
    ).resolves.toBe(token)
    await expect(
      aihubmixKeyManagement.resolveTokenKey({ request, token }),
    ).resolves.toBe("aihubmix-secret")

    expect(mockAihubmixFetchAccountTokens).toHaveBeenCalledWith(request)
    expect(mockAihubmixCreateApiToken).toHaveBeenCalledWith(request, tokenData)
    expect(mockAihubmixResolveApiTokenKey).toHaveBeenCalledWith(request, token)
  })
})
