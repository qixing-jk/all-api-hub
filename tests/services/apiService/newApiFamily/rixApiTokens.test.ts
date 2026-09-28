import { beforeEach, describe, expect, it, vi } from "vitest"

import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import { clearRixApiDialectChoicesForTests } from "~/services/apiService/newApiFamily/variants/rixApiDialects"
import {
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchCurrentUserGroup,
  fetchTokenById,
  fetchUserGroups,
  resolveApiTokenKey,
} from "~/services/apiService/newApiFamily/variants/rixApiTokens"
import { AuthTypeEnum } from "~/types"

const {
  mockData,
  mockDefaultFetchAccountTokens,
  mockDefaultFetchAvailableModels,
  mockDefaultFetchTokenById,
  mockDefaultFetchUserGroups,
  mockRevealFetch,
} = vi.hoisted(() => ({
  mockData: vi.fn(),
  mockDefaultFetchAccountTokens: vi.fn(),
  mockDefaultFetchAvailableModels: vi.fn(),
  mockDefaultFetchTokenById: vi.fn(),
  mockDefaultFetchUserGroups: vi.fn(),
  mockRevealFetch: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/keyManagement", () => ({
  fetchAccountAvailableModels: mockDefaultFetchAvailableModels,
  fetchAccountTokens: mockDefaultFetchAccountTokens,
  fetchTokenById: mockDefaultFetchTokenById,
  fetchUserGroups: mockDefaultFetchUserGroups,
}))

vi.mock("~/services/apiService/newApiFamily/default/tokenKeyResolver", () => ({
  fetchTokenSecretKeyById: mockRevealFetch,
}))

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { data: mockData },
}))

const request = {
  baseUrl: "https://rix.example.invalid",
  auth: { authType: AuthTypeEnum.Cookie },
}

const baseTokenRow = {
  id: 7,
  user_id: 1,
  key: "abcdefghijklmnopqr",
  status: 1,
  name: "probe",
  created_time: 1,
  accessed_time: 1,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
}

const tokenRow = (overrides: Record<string, unknown> = {}) =>
  ({ ...baseTokenRow, ...overrides }) as unknown as NewApiToken

