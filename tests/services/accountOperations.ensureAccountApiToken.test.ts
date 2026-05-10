import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
  ensureDefaultApiTokenForAccount,
  generateDefaultTokenRequest,
} from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  ensureAccountApiToken,
  resolveSub2ApiQuickCreateResolution,
} from "~/services/accounts/accountOperations"
import { AuthTypeEnum } from "~/types"
import {
  buildSiteAccount,
  buildSub2ApiAccount,
  buildSub2ApiToken,
} from "~~/tests/test-utils/factories"

const {
  fetchAccountTokensMock,
  createApiTokenMock,
  fetchUserGroupsMock,
  toastLoadingMock,
} = vi.hoisted(() => ({
  fetchAccountTokensMock: vi.fn(),
  createApiTokenMock: vi.fn(),
  fetchUserGroupsMock: vi.fn(),
  toastLoadingMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    loading: toastLoadingMock,
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => ({
      fetchAccountTokens: (...args: any[]) => fetchAccountTokensMock(...args),
      createApiToken: (...args: any[]) => createApiTokenMock(...args),
      fetchUserGroups: (...args: any[]) => fetchUserGroupsMock(...args),
    })),
  }
})

const createTestAccounts = () => {
  const displayAccount = buildSub2ApiAccount()
  const siteAccount = buildSiteAccount({
    id: displayAccount.id,
    site_type: "sub2api",
    site_url: displayAccount.baseUrl,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: displayAccount.userId,
      access_token: displayAccount.token,
      username: displayAccount.username,
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
  })

  return {
    displayAccount,
    siteAccount,
  }
}

const createNonSub2ApiAccounts = () => {
  const displayAccount = {
    id: "new-api-account",
    siteType: SITE_TYPES.NEW_API,
    baseUrl: "https://new-api.example.com",
    authType: AuthTypeEnum.AccessToken,
    userId: 456,
    token: "new-api-token",
    cookieAuthSessionCookie: "session-cookie",
  }

  const siteAccount = buildSiteAccount({
    id: displayAccount.id,
    site_type: SITE_TYPES.NEW_API,
    site_url: displayAccount.baseUrl,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: displayAccount.userId,
      access_token: displayAccount.token,
      username: "new-api-user",
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
  })

  return {
    displayAccount,
    siteAccount,
  }
}

const createAIHubMixAccounts = () => {
  const displayAccount = {
    id: "aihubmix-account",
    siteType: SITE_TYPES.AIHUBMIX,
    baseUrl: "https://aihubmix.com",
    authType: AuthTypeEnum.AccessToken,
    userId: 789,
    token: "aihubmix-access-token",
    cookieAuthSessionCookie: "",
  }

  const siteAccount = buildSiteAccount({
    id: displayAccount.id,
    site_type: SITE_TYPES.AIHUBMIX,
    site_url: displayAccount.baseUrl,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: displayAccount.userId,
      access_token: displayAccount.token,
      username: "aihubmix-user",
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
  })

  return { displayAccount, siteAccount }
}

describe("accountOperations Sub2API token creation guards", () => {
  let DISPLAY_ACCOUNT: ReturnType<typeof buildSub2ApiAccount>
  let SITE_ACCOUNT: ReturnType<typeof buildSiteAccount>

  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    fetchUserGroupsMock.mockReset()
    toastLoadingMock.mockReset()

    const testAccounts = createTestAccounts()
    DISPLAY_ACCOUNT = testAccounts.displayAccount
    SITE_ACCOUNT = testAccounts.siteAccount
  })

  it("blocks implicit Sub2API default-token creation in background helpers", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      ensureDefaultApiTokenForAccount({
        account: SITE_ACCOUNT,
        displaySiteData: DISPLAY_ACCOUNT,
      }),
    ).rejects.toThrow("messages:sub2api.createRequiresGroup")

    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("treats existing Sub2API tokens as already satisfying background ensure", async () => {
    const token = buildSub2ApiToken({ id: 5, group: "vip" })
    fetchAccountTokensMock.mockResolvedValueOnce([token])

    await expect(
      ensureDefaultApiTokenForAccount({
        account: SITE_ACCOUNT,
        displaySiteData: DISPLAY_ACCOUNT,
      }),
    ).resolves.toEqual({ token, created: false })

    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("blocks shared token ensure when no Sub2API group has been resolved", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      ensureAccountApiToken(SITE_ACCOUNT, DISPLAY_ACCOUNT),
    ).rejects.toThrow("messages:sub2api.createRequiresGroup")

    expect(toastLoadingMock).toHaveBeenCalled()
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("creates a Sub2API token when an explicit valid group is provided", async () => {
    const token = buildSub2ApiToken({ id: 9, group: "vip" })
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([token])
    createApiTokenMock.mockResolvedValueOnce(true)

    await expect(
      ensureAccountApiToken(SITE_ACCOUNT, DISPLAY_ACCOUNT, {
        sub2apiGroup: "vip",
      }),
    ).resolves.toEqual(token)

    expect(createApiTokenMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ group: "vip" }),
    )
  })

  it("reports when Sub2API quick-create has no valid current groups", async () => {
    fetchUserGroupsMock.mockResolvedValueOnce({})

    await expect(
      resolveSub2ApiQuickCreateResolution(DISPLAY_ACCOUNT),
    ).resolves.toEqual({
      kind: "blocked",
      message: "messages:sub2api.createRequiresAvailableGroup",
    })
  })

  it("requires explicit selection when Sub2API quick-create has multiple groups", async () => {
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 2 },
    })

    await expect(
      resolveSub2ApiQuickCreateResolution(DISPLAY_ACCOUNT),
    ).resolves.toEqual({
      kind: "selection_required",
      allowedGroups: ["default", "vip"],
    })
  })

  it("resolves a ready state when Sub2API quick-create has exactly one unique group", async () => {
    fetchUserGroupsMock.mockResolvedValueOnce({
      " vip ": { desc: "VIP", ratio: 2 },
      vip: { desc: "VIP duplicate", ratio: 3 },
    })

    await expect(
      resolveSub2ApiQuickCreateResolution(DISPLAY_ACCOUNT),
    ).resolves.toEqual({
      kind: "ready",
      group: "vip",
    })
  })

  it("rejects quick-create resolution for non-Sub2API accounts", async () => {
    const { displayAccount } = createNonSub2ApiAccounts()

    await expect(
      resolveSub2ApiQuickCreateResolution(displayAccount as any),
    ).rejects.toThrow("sub2api_quick_create_not_applicable")

    expect(fetchUserGroupsMock).not.toHaveBeenCalled()
  })
})

