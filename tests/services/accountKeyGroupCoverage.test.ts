import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
  generateDefaultTokenRequest,
} from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  buildGroupDefaultTokenRequest,
  deleteInvalidAccountToken,
  ensureAccountKeysForAvailableGroups,
} from "~/services/accounts/accountKeyAutoProvisioning/groupCoverage"
import {
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
  deleteApiToken: vi.fn(),
  resolveDefaultTokenCreation: vi.fn(),
  classifyCreatedToken: vi.fn(),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: vi.fn(() => ({
    keyManagement: {
      fetchTokens: (...args: unknown[]) => mocks.fetchAccountTokens(...args),
      userGroups: {
        fetch: (...args: unknown[]) => mocks.fetchUserGroups(...args),
      },
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

const runCoverage = () =>
  ensureAccountKeysForAvailableGroups({
    account,
    displaySiteData,
    accountName: "Relay Account",
    siteUrlOrigin: "https://relay.example.com",
  })

describe("ensureAccountKeysForAvailableGroups", () => {
  beforeEach(() => {
    mocks.fetchAccountTokens.mockReset()
    mocks.fetchUserGroups.mockReset()
    mocks.createApiToken.mockReset()
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
      kind: "needs_inventory_refetch",
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
    mocks.fetchAccountTokens.mockResolvedValue([])
    const { getSiteAdapter } = await import("~/services/apiAdapters/registry")
    ;(
      getSiteAdapter as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => mocks.fetchAccountTokens(...args),
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
      "messages:sub2api.createRequiresGroup",
    )

    expect(mocks.createApiToken).not.toHaveBeenCalled()
  })

  it("fails legacy one-key repair when token creation is rejected", async () => {
    mocks.fetchAccountTokens.mockResolvedValue([])
    mocks.fetchUserGroups.mockResolvedValue({})
    mocks.createApiToken.mockResolvedValueOnce(false)
    mocks.classifyCreatedToken.mockReturnValueOnce({
      kind: "failed",
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
    })

    await expect(runCoverage()).rejects.toThrow(
      TOKEN_PROVISIONING_ERRORS.CreateTokenFailed,
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
