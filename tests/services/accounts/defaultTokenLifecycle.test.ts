import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createDefaultTokenFromDecision,
  createStoredAccountTokenRequest,
  DEFAULT_TOKEN_INVENTORY_STATE_KINDS,
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_ERRORS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  ensureDefaultTokenLifecycle,
  generateDefaultTokenRequest,
  inspectDefaultTokenInventory,
  resolveDefaultTokenLifecycleDecision,
  selectSingleNewApiTokenByIdDiff,
} from "~/services/accounts/defaultTokenLifecycle"
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import type { SiteAdapter } from "~/services/apiAdapters/contracts/siteAdapter"
import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
  TOKEN_PROVISIONING_WORKFLOWS,
  type DefaultTokenCreationDecision,
  type TokenProvisioningCapability,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const {
  fetchAccountTokensMock,
  isInventoryTokenUsableMock,
  getSiteAdapterMock,
} = vi.hoisted(() => {
  const fetchAccountTokensMock = vi.fn()
  const isInventoryTokenUsableMock = vi.fn()

  return {
    fetchAccountTokensMock,
    isInventoryTokenUsableMock,
    getSiteAdapterMock: vi.fn<() => Partial<SiteAdapter>>(() => ({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
        createToken: vi.fn(),
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
      },
      tokenProvisioning: {
        isInventoryTokenUsable: (...args: unknown[]) =>
          isInventoryTokenUsableMock(...args),
        resolveDefaultTokenCreation: vi.fn(),
        classifyCreatedToken: vi.fn(),
        getRepairPolicy: vi.fn(() => ({
          kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible,
        })),
      },
    })),
  }
})

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: getSiteAdapterMock,
}))

const buildToken = (overrides: Partial<ApiToken> = {}): ApiToken =>
  ({
    id: 1,
    user_id: 7,
    key: "sk-existing",
    status: 1,
    name: "existing",
    created_time: 1,
    accessed_time: 1,
    expired_time: -1,
    remain_quota: -1,
    unlimited_quota: true,
    used_quota: 0,
    ...overrides,
  }) as ApiToken

const buildDisplayAccount = (
  overrides: Partial<DisplaySiteData> = {},
): DisplaySiteData =>
  ({
    id: "account-id",
    name: "Account",
    username: "user",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    health: { status: "healthy" },
    siteType: SITE_TYPES.NEW_API,
    baseUrl: "https://api.example.invalid",
    token: "access-token",
    userId: "7",
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
    cookieAuthSessionCookie: "",
    ...overrides,
  }) as DisplaySiteData

const buildStoredAccount = (displayAccount = buildDisplayAccount()) =>
  buildSiteAccount({
    id: displayAccount.id,
    site_name: displayAccount.name,
    site_url: displayAccount.baseUrl,
    site_type: displayAccount.siteType,
    authType: displayAccount.authType,
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

const buildRequest = (): ApiServiceRequest => ({
  baseUrl: "https://api.example.invalid",
  accountId: "account-id",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "7",
    accessToken: "access-token",
    cookie: "",
  },
})

const createDecision = (
  tokenData = generateDefaultTokenRequest(),
): Extract<
  DefaultTokenCreationDecision,
  { kind: typeof DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create }
> => ({
  kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
  tokenData,
  oneTimeSecret: false,
  recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
})

describe("defaultTokenLifecycle inventory helpers", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    isInventoryTokenUsableMock.mockReset()
    getSiteAdapterMock.mockClear()
    isInventoryTokenUsableMock.mockReturnValue(true)
  })

  it("selects exactly one new token by id diff and ignores malformed entries", () => {
    const createdToken = buildToken({ id: 11, key: "sk-created-11" })

    expect(
      selectSingleNewApiTokenByIdDiff({
        existingTokenIds: [3, 8],
        tokens: [
          null,
          { id: "bad-token-id", key: "sk-invalid" },
          buildToken({ id: 3 }),
          createdToken,
        ],
      }),
    ).toEqual(createdToken)
  })

  it("returns null when the token id diff is empty or ambiguous", () => {
    expect(
      selectSingleNewApiTokenByIdDiff({
        existingTokenIds: [3, 8],
        tokens: [buildToken({ id: 3 }), buildToken({ id: 8 })],
      }),
    ).toBeNull()

    expect(
      selectSingleNewApiTokenByIdDiff({
        existingTokenIds: [3, 8],
        tokens: [buildToken({ id: 11 }), buildToken({ id: 12 })],
      }),
    ).toBeNull()
  })

  it("reports missing inventory with an empty id list", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      inspectDefaultTokenInventory({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        displaySiteData: buildDisplayAccount(),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Missing,
      existingTokenIds: [],
    })
  })

  it("reports the latest valid inventory token and policy usability", async () => {
    const firstToken = buildToken({ id: 3, key: "sk-old" })
    const latestToken = buildToken({ id: 8, key: "sk-latest" })
    fetchAccountTokensMock.mockResolvedValueOnce([
      firstToken,
      { id: "bad", key: "sk-invalid" },
      latestToken,
    ])
    isInventoryTokenUsableMock.mockReturnValueOnce(false)

    await expect(
      inspectDefaultTokenInventory({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        displaySiteData: buildDisplayAccount({
          siteType: SITE_TYPES.AIHUBMIX,
          baseUrl: "https://aihubmix.example.invalid",
        }),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Present,
      token: latestToken,
      existingTokenIds: [3, 8],
      hasUsableSecret: false,
    })

    expect(isInventoryTokenUsableMock).toHaveBeenCalledWith({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
      token: latestToken,
    })
  })
})