describe("ensureDefaultApiTokenForAccount non-Sub2API branches", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    fetchUserGroupsMock.mockReset()
    toastLoadingMock.mockReset()
  })

  it("keeps the default auto-provision token payload stable", () => {
    expect(generateDefaultTokenRequest()).toEqual({
      name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
      unlimited_quota: true,
      expired_time: -1,
      remain_quota: 0,
      allow_ips: "",
      model_limits_enabled: false,
      model_limits: "",
      group: "",
    })
  })

  it("creates a default token for non-Sub2API accounts when no tokens exist", async () => {
    const { displayAccount, siteAccount } = createNonSub2ApiAccounts()
    const createdToken = { id: 21, key: "sk-created-secret" }

    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdToken])
    createApiTokenMock.mockResolvedValueOnce(true)

    await expect(
      ensureDefaultApiTokenForAccount({
        account: siteAccount as any,
        displaySiteData: displayAccount as any,
      }),
    ).resolves.toEqual({ token: createdToken, created: true })

    expect(createApiTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: displayAccount.baseUrl,
        accountId: displayAccount.id,
      }),
      expect.objectContaining({
        name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        group: "",
      }),
    )
  })

  it("uses a token returned by create without refetching masked inventory", async () => {
    const { displayAccount, siteAccount } = createNonSub2ApiAccounts()
    const createdToken = {
      id: 22,
      user_id: displayAccount.userId,
      key: "sk-created-full-secret",
      status: 1,
      name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
      created_time: 1,
      accessed_time: 1,
      expired_time: -1,
      remain_quota: -1,
      unlimited_quota: true,
      used_quota: 0,
    }

    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(createdToken)

    await expect(
      ensureDefaultApiTokenForAccount({
        account: siteAccount as any,
        displaySiteData: displayAccount as any,
      }),
    ).resolves.toEqual({ token: createdToken, created: true })

    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("blocks implicit AIHubMix default-token creation because the key must be shown once", async () => {
    const { displayAccount, siteAccount } = createAIHubMixAccounts()

    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      ensureDefaultApiTokenForAccount({
        account: siteAccount as any,
        displaySiteData: displayAccount as any,
      }),
    ).rejects.toThrow("messages:aihubmix.createRequiresOneTimeKeyDialog")

    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("uses a token returned by shared ensure creation without refetching masked inventory", async () => {
    const { displayAccount, siteAccount } = createNonSub2ApiAccounts()
    const createdToken = {
      id: 23,
      user_id: displayAccount.userId,
      key: "sk-created-full-secret",
      status: 1,
      name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
      created_time: 1,
      accessed_time: 1,
      expired_time: -1,
      remain_quota: -1,
      unlimited_quota: true,
      used_quota: 0,
    }

    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(createdToken)

    await expect(
      ensureAccountApiToken(siteAccount as any, displayAccount as any),
    ).resolves.toEqual(createdToken)

    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("blocks shared AIHubMix token ensure when no token exists because no one-time dialog is available", async () => {
    const { displayAccount, siteAccount } = createAIHubMixAccounts()

    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      ensureAccountApiToken(siteAccount as any, displayAccount as any),
    ).rejects.toThrow("messages:aihubmix.createRequiresOneTimeKeyDialog")

    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("returns an existing AIHubMix token without trying to create a new one", async () => {
    const { displayAccount, siteAccount } = createAIHubMixAccounts()
    const existingToken = {
      id: 24,
      user_id: displayAccount.userId,
      key: "sk-existing",
      status: 1,
      name: "existing",
      created_time: 1,
      accessed_time: 1,
      expired_time: -1,
      remain_quota: -1,
      unlimited_quota: true,
      used_quota: 0,
    }

    fetchAccountTokensMock.mockResolvedValueOnce([existingToken])

    await expect(
      ensureAccountApiToken(siteAccount as any, displayAccount as any),
    ).resolves.toEqual(existingToken)

    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("fails when default token creation reports false", async () => {
    const { displayAccount, siteAccount } = createNonSub2ApiAccounts()

    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(false)

    await expect(
      ensureDefaultApiTokenForAccount({
        account: siteAccount as any,
        displaySiteData: displayAccount as any,
      }),
    ).rejects.toThrow("create_token_failed")
  })

  it("fails when the token inventory is still empty after a successful create", async () => {
    const { displayAccount, siteAccount } = createNonSub2ApiAccounts()

    fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(true)

    await expect(
      ensureDefaultApiTokenForAccount({
        account: siteAccount as any,
        displaySiteData: displayAccount as any,
      }),
    ).rejects.toThrow("token_not_found")
  })
})
