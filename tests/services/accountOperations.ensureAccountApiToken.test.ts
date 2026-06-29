import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildGroupDefaultTokenRequest,
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
  ensureDefaultApiTokenForAccount,
  generateDefaultTokenRequest,
} from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  ensureAccountApiToken,
  resolveSub2ApiQuickCreateResolution,
} from "~/services/accounts/accountOperations"
import { TOKEN_QUICK_CREATE_RESOLUTION_KINDS } from "~/services/accounts/tokenQuickCreateResolution"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_ERRORS,
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
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
  resolveDefaultTokenCreationMock,
  classifyCreatedTokenMock,
  getSiteTypeCapabilitiesMock,
  toastLoadingMock,
} = vi.hoisted(() => {
  const fetchAccountTokensMock = vi.fn()
  const createApiTokenMock = vi.fn()
  const fetchUserGroupsMock = vi.fn()
  const resolveDefaultTokenCreationMock = vi.fn()
  const classifyCreatedTokenMock = vi.fn()

  return {
    fetchAccountTokensMock,
    createApiTokenMock,
    fetchUserGroupsMock,
    resolveDefaultTokenCreationMock,
    classifyCreatedTokenMock,
    getSiteTypeCapabilitiesMock: vi.fn(
      (): SiteTypeCapabilities => ({
        siteType: SITE_TYPES.SUB2API,
        account: {
          keyManagement: {
            fetchTokens: (...args: unknown[]) =>
              fetchAccountTokensMock(...args),
            createToken: (...args: unknown[]) => createApiTokenMock(...args),
            updateToken: vi.fn(),
            resolveTokenKey: vi.fn(),
            deleteToken: vi.fn(),
            fetchAvailableModels: vi.fn(),
            userGroups: {
              fetch: (...args: unknown[]) => fetchUserGroupsMock(...args),
            },
          },
          tokenProvisioning: {
            isInventoryTokenUsable: vi.fn(
              ({ token }) =>
                typeof token.key === "string" && !token.key.includes("***"),
            ),
            resolveDefaultTokenCreation: (...args: unknown[]) =>
              resolveDefaultTokenCreationMock(...args),
            classifyCreatedToken: (...args: unknown[]) =>
              classifyCreatedTokenMock(...args),
            getRepairPolicy: vi.fn(() => ({
              kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible,
            })),
          },
        },
      }),
    ),
    toastLoadingMock: vi.fn(),
  }
})

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
    getApiService: vi.fn(() => ({})),
  }
})

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: getSiteTypeCapabilitiesMock,
}))

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
    userId: "456",
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
    userId: "789",
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
    resolveDefaultTokenCreationMock.mockReset()
    classifyCreatedTokenMock.mockReset()
    getSiteTypeCapabilitiesMock.mockClear()
    toastLoadingMock.mockReset()
    resolveDefaultTokenCreationMock.mockImplementation(
      ({ defaultTokenData }) => ({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: defaultTokenData,
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }),
    )
    classifyCreatedTokenMock.mockImplementation(({ result }) =>
      typeof result === "object" && result !== null
        ? {
            kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
            token: result,
            oneTimeSecret: false,
          }
        : result
          ? {
              kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
            }
          : {
              kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Failed,
              reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
            },
    )

    const testAccounts = createTestAccounts()
    DISPLAY_ACCOUNT = testAccounts.displayAccount
    SITE_ACCOUNT = testAccounts.siteAccount
  })

  it("blocks implicit Sub2API default-token creation in background helpers", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    resolveDefaultTokenCreationMock.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
    })

    await expect(
      ensureDefaultApiTokenForAccount({
        account: SITE_ACCOUNT,
      }),
    ).rejects.toThrow("messages:tokenProvisioning.createRequiresGroup")

    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("uses group-selection fallback copy when background Sub2API creation needs user choice", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    resolveDefaultTokenCreationMock
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
      })
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
        allowedGroups: ["default", "vip"],
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
      })
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 1 },
    })

    await expect(
      ensureDefaultApiTokenForAccount({
        account: SITE_ACCOUNT,
      }),
    ).rejects.toThrow("messages:tokenProvisioning.createRequiresGroup")

    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("treats existing Sub2API tokens as already satisfying background ensure", async () => {
    const token = buildSub2ApiToken({ id: 5, group: "vip" })
    fetchAccountTokensMock.mockResolvedValueOnce([token])

    await expect(
      ensureDefaultApiTokenForAccount({
        account: SITE_ACCOUNT,
      }),
    ).resolves.toEqual({ token, created: false })

    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("blocks shared token ensure when no Sub2API group has been resolved", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    resolveDefaultTokenCreationMock.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
    })

    await expect(
      ensureAccountApiToken(SITE_ACCOUNT, DISPLAY_ACCOUNT),
    ).rejects.toThrow("messages:tokenProvisioning.createRequiresGroup")

    expect(toastLoadingMock).toHaveBeenCalled()
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("creates a Sub2API token when an explicit valid group is provided", async () => {
    const token = buildSub2ApiToken({ id: 9, group: "vip" })
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([token])
    createApiTokenMock.mockResolvedValueOnce(true)
    resolveDefaultTokenCreationMock.mockImplementationOnce(
      ({ defaultTokenData, explicitGroup }) => ({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: { ...defaultTokenData, group: explicitGroup },
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }),
    )

    await expect(
      ensureAccountApiToken(SITE_ACCOUNT, DISPLAY_ACCOUNT, {
        sub2apiGroup: "vip",
      }),
    ).resolves.toEqual(token)

    expect(createApiTokenMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ group: "vip" }),
    )
    expect(createApiTokenMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ group: "vip" }),
    )
  })

  it("keeps explicitGroup as the generic group-selection alias", async () => {
    const token = buildSub2ApiToken({ id: 12, key: "sk-vip" })

    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([token])
    createApiTokenMock.mockResolvedValueOnce(true)
    resolveDefaultTokenCreationMock.mockImplementationOnce((request) => ({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: { ...request.defaultTokenData, group: request.explicitGroup },
      oneTimeSecret: false,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
    }))
    classifyCreatedTokenMock.mockReturnValueOnce({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
    })

    await expect(
      ensureAccountApiToken(SITE_ACCOUNT, DISPLAY_ACCOUNT, {
        toastId: "toast-explicit-group",
        explicitGroup: "vip",
      }),
    ).resolves.toEqual(token)

    expect(createApiTokenMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ group: "vip" }),
    )
  })

  it("passes policy-resolved default token data to shared ensure", async () => {
    const token = buildSub2ApiToken({ id: 42, key: "sk-created" })
    const policyTokenData = {
      ...generateDefaultTokenRequest(),
      name: "Policy Resolved Default Key",
      group: "vip",
      remain_quota: 12345,
    }

    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([token])
    createApiTokenMock.mockResolvedValueOnce(true)
    resolveDefaultTokenCreationMock.mockImplementationOnce((request) => ({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: request.defaultTokenData,
      oneTimeSecret: false,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
    }))
    classifyCreatedTokenMock.mockReturnValueOnce({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
    })

    await expect(
      ensureAccountApiToken(SITE_ACCOUNT, DISPLAY_ACCOUNT, {
        toastId: "toast-policy-token-data",
        defaultTokenData: policyTokenData,
      }),
    ).resolves.toEqual(token)

    expect(createApiTokenMock).toHaveBeenCalledWith(
      expect.any(Object),
      policyTokenData,
    )
  })

  it("resolves quick-create group selection through token provisioning policy", async () => {
    resolveDefaultTokenCreationMock
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
      })
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
        allowedGroups: ["default", "vip"],
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
      })
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 1 },
    })

    const { resolveDefaultTokenQuickCreateResolution } = await import(
      "~/services/accounts/accountOperations"
    )

    await expect(
      resolveDefaultTokenQuickCreateResolution(DISPLAY_ACCOUNT),
    ).resolves.toEqual({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
      allowedGroups: ["default", "vip"],
    })
  })

  it("reports when Sub2API quick-create has no valid current groups", async () => {
    resolveDefaultTokenCreationMock
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
      })
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
      })
    fetchUserGroupsMock.mockResolvedValueOnce({})

    await expect(
      resolveSub2ApiQuickCreateResolution(DISPLAY_ACCOUNT),
    ).resolves.toEqual({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked,
      message: "messages:sub2api.createRequiresAvailableGroup",
    })
  })

  it("requires explicit selection when Sub2API quick-create has multiple groups", async () => {
    resolveDefaultTokenCreationMock
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
      })
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
        allowedGroups: ["default", "vip"],
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
      })
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 2 },
    })

    await expect(
      resolveSub2ApiQuickCreateResolution(DISPLAY_ACCOUNT),
    ).resolves.toEqual({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
      allowedGroups: ["default", "vip"],
    })
  })

  it("resolves a ready state when Sub2API quick-create has exactly one unique group", async () => {
    resolveDefaultTokenCreationMock
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
      })
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: { ...generateDefaultTokenRequest(), group: "vip" },
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      })
    fetchUserGroupsMock.mockResolvedValueOnce({
      " vip ": { desc: "VIP", ratio: 2 },
      vip: { desc: "VIP duplicate", ratio: 3 },
    })

    await expect(
      resolveSub2ApiQuickCreateResolution(DISPLAY_ACCOUNT),
    ).resolves.toEqual({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
      group: "vip",
    })
  })

  it("normalizes ready default quick-create token names for non-default groups", async () => {
    const { resolveDefaultTokenQuickCreateResolution } = await import(
      "~/services/accounts/accountOperations"
    )

    resolveDefaultTokenCreationMock
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
      })
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: { ...generateDefaultTokenRequest(), group: "vip" },
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      })
    fetchUserGroupsMock.mockResolvedValueOnce({
      vip: { desc: "VIP", ratio: 2 },
    })

    await expect(
      resolveDefaultTokenQuickCreateResolution(DISPLAY_ACCOUNT),
    ).resolves.toMatchObject({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
      tokenData: {
        name: "vip group (auto)",
        group: "vip",
      },
    })
  })

  it("rejects quick-create resolution when Sub2API group inventory is missing", async () => {
    resolveDefaultTokenCreationMock.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
    })
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
      siteType: SITE_TYPES.SUB2API,
      account: {
        keyManagement: {
          fetchTokens: vi.fn(),
          createToken: vi.fn(),
          updateToken: vi.fn(),
          resolveTokenKey: vi.fn(),
          deleteToken: vi.fn(),
          fetchAvailableModels: vi.fn(),
          userGroups: undefined,
        },
        tokenProvisioning: {
          isInventoryTokenUsable: vi.fn(() => true),
          resolveDefaultTokenCreation: (...args: unknown[]) =>
            resolveDefaultTokenCreationMock(...args),
          classifyCreatedToken: (...args: unknown[]) =>
            classifyCreatedTokenMock(...args),
          getRepairPolicy: vi.fn(() => ({
            kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible,
          })),
        },
      },
    })

    await expect(
      resolveSub2ApiQuickCreateResolution(DISPLAY_ACCOUNT),
    ).rejects.toThrow(
      TOKEN_PROVISIONING_ERRORS.Sub2ApiGroupInventoryNotImplemented,
    )

    expect(fetchUserGroupsMock).not.toHaveBeenCalled()
  })

  it("rejects default quick-create resolution when policy still needs groups after lookup", async () => {
    const { resolveDefaultTokenQuickCreateResolution } = await import(
      "~/services/accounts/accountOperations"
    )

    resolveDefaultTokenCreationMock
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
      })
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
      })
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
    })

    await expect(
      resolveDefaultTokenQuickCreateResolution(DISPLAY_ACCOUNT),
    ).rejects.toThrow(
      TOKEN_PROVISIONING_ERRORS.Sub2ApiGroupInventoryNotImplemented,
    )

    expect(fetchUserGroupsMock).toHaveBeenCalledTimes(1)
  })

  it("rejects quick-create resolution for non-Sub2API accounts", async () => {
    const { displayAccount } = createNonSub2ApiAccounts()

    await expect(
      resolveSub2ApiQuickCreateResolution(displayAccount as any),
    ).rejects.toThrow(TOKEN_PROVISIONING_ERRORS.Sub2ApiQuickCreateNotApplicable)

    expect(fetchUserGroupsMock).not.toHaveBeenCalled()
  })

  it("reports one-time secret policy blocks through default quick-create resolution", async () => {
    const { displayAccount } = createAIHubMixAccounts()
    const { resolveDefaultTokenQuickCreateResolution } = await import(
      "~/services/accounts/accountOperations"
    )

    resolveDefaultTokenCreationMock.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired,
    })

    await expect(
      resolveDefaultTokenQuickCreateResolution(displayAccount as any),
    ).resolves.toEqual({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired,
      message: "messages:aihubmix.createRequiresOneTimeKeyDialog",
    })
  })

  it("reports generic policy blocks through default quick-create resolution", async () => {
    const { displayAccount } = createNonSub2ApiAccounts()
    const { resolveDefaultTokenQuickCreateResolution } = await import(
      "~/services/accounts/accountOperations"
    )

    resolveDefaultTokenCreationMock.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
    })

    await expect(
      resolveDefaultTokenQuickCreateResolution(displayAccount as any),
    ).resolves.toEqual({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
      message: "messages:tokenProvisioning.createRequiresGroup",
    })
  })
})