describe("defaultTokenLifecycle decision and create helpers", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    isInventoryTokenUsableMock.mockReset()
    getSiteAdapterMock.mockClear()
  })

  it("fetches user groups only after policy asks for them", async () => {
    const resolveDefaultTokenCreationMock = vi
      .fn()
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
      })
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
        allowedGroups: ["default", "vip"],
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
      })
    const fetchUserGroupsMock = vi.fn().mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 2 },
    })

    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: vi.fn(),
        createToken: vi.fn(),
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
        userGroups: { fetch: fetchUserGroupsMock },
      },
      tokenProvisioning: {
        isInventoryTokenUsable: vi.fn(),
        resolveDefaultTokenCreation: resolveDefaultTokenCreationMock,
        classifyCreatedToken: vi.fn(),
        getRepairPolicy: vi.fn(),
      },
    })

    await expect(
      resolveDefaultTokenLifecycleDecision({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
        displaySiteData: buildDisplayAccount(),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
      allowedGroups: ["default", "vip"],
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
    })

    expect(fetchUserGroupsMock).toHaveBeenCalledTimes(1)
    expect(resolveDefaultTokenCreationMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userGroups: {
          default: { desc: "Default", ratio: 1 },
          vip: { desc: "VIP", ratio: 2 },
        },
      }),
    )
  })

  it("throws the provided missing-user-groups message when group lookup is unavailable", async () => {
    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: vi.fn(),
        createToken: vi.fn(),
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
      },
      tokenProvisioning: {
        isInventoryTokenUsable: vi.fn(),
        resolveDefaultTokenCreation: vi.fn(() => ({
          kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
        })),
        classifyCreatedToken: vi.fn(),
        getRepairPolicy: vi.fn(),
      },
    })

    await expect(
      resolveDefaultTokenLifecycleDecision({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
        displaySiteData: buildDisplayAccount(),
        missingUserGroupsMessage: "missing_groups",
      }),
    ).rejects.toThrow("missing_groups")
  })

  it("returns a usable created token without refetch", async () => {
    const createdToken = buildToken({ id: 22, key: "sk-created" })
    const keyManagement = {
      createToken: vi.fn().mockResolvedValueOnce(createdToken),
      fetchTokens: vi.fn(),
    } as unknown as KeyManagementCapability
    const tokenProvisioning = {
      classifyCreatedToken: vi.fn(() => ({
        kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
        token: createdToken,
        oneTimeSecret: true,
      })),
    } as unknown as TokenProvisioningCapability

    await expect(
      createDefaultTokenFromDecision({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        keyManagement,
        tokenProvisioning,
        createRequest: buildRequest(),
        inventoryRequest: buildRequest(),
        decision: createDecision(),
        existingTokenIds: [],
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: true,
      existingTokenIds: [],
    })

    expect(keyManagement.fetchTokens).not.toHaveBeenCalled()
  })

  it("names auto-provisioned tokens after the selected non-default group before creation", async () => {
    const createdToken = buildToken({ id: 22, key: "sk-created" })
    const keyManagement = {
      createToken: vi.fn().mockResolvedValueOnce(createdToken),
      fetchTokens: vi.fn(),
    } as unknown as KeyManagementCapability
    const tokenProvisioning = {
      classifyCreatedToken: vi.fn(() => ({
        kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
        token: createdToken,
        oneTimeSecret: false,
      })),
    } as unknown as TokenProvisioningCapability

    await createDefaultTokenFromDecision({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
      keyManagement,
      tokenProvisioning,
      createRequest: buildRequest(),
      inventoryRequest: buildRequest(),
      decision: createDecision({
        ...generateDefaultTokenRequest(),
        group: "vip",
      }),
      existingTokenIds: [],
    })

    expect(keyManagement.createToken).toHaveBeenCalledWith(
      buildRequest(),
      expect.objectContaining({
        name: "vip group (auto)",
        group: "vip",
      }),
    )
  })

  it("refetches inventory and selects one new token when policy asks for inventory recovery", async () => {
    const createdToken = buildToken({ id: 22, key: "sk-created" })
    const keyManagement = {
      createToken: vi.fn().mockResolvedValueOnce(true),
      fetchTokens: vi
        .fn()
        .mockResolvedValueOnce([
          buildToken({ id: 3, key: "sk-existing" }),
          createdToken,
        ]),
    } as unknown as KeyManagementCapability
    const tokenProvisioning = {
      classifyCreatedToken: vi.fn(() => ({
        kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
      })),
    } as unknown as TokenProvisioningCapability

    await expect(
      createDefaultTokenFromDecision({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        keyManagement,
        tokenProvisioning,
        createRequest: buildRequest(),
        inventoryRequest: buildRequest(),
        decision: createDecision(),
        existingTokenIds: [3],
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: false,
      existingTokenIds: [3],
    })
  })

  it("blocks ambiguous inventory refetch recovery", async () => {
    const keyManagement = {
      createToken: vi.fn().mockResolvedValueOnce(true),
      fetchTokens: vi
        .fn()
        .mockResolvedValueOnce([
          buildToken({ id: 22, key: "sk-created-a" }),
          buildToken({ id: 23, key: "sk-created-b" }),
        ]),
    } as unknown as KeyManagementCapability
    const tokenProvisioning = {
      classifyCreatedToken: vi.fn(() => ({
        kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
      })),
    } as unknown as TokenProvisioningCapability

    await expect(
      createDefaultTokenFromDecision({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        keyManagement,
        tokenProvisioning,
        createRequest: buildRequest(),
        inventoryRequest: buildRequest(),
        decision: createDecision(),
        existingTokenIds: [],
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.AmbiguousCreatedToken,
      existingTokenIds: [],
    })
  })
})

describe("ensureDefaultTokenLifecycle", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    isInventoryTokenUsableMock.mockReset()
    getSiteAdapterMock.mockClear()
    isInventoryTokenUsableMock.mockReturnValue(true)
  })

  it("rejects quick-create selection because it only resolves creation decisions", async () => {
    await expect(
      ensureDefaultTokenLifecycle({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
        account: buildStoredAccount(),
        displaySiteData: buildDisplayAccount(),
      }),
    ).rejects.toThrow(
      DEFAULT_TOKEN_LIFECYCLE_ERRORS.QuickCreateSelectionIsDecisionOnly,
    )

    expect(getSiteAdapterMock).not.toHaveBeenCalled()
  })

  it("returns Ready for an existing usable inventory token", async () => {
    const existingToken = buildToken({ id: 5, key: "sk-ready" })
    fetchAccountTokensMock.mockResolvedValueOnce([existingToken])

    await expect(
      ensureDefaultTokenLifecycle({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        account: buildStoredAccount(),
        displaySiteData: buildDisplayAccount(),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready,
      token: existingToken,
      created: false,
      existingTokenIds: [5],
    })
  })

  it("continues to policy creation when the existing inventory token is unusable", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.example.invalid",
    })
    const createdToken = buildToken({ id: 9, key: "sk-aihubmix-full-secret" })
    const createTokenMock = vi.fn().mockResolvedValueOnce(createdToken)
    const resolveDefaultTokenCreationMock = vi.fn(() => ({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: generateDefaultTokenRequest(),
      oneTimeSecret: true,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.CreatedResponseFirst,
    }))

    fetchAccountTokensMock.mockResolvedValueOnce([
      buildToken({ id: 8, key: "sk-***masked***" }),
    ])
    isInventoryTokenUsableMock.mockReturnValueOnce(false)
    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
        createToken: createTokenMock,
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
      },
      tokenProvisioning: {
        isInventoryTokenUsable: (...args: unknown[]) =>
          isInventoryTokenUsableMock(...args),
        resolveDefaultTokenCreation: resolveDefaultTokenCreationMock,
        classifyCreatedToken: vi.fn(() => ({
          kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
          token: createdToken,
          oneTimeSecret: true,
        })),
        getRepairPolicy: vi.fn(),
      },
    })

    await expect(
      ensureDefaultTokenLifecycle({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        account: buildStoredAccount(displayAccount),
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: true,
      existingTokenIds: [8],
    })

    expect(resolveDefaultTokenCreationMock).toHaveBeenCalledTimes(1)
    expect(createTokenMock).toHaveBeenCalledWith(
      createStoredAccountTokenRequest(buildStoredAccount(displayAccount)),
      generateDefaultTokenRequest(),
    )
  })

  it("returns SelectionRequired with existing token ids", async () => {
    const resolveDefaultTokenCreationMock = vi
      .fn()
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
      })
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
        allowedGroups: ["default", "vip"],
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
      })
    const fetchUserGroupsMock = vi.fn().mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 2 },
    })

    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
        createToken: vi.fn(),
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
        userGroups: { fetch: fetchUserGroupsMock },
      },
      tokenProvisioning: {
        isInventoryTokenUsable: vi.fn(),
        resolveDefaultTokenCreation: resolveDefaultTokenCreationMock,
        classifyCreatedToken: vi.fn(),
        getRepairPolicy: vi.fn(),
      },
    } satisfies Partial<SiteAdapter>)
    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      ensureDefaultTokenLifecycle({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        account: buildStoredAccount(),
        displaySiteData: buildDisplayAccount(),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.SelectionRequired,
      allowedGroups: ["default", "vip"],
      existingTokenIds: [],
    })
  })

  it("returns a lifecycle block when user groups are unavailable", async () => {
    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
        createToken: vi.fn(),
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
      },
      tokenProvisioning: {
        isInventoryTokenUsable: vi.fn(),
        resolveDefaultTokenCreation: vi.fn(() => ({
          kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
        })),
        classifyCreatedToken: vi.fn(),
        getRepairPolicy: vi.fn(),
      },
    } satisfies Partial<SiteAdapter>)
    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      ensureDefaultTokenLifecycle({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        account: buildStoredAccount(),
        displaySiteData: buildDisplayAccount(),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.MissingUserGroups,
      existingTokenIds: [],
      cause: expect.any(Error),
    })
  })

  it("rethrows user group fetch failures instead of reporting missing user groups", async () => {
    const userGroupsError = new Error("user groups unavailable")
    const resolveDefaultTokenCreationMock = vi.fn(() => ({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
    }))
    const fetchUserGroupsMock = vi.fn().mockRejectedValueOnce(userGroupsError)

    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
        createToken: vi.fn(),
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
        userGroups: { fetch: fetchUserGroupsMock },
      },
      tokenProvisioning: {
        isInventoryTokenUsable: vi.fn(),
        resolveDefaultTokenCreation: resolveDefaultTokenCreationMock,
        classifyCreatedToken: vi.fn(),
        getRepairPolicy: vi.fn(),
      },
    } satisfies Partial<SiteAdapter>)
    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      ensureDefaultTokenLifecycle({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        account: buildStoredAccount(),
        displaySiteData: buildDisplayAccount(),
      }),
    ).rejects.toBe(userGroupsError)
  })

  it("captures baseline token ids before inventory-refetch recovery when initial inspection is skipped", async () => {
    const existingToken = buildToken({ id: 8, key: "sk-existing" })
    const createdToken = buildToken({ id: 9, key: "sk-created" })
    const createTokenMock = vi.fn().mockResolvedValueOnce(true)
    const resolveDefaultTokenCreationMock = vi.fn(() => ({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: generateDefaultTokenRequest(),
      oneTimeSecret: false,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
    }))

    fetchAccountTokensMock
      .mockResolvedValueOnce([existingToken])
      .mockResolvedValueOnce([existingToken, createdToken])
    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
        createToken: createTokenMock,
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
      },
      tokenProvisioning: {
        isInventoryTokenUsable: vi.fn(),
        resolveDefaultTokenCreation: resolveDefaultTokenCreationMock,
        classifyCreatedToken: vi.fn(() => ({
          kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
        })),
        getRepairPolicy: vi.fn(),
      },
    } satisfies Partial<SiteAdapter>)

    await expect(
      ensureDefaultTokenLifecycle({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        account: buildStoredAccount(),
        displaySiteData: buildDisplayAccount(),
        inspectInventory: false,
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: false,
      existingTokenIds: [8],
    })

    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    expect(createTokenMock).toHaveBeenCalledTimes(1)
  })
})
