import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_AUTO_PROVISION_TOKEN_NAME } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES,
  ACCOUNT_TOKEN_INVENTORY_STATE_KINDS,
  ENSURE_ACCOUNT_TOKEN_RESULT_KINDS,
  ensureAccountTokenForPostSaveWorkflow,
  inspectAccountTokenInventory,
  selectSingleNewApiTokenByIdDiff,
} from "~/services/accounts/accountPostSaveWorkflow"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const {
  fetchAccountTokensMock,
  createApiTokenMock,
  fetchUserGroupsMock,
  getSiteAdapterMock,
} = vi.hoisted(() => {
  const fetchAccountTokensMock = vi.fn()
  const createApiTokenMock = vi.fn()
  const fetchUserGroupsMock = vi.fn()

  return {
    fetchAccountTokensMock,
    createApiTokenMock,
    fetchUserGroupsMock,
    getSiteAdapterMock: vi.fn(() => ({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
        createToken: (...args: unknown[]) => createApiTokenMock(...args),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
        userGroups: {
          fetch: (...args: unknown[]) => fetchUserGroupsMock(...args),
        },
      },
    })),
  }
})

vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => ({})),
  }
})

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: getSiteAdapterMock,
}))

const buildToken = (overrides: Partial<ApiToken> = {}): ApiToken => ({
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
})

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
    baseUrl: "https://api.example.com",
    token: "access-token",
    userId: "7",
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
    cookieAuthSessionCookie: "",
    ...overrides,
  }) as DisplaySiteData

const buildStoredAccount = (
  displayAccount: DisplaySiteData = buildDisplayAccount(),
) =>
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

