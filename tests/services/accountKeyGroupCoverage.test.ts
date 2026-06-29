import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildGroupDefaultTokenRequest,
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
  generateDefaultTokenRequest,
} from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  deleteInvalidAccountToken,
  ensureAccountKeysForAvailableGroups,
} from "~/services/accounts/accountKeyAutoProvisioning/groupCoverage"
import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_ERRORS,
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { AuthTypeEnum } from "~/types"
import { ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS } from "~/types/accountKeyAutoProvisioning"
import {
  buildApiToken,
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => ({
  fetchAccountTokens: vi.fn(),
  fetchUserGroups: vi.fn(),
  createApiToken: vi.fn(),
  updateApiToken: vi.fn(),
  deleteApiToken: vi.fn(),
  resolveDefaultTokenCreation: vi.fn(),
  classifyCreatedToken: vi.fn(),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn(() => ({
    siteType: SITE_TYPES.NEW_API,
    account: {
      keyManagement: {
        fetchTokens: (...args: unknown[]) => mocks.fetchAccountTokens(...args),
        userGroups: {
          fetch: (...args: unknown[]) => mocks.fetchUserGroups(...args),
        },
        createToken: (...args: unknown[]) => mocks.createApiToken(...args),
        updateToken: (...args: unknown[]) => mocks.updateApiToken(...args),
        deleteToken: (...args: unknown[]) => mocks.deleteApiToken(...args),
        resolveTokenKey: vi.fn(),
        fetchAvailableModels: vi.fn(),
      },
      tokenProvisioning: {
        isInventoryTokenUsable: vi.fn(() => true),
        resolveDefaultTokenCreation: (...args: unknown[]) =>
          mocks.resolveDefaultTokenCreation(...args),
        classifyCreatedToken: (...args: unknown[]) =>
          mocks.classifyCreatedToken(...args),
        getRepairPolicy: vi.fn(() => ({
          kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible,
        })),
      },
    },
  })),
}))