describe("ensureDefaultApiTokenForAccount non-Sub2API branches", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    fetchUserGroupsMock.mockReset()
    resolveDefaultTokenCreationMock.mockReset()
    classifyCreatedTokenMock.mockReset()
    getSiteTypeCapabilitiesMock.mockClear()
    toastLoadingMock.mockReset()
    resolveDefaultTokenCreationMock.mockImplementation(
      ({ defaultTokenData }) => ({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: defaultTokenData,
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }),
    )
    classifyCreatedTokenMock.mockImplementation(({ result }) =>
      typeof result === "object" && result !== null
        ? {
            kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
            token: result,
            oneTimeSecret: false,
          }
        : result
          ? {
              kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
            }
          : {
              kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Failed,
              reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
            },
    )
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

  it("builds group-aware default token payload names", () => {
    expect(buildGroupDefaultTokenRequest("default")).toEqual({
      ...generateDefaultTokenRequest(),
      name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
      group: "default",
    })
    expect(buildGroupDefaultTokenRequest("vip")).toEqual({
      ...generateDefaultTokenRequest(),
      name: "vip group (auto)",
      group: "vip",
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

  it("uses stored account fields for inventory reads and token creation", async () => {
    const siteAccount = buildSiteAccount({
      id: "stored-account-id",
      site_type: SITE_TYPES.NEW_API,
      site_url: "https://stored.example.invalid",
      authType: AuthTypeEnum.Cookie,
      cookieAuth: { sessionCookie: "stored-session-cookie" },
      account_info: {
        id: "stored-user-id",
        access_token: "stored-access-token",
        username: "stored-user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    const createdToken = { id: 25, key: "sk-created-secret" }

    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdToken])
    createApiTokenMock.mockResolvedValueOnce(true)

    await expect(
      ensureDefaultApiTokenForAccount({
        account: siteAccount,
      }),
    ).resolves.toEqual({ token: createdToken, created: true })

    const expectedStoredRequest = {
      baseUrl: "https://stored.example.invalid",
      accountId: "stored-account-id",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "stored-user-id",
        accessToken: "stored-access-token",
        cookie: "stored-session-cookie",
      },
    }

    expect(getSiteTypeCapabilitiesMock).toHaveBeenCalledWith(SITE_TYPES.NEW_API)
    expect(fetchAccountTokensMock).toHaveBeenNthCalledWith(
      1,
      expectedStoredRequest,
    )
    expect(fetchAccountTokensMock).toHaveBeenNthCalledWith(
      2,
      expectedStoredRequest,
    )
    expect(createApiTokenMock).toHaveBeenCalledWith(
      expectedStoredRequest,
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
      }),
    ).resolves.toEqual({ token: createdToken, created: true })

    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("blocks implicit AIHubMix default-token creation because the key must be shown once", async () => {
    const { siteAccount } = createAIHubMixAccounts()

    fetchAccountTokensMock.mockResolvedValueOnce([])
    resolveDefaultTokenCreationMock.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired,
    })

    await expect(
      ensureDefaultApiTokenForAccount({
        account: siteAccount as any,
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

  it("uses display account fields for shared inventory reads and stored account fields for shared token creation", async () => {
    const displayAccount = {
      id: "shared-display-account-id",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://shared-display.example.invalid",
      authType: AuthTypeEnum.Cookie,
      userId: "shared-display-user-id",
      token: "shared-display-access-token",
      cookieAuthSessionCookie: "shared-display-session-cookie",
    }
    const siteAccount = buildSiteAccount({
      id: "shared-stored-account-id",
      site_type: SITE_TYPES.NEW_API,
      site_url: "https://shared-stored.example.invalid",
      authType: AuthTypeEnum.Cookie,
      cookieAuth: { sessionCookie: "shared-stored-session-cookie" },
      account_info: {
        id: "shared-stored-user-id",
        access_token: "shared-stored-access-token",
        username: "shared-stored-user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    const createdToken = {
      id: 26,
      user_id: "shared-display-user-id",
      key: "sk-shared-created-secret",
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
      ensureAccountApiToken(siteAccount, displayAccount as any),
    ).resolves.toEqual(createdToken)

    expect(getSiteTypeCapabilitiesMock).toHaveBeenCalledWith(SITE_TYPES.NEW_API)
    expect(fetchAccountTokensMock).toHaveBeenCalledWith({
      baseUrl: "https://shared-display.example.invalid",
      accountId: "shared-display-account-id",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "shared-display-user-id",
        accessToken: "shared-display-access-token",
        cookie: "shared-display-session-cookie",
      },
    })
    expect(createApiTokenMock).toHaveBeenCalledWith(
      {
        baseUrl: "https://shared-stored.example.invalid",
        accountId: "shared-stored-account-id",
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "shared-stored-user-id",
          accessToken: "shared-stored-access-token",
          cookie: "shared-stored-session-cookie",
        },
      },
      expect.objectContaining({
        name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        group: "",
      }),
    )
  })

  it("blocks shared AIHubMix token ensure when no token exists because no one-time dialog is available", async () => {
    const { displayAccount, siteAccount } = createAIHubMixAccounts()

    fetchAccountTokensMock.mockResolvedValueOnce([])
    resolveDefaultTokenCreationMock.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired,
    })

    await expect(
      ensureAccountApiToken(siteAccount as any, displayAccount as any),
    ).rejects.toThrow("messages:aihubmix.createRequiresOneTimeKeyDialog")

    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("returns an existing usable AIHubMix token without trying to create a new one", async () => {
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

  it("does not treat a masked AIHubMix inventory token as usable for shared ensure", async () => {
    const { displayAccount, siteAccount } = createAIHubMixAccounts()
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        id: 24,
        user_id: displayAccount.userId,
        key: "sk-***masked***",
        status: 1,
        name: "masked",
        created_time: 1,
        accessed_time: 1,
        expired_time: -1,
        remain_quota: -1,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    resolveDefaultTokenCreationMock.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired,
    })

    await expect(
      ensureAccountApiToken(siteAccount as any, displayAccount as any),
    ).rejects.toThrow("messages:aihubmix.createRequiresOneTimeKeyDialog")

    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("blocks shared token ensure when created token secret cannot be recovered", async () => {
    const { displayAccount, siteAccount } = createAIHubMixAccounts()

    fetchAccountTokensMock.mockResolvedValueOnce([])
    resolveDefaultTokenCreationMock.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: generateDefaultTokenRequest(),
      oneTimeSecret: true,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.CreatedResponseFirst,
    })
    createApiTokenMock.mockResolvedValueOnce(true)
    classifyCreatedTokenMock.mockReturnValueOnce({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Unavailable,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable,
    })

    await expect(
      ensureAccountApiToken(siteAccount as any, displayAccount as any),
    ).rejects.toThrow("messages:aihubmix.createRequiresOneTimeKeyDialog")
  })

  it("reports shared token creation failures with the create-token message", async () => {
    const { displayAccount, siteAccount } = createNonSub2ApiAccounts()

    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(false)

    await expect(
      ensureAccountApiToken(siteAccount as any, displayAccount as any),
    ).rejects.toThrow("messages:accountOperations.createTokenFailed")
  })

  it("blocks background token ensure when created token secret cannot be recovered", async () => {
    const { siteAccount } = createAIHubMixAccounts()

    fetchAccountTokensMock.mockResolvedValueOnce([])
    resolveDefaultTokenCreationMock.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: generateDefaultTokenRequest(),
      oneTimeSecret: true,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.CreatedResponseFirst,
    })
    createApiTokenMock.mockResolvedValueOnce(true)
    classifyCreatedTokenMock.mockReturnValueOnce({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Unavailable,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable,
    })

    await expect(
      ensureDefaultApiTokenForAccount({
        account: siteAccount as any,
      }),
    ).rejects.toThrow("messages:aihubmix.createRequiresOneTimeKeyDialog")
  })

  it("preserves the fallback policy reason for unsupported background auto-provision", async () => {
    const { siteAccount } = createNonSub2ApiAccounts()

    fetchAccountTokensMock.mockResolvedValueOnce([])
    resolveDefaultTokenCreationMock.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
    })

    await expect(
      ensureDefaultApiTokenForAccount({
        account: siteAccount as any,
      }),
    ).rejects.toMatchObject({
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
    })
  })

  it("fails when default token creation reports false", async () => {
    const { siteAccount } = createNonSub2ApiAccounts()

    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(false)

    await expect(
      ensureDefaultApiTokenForAccount({
        account: siteAccount as any,
      }),
    ).rejects.toThrow(TOKEN_PROVISIONING_ERRORS.CreateTokenFailed)
  })

  it("fails when the token inventory is still empty after a successful create", async () => {
    const { siteAccount } = createNonSub2ApiAccounts()

    fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(true)

    await expect(
      ensureDefaultApiTokenForAccount({
        account: siteAccount as any,
      }),
    ).rejects.toThrow(TOKEN_PROVISIONING_ERRORS.TokenNotFound)
  })
})