describe("ensureAccountTokenForPostSaveWorkflow", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    fetchUserGroupsMock.mockReset()
    getSiteAdapterMock.mockClear()
  })

  it("selects the single newly created token by id diff even when it is not the last refetched token", () => {
    const existingTokens = [
      buildToken({ id: 3, key: "sk-existing-3" }),
      buildToken({ id: 8, key: "sk-existing-8" }),
    ]
    const createdToken = buildToken({ id: 11, key: "sk-created-11" })

    expect(
      selectSingleNewApiTokenByIdDiff({
        existingTokenIds: existingTokens.map((token) => token.id),
        tokens: [createdToken, existingTokens[1], existingTokens[0]],
      }),
    ).toEqual(createdToken)
  })

  it("returns null when token id diff is ambiguous or empty", () => {
    const existingTokenIds = [3, 8]
    const createdTokenA = buildToken({ id: 11, key: "sk-created-11" })
    const createdTokenB = buildToken({ id: 12, key: "sk-created-12" })

    expect(
      selectSingleNewApiTokenByIdDiff({
        existingTokenIds,
        tokens: [buildToken({ id: 3 }), buildToken({ id: 8 })],
      }),
    ).toBeNull()

    expect(
      selectSingleNewApiTokenByIdDiff({
        existingTokenIds,
        tokens: [createdTokenA, createdTokenB, buildToken({ id: 8 })],
      }),
    ).toBeNull()
  })

  it("ignores malformed token entries when selecting a token by id diff", () => {
    const createdToken = buildToken({ id: 11, key: "sk-created-11" })

    expect(
      selectSingleNewApiTokenByIdDiff({
        existingTokenIds: [3],
        tokens: [
          null,
          { id: "bad-token-id", key: "sk-invalid" },
          buildToken({ id: 3 }),
          createdToken,
        ],
      }),
    ).toEqual(createdToken)
  })

  it("returns a ready result when the account already has a token", async () => {
    const displayAccount = buildDisplayAccount()
    const account = buildStoredAccount(displayAccount)
    const existingToken = buildToken({ id: 5, key: "sk-ready" })
    fetchAccountTokensMock.mockResolvedValueOnce([existingToken])

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: existingToken,
      created: false,
    })
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("reports an existing AIHubMix masked inventory token as present but not usable as a secret", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
    })
    const maskedToken = buildToken({ id: 8, key: "sk-***masked***" })
    fetchAccountTokensMock.mockResolvedValueOnce([maskedToken])

    await expect(
      inspectAccountTokenInventory({
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ACCOUNT_TOKEN_INVENTORY_STATE_KINDS.Present,
      token: maskedToken,
      existingTokenIds: [maskedToken.id],
      hasUsableSecret: false,
    })
    expect(createApiTokenMock).not.toHaveBeenCalled()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("creates a default token for ordinary accounts without existing tokens", async () => {
    const displayAccount = buildDisplayAccount()
    const account = buildStoredAccount(displayAccount)
    const createdToken = buildToken({ id: 6, key: "sk-created" })
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(true)
    fetchAccountTokensMock.mockResolvedValueOnce([createdToken])

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: false,
    })
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
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
  })

  it("uses display account fields for inventory reads and stored account fields for token creation", async () => {
    const displayAccount = buildDisplayAccount({
      id: "display-account-id",
      baseUrl: "https://display.example.invalid",
      authType: AuthTypeEnum.Cookie,
      userId: "display-user-id",
      token: "display-access-token",
      cookieAuthSessionCookie: "display-session-cookie",
    })
    const account = buildSiteAccount({
      id: "stored-account-id",
      site_name: "Stored Account",
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
    const createdToken = buildToken({ id: 16, key: "sk-created" })

    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdToken])
    createApiTokenMock.mockResolvedValueOnce(true)

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: false,
    })

    const expectedDisplayRequest = {
      baseUrl: "https://display.example.invalid",
      accountId: "display-account-id",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "display-user-id",
        accessToken: "display-access-token",
        cookie: "display-session-cookie",
      },
    }

    expect(getSiteAdapterMock).toHaveBeenCalledWith(SITE_TYPES.NEW_API)
    expect(fetchAccountTokensMock).toHaveBeenNthCalledWith(
      1,
      expectedDisplayRequest,
    )
    expect(fetchAccountTokensMock).toHaveBeenNthCalledWith(
      2,
      expectedDisplayRequest,
    )
    expect(createApiTokenMock).toHaveBeenCalledWith(
      {
        baseUrl: "https://stored.example.invalid",
        accountId: "stored-account-id",
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "stored-user-id",
          accessToken: "stored-access-token",
          cookie: "stored-session-cookie",
        },
      },
      expect.objectContaining({
        name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        group: "",
      }),
    )
  })

  it("blocks ordinary token creation when create succeeds but refetch cannot identify the new token", async () => {
    const displayAccount = buildDisplayAccount()
    const account = buildStoredAccount(displayAccount)
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(true)
    fetchAccountTokensMock.mockResolvedValueOnce([null])

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
      message: "messages:accountOperations.createTokenFailed",
    })
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
  })

  it("blocks ordinary token creation when the create request returns a falsy result", async () => {
    const displayAccount = buildDisplayAccount()
    const account = buildStoredAccount(displayAccount)
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(false)

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
      message: "messages:accountOperations.createTokenFailed",
    })
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("creates an AIHubMix token and marks the full secret as one-time", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
      token: "aihubmix-access-token",
    })
    const account = buildStoredAccount(displayAccount)
    const createdToken = buildToken({
      id: 7,
      key: "sk-aihubmix-full-secret",
      name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
    })
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(createdToken)

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: true,
    })
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("returns ready for an existing AIHubMix token with a full secret", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
    })
    const account = buildStoredAccount(displayAccount)
    const existingToken = buildToken({
      id: 8,
      key: "sk-aihubmix-existing-full-secret",
    })
    fetchAccountTokensMock.mockResolvedValueOnce([existingToken])

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: existingToken,
      created: false,
    })
    expect(createApiTokenMock).not.toHaveBeenCalled()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("creates a new AIHubMix one-time token when the existing inventory token is masked", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
    })
    const account = buildStoredAccount(displayAccount)
    const createdToken = buildToken({
      id: 9,
      key: "sk-aihubmix-new-full-secret",
      name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
    })
    fetchAccountTokensMock.mockResolvedValueOnce([
      buildToken({ id: 8, key: "sk-***masked***" }),
    ])
    createApiTokenMock.mockResolvedValueOnce(createdToken)

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: true,
    })
    expect(createApiTokenMock).toHaveBeenCalledTimes(1)
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("blocks AIHubMix when creation does not return a usable full secret", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
    })
    const account = buildStoredAccount(displayAccount)
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(true)

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable,
      message: "messages:aihubmix.createRequiresOneTimeKeyDialog",
    })
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("blocks AIHubMix when creation returns a masked key", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
    })
    const account = buildStoredAccount(displayAccount)
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(
      buildToken({ id: 8, key: "sk-***masked***" }),
    )

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toMatchObject({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable,
    })
  })

  it("creates a Sub2API token directly when one current group exists", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
    })
    const account = buildStoredAccount(displayAccount)
    const createdToken = buildToken({ id: 9, key: "sk-sub2", group: "vip" })
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({ vip: { ratio: 1 } })
    createApiTokenMock.mockResolvedValueOnce(true)
    fetchAccountTokensMock.mockResolvedValueOnce([createdToken])

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: false,
    })
    expect(createApiTokenMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ group: "vip" }),
    )
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
  })

  it("requires Sub2API group selection when multiple current groups exist", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
    })
    const account = buildStoredAccount(displayAccount)
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { ratio: 1 },
      vip: { ratio: 2 },
    })

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
      allowedGroups: ["default", "vip"],
      existingTokenIds: [],
    })
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("blocks Sub2API when no current group is available", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
    })
    const account = buildStoredAccount(displayAccount)
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({})

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
      message: "messages:sub2api.createRequiresAvailableGroup",
    })
  })

  it("blocks Sub2API when single-group token creation cannot recover the created token", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
    })
    const account = buildStoredAccount(displayAccount)
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({ vip: { ratio: 1 } })
    createApiTokenMock.mockResolvedValueOnce(true)
    fetchAccountTokensMock.mockResolvedValueOnce(null)

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
      message: "messages:accountOperations.createTokenFailed",
    })
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
  })
})