describe("Rix API token transport", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    clearRixApiDialectChoicesForTests()
  })

  it("reads the 6.x group list before the removed legacy endpoint", async () => {
    mockData.mockResolvedValue([
      {
        description: "cheap official relay",
        displayNameEn: "OpenAI Reliable",
        key: "OpenAI-官方优惠",
        official: false,
        value: "openai-official-cheap",
      },
      { description: "", key: "OpenAI", official: true, value: "openai" },
    ])

    await expect(fetchUserGroups(request)).resolves.toEqual({
      "openai-official-cheap": { desc: "OpenAI-官方优惠", ratio: 1 },
      openai: { desc: "OpenAI", ratio: 1 },
    })
    expect(mockData).toHaveBeenCalledWith(request, {
      endpoint: "/api/token/group",
    })
    expect(mockDefaultFetchUserGroups).not.toHaveBeenCalled()
  })

  it("falls back to the legacy group payload when the 6.x list is unavailable", async () => {
    mockData.mockRejectedValue(new Error("not found"))
    const legacyGroups = { default: { desc: "Default", ratio: 1 } }
    mockDefaultFetchUserGroups.mockResolvedValue(legacyGroups)

    await expect(fetchUserGroups(request)).resolves.toEqual(legacyGroups)
  })

  it("falls back to the legacy group payload when the 6.x endpoint returns a non-array", async () => {
    mockData.mockResolvedValue({ not: "an array" })
    const legacyGroups = { default: { desc: "Default", ratio: 1 } }
    mockDefaultFetchUserGroups.mockResolvedValue(legacyGroups)

    await expect(fetchUserGroups(request)).resolves.toEqual(legacyGroups)
    expect(mockDefaultFetchUserGroups).toHaveBeenCalledWith(request)
  })

  it("starts from the remembered group endpoint on the next read", async () => {
    mockData.mockRejectedValue(new Error("not found"))
    const legacyGroups = { default: { desc: "Default", ratio: 1 } }
    mockDefaultFetchUserGroups.mockResolvedValue(legacyGroups)

    await fetchUserGroups(request)
    await expect(fetchUserGroups(request)).resolves.toEqual(legacyGroups)

    expect(mockData).toHaveBeenCalledTimes(1)
    expect(mockDefaultFetchUserGroups).toHaveBeenCalledTimes(2)
  })

  it("reads the console group list with the session for a token account", async () => {
    const accountRequest = {
      ...request,
      auth: { ...request.auth, authType: AuthTypeEnum.AccessToken },
    }
    mockData.mockResolvedValue([{ key: "OpenAI", value: "openai" }])

    await expect(fetchUserGroups(accountRequest)).resolves.toEqual({
      openai: { desc: "OpenAI", ratio: 1 },
    })
    expect(mockData).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ authType: AuthTypeEnum.Cookie }),
      }),
      { endpoint: "/api/token/group" },
    )
  })

  it("keeps the credential attempt when the session cannot read the group list", async () => {
    const accountRequest = {
      ...request,
      auth: { ...request.auth, authType: AuthTypeEnum.AccessToken },
    }
    mockData
      .mockRejectedValueOnce(new Error("admin_key_scope_forbidden"))
      .mockResolvedValueOnce([{ key: "OpenAI", value: "openai" }])

    await expect(fetchUserGroups(accountRequest)).resolves.toEqual({
      openai: { desc: "OpenAI", ratio: 1 },
    })
    expect(mockData).toHaveBeenLastCalledWith(accountRequest, {
      endpoint: "/api/token/group",
    })
    expect(mockDefaultFetchUserGroups).not.toHaveBeenCalled()
  })

  it.each([
    [{ group: "vip", use_group: "trial" }, "vip"],
    [{ use_group: "trial" }, "trial"],
  ])("reads the current account group from %j", async (payload, expected) => {
    mockData.mockResolvedValue(payload)

    await expect(fetchCurrentUserGroup(request)).resolves.toBe(expected)
  })

  it("rejects an account payload without a usable group", async () => {
    mockData.mockResolvedValue({ use_group: "   " })

    await expect(fetchCurrentUserGroup(request)).rejects.toThrow(
      "invalid_current_user_group_payload",
    )
  })

  it("coerces the string quotas Rix returns into numbers", async () => {
    mockDefaultFetchAccountTokens.mockResolvedValue([
      tokenRow({ remain_quota: "1500", used_quota: "25" }),
    ])

    const [token] = await fetchAccountTokens(request)

    expect(token?.remain_quota).toBe(1500)
    expect(token?.used_quota).toBe(25)
    expect(mockDefaultFetchAccountTokens).toHaveBeenCalledWith(request, {
      startPage: 0,
      detectsNormalizedFirstPage: true,
    })
  })

  it("keeps numeric quotas and falls back to zero for unusable ones", async () => {
    mockDefaultFetchAccountTokens.mockResolvedValue([
      tokenRow(),
      tokenRow({ id: 8, remain_quota: "not-a-number", used_quota: null }),
    ])

    const tokens = await fetchAccountTokens(request)

    expect(tokens[0]?.remain_quota).toBe(0)
    expect(tokens[1]?.remain_quota).toBe(0)
    expect(tokens[1]?.used_quota).toBe(0)
  })

  it("normalizes a single token fetched for key resolution", async () => {
    mockDefaultFetchTokenById.mockResolvedValue(tokenRow({ remain_quota: "9" }))

    const token = await fetchTokenById(request, 7)

    expect(token.remain_quota).toBe(9)
  })

  it("resolves the credential through the reveal endpoint", async () => {
    mockRevealFetch.mockResolvedValue("sk-ep-abcdefghijklmnopqr")

    await expect(resolveApiTokenKey(request, tokenRow())).resolves.toBe(
      "sk-ep-abcdefghijklmnopqr",
    )
    expect(mockRevealFetch).toHaveBeenCalledWith(request, 7)
  })

  it.each([
    [AuthTypeEnum.AccessToken, AuthTypeEnum.Cookie],
    [AuthTypeEnum.Cookie, AuthTypeEnum.Cookie],
  ])(
    "reads the console-only model list with the session for a %s account",
    async (accountAuthType, expectedAuthType) => {
      const accountRequest = {
        ...request,
        auth: { ...request.auth, authType: accountAuthType },
      }
      mockDefaultFetchAvailableModels.mockResolvedValue(["gpt-6-luna"])

      await expect(
        fetchAccountAvailableModels(accountRequest),
      ).resolves.toEqual(["gpt-6-luna"])
      expect(mockDefaultFetchAvailableModels).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({ authType: expectedAuthType }),
        }),
      )
    },
  )

  it("keeps the credential attempt when the session cannot read the model list", async () => {
    const accountRequest = {
      ...request,
      auth: { ...request.auth, authType: AuthTypeEnum.AccessToken },
    }
    mockDefaultFetchAvailableModels
      .mockRejectedValueOnce(new Error("admin_key_scope_forbidden"))
      .mockResolvedValueOnce(["gpt-6-luna"])

    await expect(fetchAccountAvailableModels(accountRequest)).resolves.toEqual([
      "gpt-6-luna",
    ])
    expect(mockDefaultFetchAvailableModels).toHaveBeenLastCalledWith(
      accountRequest,
    )
  })

  it("starts from the remembered auth mode on the next model read", async () => {
    const accountRequest = {
      ...request,
      auth: { ...request.auth, authType: AuthTypeEnum.AccessToken },
    }
    mockDefaultFetchAvailableModels
      .mockRejectedValueOnce(new Error("admin_key_scope_forbidden"))
      .mockResolvedValue(["gpt-6-luna"])

    await fetchAccountAvailableModels(accountRequest)
    await fetchAccountAvailableModels(accountRequest)

    // Probe with the session once, then the credential for both reads.
    expect(mockDefaultFetchAvailableModels).toHaveBeenCalledTimes(3)
    expect(mockDefaultFetchAvailableModels).toHaveBeenLastCalledWith(
      accountRequest,
    )
  })

  it("refuses to resolve a credential without a usable token id", async () => {
    await expect(
      resolveApiTokenKey(request, tokenRow({ id: Number.NaN })),
    ).rejects.toThrow("token_secret_key_unresolvable")
    expect(mockRevealFetch).not.toHaveBeenCalled()
  })
})