const account = buildSiteAccount({
  id: "new-api-1",
  site_name: "Relay Account",
  site_type: SITE_TYPES.NEW_API,
  site_url: "https://relay.example.com",
  authType: AuthTypeEnum.AccessToken,
  account_info: {
    id: "101",
    access_token: "access-token",
    username: "valid",
    quota: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
})

const displaySiteData = buildDisplaySiteData({
  id: account.id,
  name: "Relay Account",
  baseUrl: account.site_url,
  siteType: SITE_TYPES.NEW_API,
  authType: AuthTypeEnum.AccessToken,
  userId: "101",
  token: "access-token",
})

const runCoverage = (abortSignal?: AbortSignal) =>
  ensureAccountKeysForAvailableGroups({
    account,
    displaySiteData,
    accountName: "Relay Account",
    siteUrlOrigin: "https://relay.example.com",
    abortSignal,
  })

describe("ensureAccountKeysForAvailableGroups", () => {
  beforeEach(() => {
    mocks.fetchAccountTokens.mockReset()
    mocks.fetchUserGroups.mockReset()
    mocks.createApiToken.mockReset()
    mocks.updateApiToken.mockReset()
    mocks.deleteApiToken.mockReset()
    mocks.resolveDefaultTokenCreation.mockReset()
    mocks.classifyCreatedToken.mockReset()
    mocks.resolveDefaultTokenCreation.mockImplementation(
      ({ defaultTokenData }) => ({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: defaultTokenData,
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }),
    )
    mocks.classifyCreatedToken.mockReturnValue({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
    })
  })

  it("creates missing group keys and reports tokens tied to unavailable groups", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([
      buildApiToken({
        id: 1,
        name: "default key",
        group: "default",
      }),
      buildApiToken({
        id: 9,
        name: "old group key",
        group: "old",
      }),
    ])
    mocks.fetchUserGroups.mockResolvedValue({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 1 },
    })
    mocks.createApiToken.mockResolvedValue(true)

    const result = await runCoverage()

    expect(result).toEqual({
      created: true,
      availableGroups: ["default", "vip"],
      coveredGroups: ["default", "vip"],
      createdGroups: ["vip"],
      missingGroups: [],
      invalidTokens: [
        {
          accountId: "new-api-1",
          accountName: "Relay Account",
          siteType: SITE_TYPES.NEW_API,
          siteUrlOrigin: "https://relay.example.com",
          tokenId: 9,
          tokenName: "old group key",
          group: "old",
          reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
        },
      ],
      renamedTokens: [],
      renameFailedTokens: [],
    })
    expect(mocks.createApiToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://relay.example.com",
        accountId: "new-api-1",
        auth: expect.objectContaining({
          authType: AuthTypeEnum.AccessToken,
          userId: "101",
          accessToken: "access-token",
        }),
      }),
      buildGroupDefaultTokenRequest("vip"),
    )
  })

  it("uses stored account context for group coverage token APIs and adapter lookup", async () => {
    const account = buildSiteAccount({
      id: "stored-account-id",
      site_url: "https://stored.example.invalid",
      site_type: SITE_TYPES.NEW_API,
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
    const displaySiteData = buildDisplaySiteData({
      id: "display-account-id",
      baseUrl: "https://display.example.invalid",
      siteType: SITE_TYPES.SUB2API,
      authType: AuthTypeEnum.Cookie,
      userId: "display-user-id",
      token: "display-access-token",
      cookieAuthSessionCookie: "display-session-cookie",
    })

    mocks.fetchAccountTokens.mockResolvedValueOnce([])
    mocks.fetchUserGroups.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
    })
    mocks.createApiToken.mockResolvedValueOnce({ id: 1, key: "sk-created" })
    mocks.classifyCreatedToken.mockReturnValueOnce({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
      token: { id: 1, key: "sk-created" },
      oneTimeSecret: false,
    })

    await ensureAccountKeysForAvailableGroups({
      account,
      displaySiteData,
      accountName: "Stored Account",
      siteUrlOrigin: "https://stored.example.invalid",
    })

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

    const { getSiteTypeCapabilities } = await import(
      "~/services/apiAdapters/registry"
    )
    expect(getSiteTypeCapabilities).toHaveBeenCalledWith(SITE_TYPES.NEW_API)
    expect(mocks.fetchAccountTokens).toHaveBeenCalledWith(expectedStoredRequest)
    expect(mocks.fetchUserGroups).toHaveBeenCalledWith(expectedStoredRequest)
    expect(mocks.createApiToken).toHaveBeenCalledWith(
      expectedStoredRequest,
      expect.any(Object),
    )
  })

  it("renames only auto-template token names to match their current group", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([
      buildApiToken({
        id: 1,
        name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        group: "vip",
        models: "gpt-4o,gpt-4o-mini",
      }),
      buildApiToken({
        id: 2,
        name: "old group (auto)",
        group: "beta",
        model_limits_enabled: true,
        model_limits: "claude-3-5-sonnet",
      }),
      buildApiToken({
        id: 3,
        name: "Custom production key",
        group: "vip",
      }),
    ])
    mocks.fetchUserGroups.mockResolvedValue({
      vip: { desc: "VIP", ratio: 1 },
      beta: { desc: "Beta", ratio: 1 },
    })
    mocks.updateApiToken.mockResolvedValue(true)

    const result = await runCoverage()

    expect(result.renamedTokens).toEqual([
      {
        tokenId: 1,
        group: "vip",
        previousName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        nextName: "vip group (auto)",
      },
      {
        tokenId: 2,
        group: "beta",
        previousName: "old group (auto)",
        nextName: "beta group (auto)",
      },
    ])
    expect(result.renameFailedTokens).toEqual([])
    expect(mocks.updateApiToken).toHaveBeenCalledTimes(2)
    expect(mocks.updateApiToken).toHaveBeenNthCalledWith(1, {
      request: expect.objectContaining({
        baseUrl: "https://relay.example.com",
        accountId: "new-api-1",
      }),
      tokenId: 1,
      tokenData: expect.objectContaining({
        name: "vip group (auto)",
        group: "vip",
        models: "gpt-4o,gpt-4o-mini",
      }),
    })
    expect(mocks.updateApiToken).toHaveBeenNthCalledWith(2, {
      request: expect.objectContaining({
        baseUrl: "https://relay.example.com",
        accountId: "new-api-1",
      }),
      tokenId: 2,
      tokenData: expect.objectContaining({
        name: "beta group (auto)",
        group: "beta",
        model_limits_enabled: true,
        model_limits: "claude-3-5-sonnet",
      }),
    })
  })

  it("skips auto-template rename when the repair option is disabled", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([
      buildApiToken({
        id: 1,
        name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        group: "vip",
      }),
    ])
    mocks.fetchUserGroups.mockResolvedValue({
      vip: { desc: "VIP", ratio: 1 },
    })

    const result = await ensureAccountKeysForAvailableGroups({
      account,
      displaySiteData,
      accountName: "Relay Account",
      siteUrlOrigin: "https://relay.example.com",
      renameAutoTemplateTokens: false,
    })

    expect(result.renamedTokens).toEqual([])
    expect(result.renameFailedTokens).toEqual([])
    expect(mocks.updateApiToken).not.toHaveBeenCalled()
  })

  it("keeps group coverage repair running when an auto-template rename fails", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([
      buildApiToken({
        id: 1,
        name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        group: "vip",
      }),
    ])
    mocks.fetchUserGroups.mockResolvedValue({
      vip: { desc: "VIP", ratio: 1 },
      beta: { desc: "Beta", ratio: 1 },
    })
    mocks.updateApiToken.mockRejectedValueOnce(new Error("rename failed"))
    mocks.createApiToken.mockResolvedValue(true)

    const result = await runCoverage()

    expect(result.createdGroups).toEqual(["beta"])
    expect(result.renameFailedTokens).toEqual([
      {
        tokenId: 1,
        group: "vip",
        previousName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        nextName: "vip group (auto)",
      },
    ])
    expect(mocks.createApiToken).toHaveBeenCalledWith(
      expect.any(Object),
      buildGroupDefaultTokenRequest("beta"),
    )
  })

  it("records a false auto-template rename response as a non-blocking failure", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([
      buildApiToken({
        id: 1,
        name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        group: "vip",
      }),
    ])
    mocks.fetchUserGroups.mockResolvedValue({
      vip: { desc: "VIP", ratio: 1 },
    })
    mocks.updateApiToken.mockResolvedValueOnce(false)

    const result = await runCoverage()

    expect(result.renamedTokens).toEqual([])
    expect(result.renameFailedTokens).toEqual([
      {
        tokenId: 1,
        group: "vip",
        previousName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        nextName: "vip group (auto)",
      },
    ])
  })

  it("passes the abort signal into token, group, and creation requests", async () => {
    const abortController = new AbortController()
    mocks.fetchAccountTokens.mockResolvedValue([])
    mocks.fetchUserGroups.mockResolvedValue({
      default: { desc: "Default", ratio: 1 },
    })
    mocks.createApiToken.mockResolvedValue(true)

    await runCoverage(abortController.signal)

    expect(mocks.fetchAccountTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: abortController.signal,
      }),
    )
    expect(mocks.fetchUserGroups).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: abortController.signal,
      }),
    )
    expect(mocks.createApiToken).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: abortController.signal,
      }),
      buildGroupDefaultTokenRequest("default"),
    )
  })

  it("uses the stored account id for invalid tokens when display data has no id", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([
      buildApiToken({
        id: 9,
        name: "old group key",
        group: "old",
      }),
    ])
    mocks.fetchUserGroups.mockResolvedValue({
      default: { desc: "Default", ratio: 1 },
    })
    mocks.createApiToken.mockResolvedValue(true)

    const result = await ensureAccountKeysForAvailableGroups({
      account,
      displaySiteData: {
        ...displaySiteData,
        id: "",
      },
      accountName: "Relay Account",
      siteUrlOrigin: "https://relay.example.com",
    })

    expect(mocks.fetchAccountTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "new-api-1",
      }),
    )
    expect(result.invalidTokens).toEqual([
      expect.objectContaining({
        accountId: "new-api-1",
        tokenId: 9,
      }),
    ])
  })

  it("falls back to one-key behavior when group lookup capability is missing", async () => {
    const createdToken = buildApiToken({
      id: 22,
      name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
      group: "",
    })

    mocks.fetchAccountTokens
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdToken])
    const { getSiteTypeCapabilities } = await import(
      "~/services/apiAdapters/registry"
    )
    ;(
      getSiteTypeCapabilities as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({
      siteType: SITE_TYPES.NEW_API,
      account: {
        keyManagement: {
          fetchTokens: (...args: unknown[]) =>
            mocks.fetchAccountTokens(...args),
          createToken: (...args: unknown[]) => mocks.createApiToken(...args),
          deleteToken: (...args: unknown[]) => mocks.deleteApiToken(...args),
          resolveTokenKey: vi.fn(),
          fetchAvailableModels: vi.fn(),
        },
        tokenProvisioning: {
          isInventoryTokenUsable: vi.fn(() => true),
          resolveDefaultTokenCreation: (...args: unknown[]) =>
            mocks.resolveDefaultTokenCreation(...args),
          classifyCreatedToken: (...args: unknown[]) =>
            mocks.classifyCreatedToken(...args),
          getRepairPolicy: vi.fn(() => ({
            kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible,
          })),
        },
      },
    })
    mocks.createApiToken.mockResolvedValue(true)

    const result = await runCoverage()

    expect(result).toEqual({
      created: true,
      availableGroups: [],
      coveredGroups: [],
      createdGroups: [""],
      missingGroups: [],
      invalidTokens: [],
      renamedTokens: [],
      renameFailedTokens: [],
    })
    expect(mocks.createApiToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://relay.example.com",
        accountId: "new-api-1",
      }),
      generateDefaultTokenRequest(),
    )
    expect(mocks.resolveDefaultTokenCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.Repair,
        defaultTokenData: generateDefaultTokenRequest(),
      }),
    )
    expect(mocks.fetchUserGroups).not.toHaveBeenCalled()
  })

  it("recovers the empty-group fallback token by id diff through lifecycle recovery", async () => {
    const createdToken = buildApiToken({
      id: 22,
      name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
      group: "",
    })

    mocks.fetchAccountTokens
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdToken])
    mocks.fetchUserGroups.mockResolvedValue({})
    mocks.createApiToken.mockResolvedValueOnce(true)
    mocks.classifyCreatedToken.mockReturnValueOnce({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
    })

    const result = await runCoverage()

    expect(result).toEqual({
      created: true,
      availableGroups: [],
      coveredGroups: [],
      createdGroups: [""],
      missingGroups: [],
      invalidTokens: [],
      renamedTokens: [],
      renameFailedTokens: [],
    })
    expect(mocks.fetchAccountTokens).toHaveBeenCalledTimes(2)
  })

  it("reports empty-group fallback recovery failures as token not found", async () => {
    mocks.fetchAccountTokens.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    mocks.fetchUserGroups.mockResolvedValue({})
    mocks.createApiToken.mockResolvedValueOnce(true)
    mocks.classifyCreatedToken.mockReturnValueOnce({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
    })

    await expect(runCoverage()).rejects.toThrow(
      TOKEN_PROVISIONING_ERRORS.TokenNotFound,
    )
    expect(mocks.fetchAccountTokens).toHaveBeenCalledTimes(2)
  })

  it("blocks legacy one-key repair when policy requires a one-time secret dialog", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([])
    mocks.fetchUserGroups.mockResolvedValue({})
    mocks.resolveDefaultTokenCreation.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired,
    })

    await expect(runCoverage()).rejects.toThrow(
      "messages:aihubmix.createRequiresOneTimeKeyDialog",
    )

    expect(mocks.createApiToken).not.toHaveBeenCalled()
  })

  it("blocks legacy one-key repair when policy rejects default creation", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([])
    mocks.fetchUserGroups.mockResolvedValue({})
    mocks.resolveDefaultTokenCreation.mockReturnValueOnce({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
    })

    await expect(runCoverage()).rejects.toThrow(
      "messages:tokenProvisioning.createRequiresGroup",
    )

    expect(mocks.createApiToken).not.toHaveBeenCalled()
  })

  it("fails legacy one-key repair when token creation is rejected", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([])
    mocks.fetchUserGroups.mockResolvedValue({})
    mocks.createApiToken.mockResolvedValueOnce(false)
    mocks.classifyCreatedToken.mockReturnValueOnce({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Failed,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
    })

    await expect(runCoverage()).rejects.toThrow(
      TOKEN_PROVISIONING_ERRORS.CreateTokenFailed,
    )
  })

  it("blocks legacy one-key repair when created token secret cannot be recovered", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([])
    mocks.fetchUserGroups.mockResolvedValue({})
    mocks.createApiToken.mockResolvedValueOnce(true)
    mocks.classifyCreatedToken.mockReturnValueOnce({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Unavailable,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable,
    })

    await expect(runCoverage()).rejects.toThrow(
      "messages:aihubmix.createRequiresOneTimeKeyDialog",
    )
  })

  it("maps ambiguous legacy one-key repair recovery to token not found", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([])
    mocks.fetchUserGroups.mockResolvedValue({})
    mocks.createApiToken.mockResolvedValueOnce(true)
    mocks.classifyCreatedToken.mockReturnValueOnce({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
    })
    mocks.fetchAccountTokens
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        buildApiToken({ id: 22, name: "created a" }),
        buildApiToken({ id: 23, name: "created b" }),
      ])

    await expect(runCoverage()).rejects.toThrow(
      TOKEN_PROVISIONING_ERRORS.TokenNotFound,
    )
  })

  it("falls back to the generic policy-block message for unexpected repair blocks", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([])
    mocks.fetchUserGroups.mockResolvedValue({})
    mocks.createApiToken.mockResolvedValueOnce(true)
    mocks.classifyCreatedToken.mockReturnValueOnce({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Unavailable,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
    })

    await expect(runCoverage()).rejects.toThrow(
      "messages:tokenProvisioning.createRequiresGroup",
    )
  })

  it("treats empty group responses as legacy one-key coverage when a token already exists", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([
      buildApiToken({
        id: 1,
        name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        group: "",
      }),
    ])
    mocks.fetchUserGroups.mockResolvedValue({})

    const result = await runCoverage()

    expect(result).toEqual({
      created: false,
      availableGroups: [],
      coveredGroups: [],
      createdGroups: [],
      missingGroups: [],
      invalidTokens: [],
      renamedTokens: [],
      renameFailedTokens: [],
    })
    expect(mocks.createApiToken).not.toHaveBeenCalled()
  })

  it("records failed group creation as missing and continues with later groups", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([
      buildApiToken({
        id: 1,
        name: "default key",
        group: "default",
      }),
    ])
    mocks.fetchUserGroups.mockResolvedValue({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 1 },
      beta: { desc: "Beta", ratio: 1 },
    })
    mocks.createApiToken
      .mockRejectedValueOnce(new Error("vip failed"))
      .mockResolvedValueOnce(true)

    const result = await runCoverage()

    expect(result).toEqual({
      created: true,
      availableGroups: ["default", "vip", "beta"],
      coveredGroups: ["default", "beta"],
      createdGroups: ["beta"],
      missingGroups: ["vip"],
      invalidTokens: [],
      renamedTokens: [],
      renameFailedTokens: [],
    })
    expect(mocks.createApiToken).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      buildGroupDefaultTokenRequest("vip"),
    )
    expect(mocks.createApiToken).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      buildGroupDefaultTokenRequest("beta"),
    )
  })

  it("deletes an invalid account token and returns a deletion record", async () => {
    mocks.deleteApiToken.mockResolvedValue(true)

    const result = await deleteInvalidAccountToken({
      account,
      displaySiteData,
      token: {
        accountId: "new-api-1",
        accountName: "Relay Account",
        siteType: SITE_TYPES.NEW_API,
        siteUrlOrigin: "https://relay.example.com",
        tokenId: 9,
        tokenName: "old group key",
        group: "old",
        reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
      },
    })

    expect(mocks.deleteApiToken).toHaveBeenCalledWith({
      request: expect.objectContaining({
        baseUrl: "https://relay.example.com",
        accountId: "new-api-1",
        auth: expect.objectContaining({
          authType: AuthTypeEnum.AccessToken,
          userId: "101",
          accessToken: "access-token",
        }),
      }),
      tokenId: 9,
    })
    expect(result).toEqual(
      expect.objectContaining({
        accountId: "new-api-1",
        tokenId: 9,
        tokenName: "old group key",
        group: "old",
        reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
        deletedAt: expect.any(Number),
      }),
    )
  })
})
