import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildAccountKeyResourceRuntimeKey,
  buildAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { accountSub2ApiAuthSession } from "~/services/accounts/sub2apiAuthSession"
import {
  ACCOUNT_RUNTIME_KEY_SECRET_SOURCES,
  canCreateDisplayAccountTokens,
  canFetchDisplayAccountInviteLink,
  canManageDisplayAccountTokens,
  createAccountApiRequestFromStoredAccount,
  createDisplayAccountApiContext,
  createDisplayAccountRequestContext,
  fetchDisplayAccountAvailableModels,
  fetchDisplayAccountInviteLink,
  fetchDisplayAccountRuntimeKeys,
  fetchDisplayAccountTokens,
  getInvalidTokenPayloadLogContext,
  getRuntimeKeyInventoryErrorMessage,
  InvalidTokenPayloadError,
  resolveDisplayAccountRuntimeKeySecret,
  resolveDisplayAccountTokenForSecret,
  resolveStoredAccountApiContext,
  StoredAccountApiContextError,
} from "~/services/accounts/utils/apiServiceRequest"
import { resolveExportTokenForSecret } from "~/services/accounts/utils/exportTokenSecret"
import { ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS } from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/keyManagement"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { resolveAssociatedProfileSecret } from "~/services/apiCredentialProfiles/accountRuntimeKeyRecovery"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { INVITE_LINK_FAILURE_REASONS } from "~/services/inviteLinks/errors"
import {
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"

type ExpectAccountRuntimeKeyFetcher = (
  account: Parameters<typeof fetchDisplayAccountRuntimeKeys>[0],
) => Promise<AccountRuntimeKey[]>

const { mockGetAccountById } = vi.hoisted(() => ({
  mockGetAccountById: vi.fn(),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn(),
}))

vi.mock(
  "~/services/apiCredentialProfiles/accountRuntimeKeyRecovery",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiCredentialProfiles/accountRuntimeKeyRecovery")
      >()

    return {
      ...actual,
      resolveAssociatedProfileSecret: vi.fn(),
    }
  },
)

vi.mock("~/services/accounts/sub2apiAuthSession", () => ({
  accountSub2ApiAuthSession: {
    getLatestAuth: vi.fn(),
    persistAuthUpdate: vi.fn(),
  },
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountById: mockGetAccountById,
  },
}))

const ACCOUNT = {
  id: "account-1",
  name: "Example Account",
  siteType: "new-api",
  baseUrl: "https://example.com",
  authType: AuthTypeEnum.AccessToken,
  userId: "1",
  token: "token",
  cookieAuthSessionCookie: "",
  tagIds: [],
} as const

const REQUEST = {
  baseUrl: "https://example.com",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "1",
    accessToken: "token",
    cookie: "",
  },
}

const buildStoredAccount = (overrides: Record<string, unknown> = {}) => ({
  id: "account-1",
  site_name: "Example",
  site_url: "https://example.com",
  site_type: "new-api",
  authType: AuthTypeEnum.AccessToken,
  account_info: {
    id: "1",
    username: "Ada",
    access_token: "token",
  },
  cookieAuth: undefined,
  ...overrides,
})

describe("fetchDisplayAccountTokens", () => {
  let fetchTokens: ReturnType<typeof vi.fn>
  let fetchInviteLink: ReturnType<typeof vi.fn>
  let createToken: ReturnType<typeof vi.fn>
  let updateToken: ReturnType<typeof vi.fn>
  let resolveTokenKey: ReturnType<typeof vi.fn>
  let deleteToken: ReturnType<typeof vi.fn>
  let fetchUserGroups: ReturnType<typeof vi.fn>
  let fetchAvailableModels: ReturnType<typeof vi.fn>
  let fetchServiceCredential: ReturnType<typeof vi.fn>
  let tokenProvisioning: {
    isInventoryTokenUsable: ReturnType<typeof vi.fn>
    resolveDefaultTokenCreation: ReturnType<typeof vi.fn>
    classifyCreatedToken: ReturnType<typeof vi.fn>
  }
  let keyManagement: {
    fetchTokens: typeof fetchTokens
    createToken: typeof createToken
    updateToken: typeof updateToken
    resolveTokenKey: typeof resolveTokenKey
    deleteToken: typeof deleteToken
    fetchAvailableModels: typeof fetchAvailableModels
    inventorySecretAvailability?: string
    userGroups: {
      fetch: typeof fetchUserGroups
    }
  }
  let capabilities: {
    siteType: string
    account?: {
      inviteLink?: {
        fetchInviteLink: typeof fetchInviteLink
      }
      keyManagement?: typeof keyManagement
      serviceCredential?: {
        fetch: typeof fetchServiceCredential
        rotate?: ReturnType<typeof vi.fn>
      }
      tokenProvisioning?: typeof tokenProvisioning
    }
  }

  beforeEach(() => {
    fetchTokens = vi.fn()
    fetchInviteLink = vi.fn()
    createToken = vi.fn()
    updateToken = vi.fn()
    resolveTokenKey = vi.fn()
    deleteToken = vi.fn()
    fetchUserGroups = vi.fn()
    fetchAvailableModels = vi.fn()
    fetchServiceCredential = vi.fn()
    keyManagement = {
      fetchTokens,
      createToken,
      updateToken,
      resolveTokenKey,
      deleteToken,
      fetchAvailableModels,
      userGroups: {
        fetch: fetchUserGroups,
      },
    }
    tokenProvisioning = {
      isInventoryTokenUsable: vi.fn(),
      resolveDefaultTokenCreation: vi.fn(),
      classifyCreatedToken: vi.fn(),
    }
    capabilities = {
      siteType: "new-api",
      account: {
        inviteLink: {
          fetchInviteLink,
        },
        keyManagement,
        tokenProvisioning,
      },
    }

    vi.mocked(getSiteTypeCapabilities).mockReset()
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(capabilities as any)
    vi.mocked(resolveAssociatedProfileSecret).mockReset()
    mockGetAccountById.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("types runtime key loading as account runtime keys only", () => {
    expectTypeOf(
      fetchDisplayAccountRuntimeKeys,
    ).toEqualTypeOf<ExpectAccountRuntimeKeyFetcher>()
  })

  it("returns the token array when the API payload is valid", async () => {
    fetchTokens.mockResolvedValue([{ id: 1, key: "sk-test", status: 1 }])

    const result = await fetchDisplayAccountTokens(ACCOUNT as any)

    expect(result).toEqual([{ id: 1, key: "sk-test", status: 1 }])
    expect(fetchTokens).toHaveBeenCalledWith(expect.objectContaining(REQUEST))
    expect(createDisplayAccountApiContext(ACCOUNT as any)).toEqual(
      expect.objectContaining({
        capabilities,
        keyManagement,
        tokenProvisioning,
        request: expect.objectContaining(REQUEST),
      }),
    )
    expect(createDisplayAccountApiContext(ACCOUNT as any)).not.toHaveProperty(
      "service",
    )
    expect(createDisplayAccountApiContext(ACCOUNT as any)).toEqual(
      expect.objectContaining({
        accountKeyResources: undefined,
      }),
    )
    expect(createDisplayAccountApiContext(ACCOUNT as any)).toMatchObject({
      accountKeyResources: createDisplayAccountApiContext(ACCOUNT as any)
        .capabilities.account?.keyResources,
    })
    expect(createDisplayAccountApiContext(ACCOUNT as any)).toMatchObject({
      keyManagement,
    })
    expect(createDisplayAccountApiContext(ACCOUNT as any)).toEqual(
      expect.objectContaining({
        request: expect.not.objectContaining({
          accountAuthStore: expect.anything(),
        }),
      }),
    )
  })

  it("projects account-native key resources without inventing legacy key management", () => {
    const accountKeyResources = { open: vi.fn() }
    const accountKeyProvisioningResources = { open: vi.fn() }
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.OPENROUTER,
      account: {
        keyResources: accountKeyProvisioningResources,
        keyResourceManagement: accountKeyResources,
      },
    } as any)

    const context = createDisplayAccountApiContext({
      ...ACCOUNT,
      siteType: SITE_TYPES.OPENROUTER,
    } as any)

    expect(context.accountKeyResources).toBe(
      context.capabilities.account?.keyResourceManagement,
    )
    expect(context).toMatchObject({
      accountKeyResources,
      keyManagement: undefined,
      serviceCredential: undefined,
      tokenProvisioning: undefined,
    })
  })

  it("returns singleton service credentials as runtime keys when token inventory is unsupported", async () => {
    const serviceCredentialAccount = {
      ...ACCOUNT,
      siteType: SITE_TYPES.SHAREDCHAT,
      baseUrl: "https://runtime.example.invalid",
    }
    capabilities = {
      siteType: SITE_TYPES.SHAREDCHAT,
      account: {
        serviceCredential: {
          fetch: fetchServiceCredential,
          rotate: vi.fn(),
        },
      },
    }
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(capabilities as any)
    fetchServiceCredential.mockResolvedValueOnce({
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "service-credential-secret",
      isAuthenticated: true,
      baseUrl: "https://runtime.example.invalid",
    })

    await expect(
      fetchDisplayAccountRuntimeKeys(serviceCredentialAccount as any),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "service_credential:account-1:codex",
        source: "service_credential",
        accountId: "account-1",
        accountName: serviceCredentialAccount.name,
        label: "Codex",
        secret: "service-credential-secret",
        baseUrl: "https://runtime.example.invalid",
        service: "codex",
        capabilities: expect.objectContaining({
          rotate: true,
          updateToken: false,
          deleteToken: false,
        }),
      }),
    ])
    expect(fetchServiceCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "account-1",
        auth: REQUEST.auth,
        baseUrl: "https://runtime.example.invalid",
      }),
    )
    expect(fetchTokens).not.toHaveBeenCalled()
  })

  it("keeps runtime key loading on key management when token inventory is supported", async () => {
    fetchTokens.mockResolvedValueOnce([
      { id: 1, key: "sk-test", status: 1, name: "Primary token" },
    ])

    await expect(
      fetchDisplayAccountRuntimeKeys(ACCOUNT as any),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "account_token:account-1:1",
        source: "account_token",
        accountId: "account-1",
        accountName: ACCOUNT.name,
        label: "Primary token",
        secret: "sk-test",
        tokenId: 1,
        token: expect.objectContaining({
          id: 1,
          key: "sk-test",
          accountId: ACCOUNT.id,
          accountName: ACCOUNT.name,
        }),
      }),
    ])

    expect(fetchTokens).toHaveBeenCalledWith(expect.objectContaining(REQUEST))
    expect(fetchServiceCredential).not.toHaveBeenCalled()
  })

  it("builds a request-only context from a display account snapshot", () => {
    expect(createDisplayAccountRequestContext(ACCOUNT as any)).toEqual({
      accountId: "account-1",
      siteType: "new-api",
      request: expect.objectContaining(REQUEST),
    })
    expect(
      createDisplayAccountRequestContext(ACCOUNT as any),
    ).not.toHaveProperty("adapter")
    expect(
      createDisplayAccountRequestContext(ACCOUNT as any).request,
    ).not.toHaveProperty("cookieAuthSessionCookie")
  })

  it("fetches invite links through the site invite-link capability", async () => {
    fetchInviteLink.mockResolvedValueOnce(
      "https://example.com/register?aff=invite-code",
    )

    await expect(fetchDisplayAccountInviteLink(ACCOUNT as any)).resolves.toBe(
      "https://example.com/register?aff=invite-code",
    )

    expect(fetchInviteLink).toHaveBeenCalledWith({
      request: expect.objectContaining(REQUEST),
    })
  })

  it("fetches available models through the site key-management capability", async () => {
    fetchAvailableModels.mockResolvedValueOnce(["example-model"])

    await expect(
      fetchDisplayAccountAvailableModels(ACCOUNT as any),
    ).resolves.toEqual(["example-model"])

    expect(fetchAvailableModels).toHaveBeenCalledWith(
      expect.objectContaining(REQUEST),
    )
  })

  it("bounds model discovery even when a provider ignores cancellation", async () => {
    vi.useFakeTimers()
    fetchAvailableModels.mockImplementationOnce(
      () => new Promise<string[]>(() => {}),
    )

    const requestSettled = fetchDisplayAccountAvailableModels(ACCOUNT as any, {
      requestTimeoutMs: 1_000,
    })
    const timeoutExpectation = expect(requestSettled).rejects.toMatchObject({
      name: "TimeoutError",
    })

    await vi.advanceTimersByTimeAsync(1_000)

    await timeoutExpectation
    expect(fetchAvailableModels).toHaveBeenCalledWith(
      expect.objectContaining({
        ...REQUEST,
        abortSignal: expect.any(AbortSignal),
        requestTimeoutMs: 1_000,
      }),
    )
  })

  it("normalizes provider failures at the display-account invite-link boundary", async () => {
    const providerError = new ApiError(
      "Session expired",
      401,
      "/api/user/aff",
      API_ERROR_CODES.HTTP_401,
    )
    fetchInviteLink.mockRejectedValueOnce(providerError)

    await expect(
      fetchDisplayAccountInviteLink(ACCOUNT as any),
    ).rejects.toMatchObject({
      reason: INVITE_LINK_FAILURE_REASONS.AuthenticationRequired,
      cause: providerError,
    })
  })

  it("forwards invite-link request controls through the API request context", async () => {
    const controller = new AbortController()
    fetchInviteLink.mockResolvedValueOnce(
      "https://example.com/register?aff=invite-code",
    )

    await fetchDisplayAccountInviteLink(ACCOUNT as any, {
      abortSignal: controller.signal,
      requestTimeoutMs: 1_000,
    })

    expect(fetchInviteLink).toHaveBeenCalledWith({
      request: expect.objectContaining({
        ...REQUEST,
        abortSignal: expect.any(AbortSignal),
        abortDeadline: expect.objectContaining({
          signal: expect.any(AbortSignal),
          start: expect.any(Function),
        }),
        requestTimeoutMs: 1_000,
      }),
    })
  })

  it("uses one invite-link deadline starting at the first provider dispatch", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    let dispatchRequest: (() => void) | undefined
    let receivedSignal: AbortSignal | undefined
    let requestError: unknown

    fetchInviteLink.mockImplementationOnce(
      async ({ request }: { request: Record<string, any> }) => {
        await new Promise<void>((resolve) => {
          dispatchRequest = () => {
            dispatchRequest = undefined
            resolve()
          }
        })
        request.abortDeadline.start()
        receivedSignal = request.abortSignal
        await new Promise<void>((resolve) => setTimeout(resolve, 900))
        request.abortDeadline.start()

        return await new Promise<string>((_resolve, reject) => {
          request.abortSignal.addEventListener(
            "abort",
            () => reject(request.abortSignal.reason),
            { once: true },
          )
        })
      },
    )

    const requestSettled = fetchDisplayAccountInviteLink(ACCOUNT as any, {
      abortSignal: controller.signal,
      requestTimeoutMs: 1_000,
    }).then(
      () => undefined,
      (error) => {
        requestError = error
      },
    )

    try {
      await vi.advanceTimersByTimeAsync(5_000)
      expect(receivedSignal).toBeUndefined()

      dispatchRequest?.()
      await vi.advanceTimersByTimeAsync(999)
      expect(receivedSignal?.aborted).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      await requestSettled
      expect(receivedSignal?.aborted).toBe(true)
      expect(requestError).toMatchObject({
        reason: INVITE_LINK_FAILURE_REASONS.Timeout,
      })
    } finally {
      dispatchRequest?.()
      controller.abort()
      await requestSettled
    }
  })

  it("keeps cookie-auth sessions in request auth for display snapshots", () => {
    const context = createDisplayAccountRequestContext({
      ...ACCOUNT,
      authType: AuthTypeEnum.Cookie,
      token: "",
      cookieAuthSessionCookie: "session=abc",
    } as any)

    expect(context.request).toEqual(
      expect.objectContaining({
        accountId: "account-1",
        auth: expect.objectContaining({
          authType: AuthTypeEnum.Cookie,
          cookie: "session=abc",
        }),
      }),
    )
  })

  it("keeps provider business rejections out of the user-facing message", async () => {
    const providerError = new ApiError(
      "deployment-specific policy detail",
      403,
      "/api/user/aff",
      API_ERROR_CODES.BUSINESS_ERROR,
    )
    fetchInviteLink.mockRejectedValueOnce(providerError)

    await expect(
      fetchDisplayAccountInviteLink(ACCOUNT as any),
    ).rejects.toMatchObject({
      message: INVITE_LINK_FAILURE_REASONS.ProviderRejected,
      reason: INVITE_LINK_FAILURE_REASONS.ProviderRejected,
      cause: providerError,
    })
  })

  it("rejects display account snapshots without a stable id", () => {
    expect(() =>
      createDisplayAccountRequestContext({
        ...ACCOUNT,
        id: "   ",
      } as any),
    ).toThrow("account_api_context_missing_account_id")
  })

  it.each([
    [
      "base URL",
      { baseUrl: "   " },
      "MISSING_BASE_URL",
      "account_api_context_missing_base_url",
    ],
    [
      "user id",
      { userId: "   " },
      "MISSING_USER_ID",
      "account_api_context_missing_user_id",
    ],
    [
      "access-token credential",
      { token: "   " },
      "MISSING_CREDENTIAL",
      "account_api_context_missing_credential",
    ],
    [
      "cookie credential",
      {
        authType: AuthTypeEnum.Cookie,
        token: "   ",
        cookieAuthSessionCookie: "   ",
      },
      "MISSING_CREDENTIAL",
      "account_api_context_missing_credential",
    ],
  ])(
    "rejects display account snapshots with a blank %s",
    (_label, overrides, code, message) => {
      expect(() =>
        createDisplayAccountRequestContext({
          ...ACCOUNT,
          ...overrides,
        } as any),
      ).toThrow(
        expect.objectContaining({
          name: "StoredAccountApiContextError",
          code,
          message,
        }),
      )
    },
  )

  it("resolves stored account context from the latest persisted account", async () => {
    mockGetAccountById.mockResolvedValueOnce(
      buildStoredAccount({
        account_info: {
          id: "stored-user",
          username: "Latest",
          access_token: "stored-token",
        },
      }),
    )

    await expect(resolveStoredAccountApiContext("account-1")).resolves.toEqual({
      accountId: "account-1",
      siteType: "new-api",
      request: expect.objectContaining({
        baseUrl: "https://example.com",
        accountId: "account-1",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "stored-user",
          accessToken: "stored-token",
          cookie: undefined,
        },
      }),
    })
    expect(mockGetAccountById).toHaveBeenCalledWith("account-1")
  })

  it("preserves stored cookie-auth session in request auth", async () => {
    mockGetAccountById.mockResolvedValueOnce(
      buildStoredAccount({
        authType: AuthTypeEnum.Cookie,
        account_info: {
          id: "stored-user",
          username: "Latest",
          access_token: "",
        },
        cookieAuth: {
          sessionCookie: "session=stored",
        },
      }),
    )

    const context = await resolveStoredAccountApiContext("account-1")

    expect(context.request).toEqual(
      expect.objectContaining({
        accountId: "account-1",
        auth: expect.objectContaining({
          authType: AuthTypeEnum.Cookie,
          userId: "stored-user",
          accessToken: "",
          cookie: "session=stored",
        }),
      }),
    )
    expect(context.request).not.toHaveProperty("cookieAuthSessionCookie")
  })

  it("decorates stored Sub2API contexts with the account auth session port", async () => {
    mockGetAccountById.mockResolvedValueOnce(
      buildStoredAccount({
        site_type: SITE_TYPES.SUB2API,
      }),
    )

    const context = await resolveStoredAccountApiContext("account-1")

    expect(context.siteType).toBe(SITE_TYPES.SUB2API)
    expect(context.request).toEqual(
      expect.objectContaining({
        sub2apiAuthSession: accountSub2ApiAuthSession,
      }),
    )
  })

  it("throws a stable error when the stored account id is blank", async () => {
    await expect(resolveStoredAccountApiContext("   ")).rejects.toMatchObject({
      name: "StoredAccountApiContextError",
      code: "MISSING_ACCOUNT_ID",
      message: "account_api_context_missing_account_id",
    })
    expect(mockGetAccountById).not.toHaveBeenCalled()
  })

  it("throws a stable error when the stored account no longer exists", async () => {
    mockGetAccountById.mockResolvedValueOnce(null)

    await expect(
      resolveStoredAccountApiContext("missing"),
    ).rejects.toMatchObject({
      name: "StoredAccountApiContextError",
      code: "ACCOUNT_NOT_FOUND",
      message: "account_api_context_account_not_found",
    })
  })

  it("throws a stable error when a stored account has a blank id", () => {
    expect(() =>
      createAccountApiRequestFromStoredAccount(
        buildStoredAccount({
          id: "   ",
        }) as any,
      ),
    ).toThrow(
      expect.objectContaining({
        name: "StoredAccountApiContextError",
        code: "MISSING_ACCOUNT_ID",
        message: "account_api_context_missing_account_id",
      }),
    )
  })

  it("throws a stable error when a stored account has a blank base URL", () => {
    expect(() =>
      createAccountApiRequestFromStoredAccount(
        buildStoredAccount({
          site_url: "   ",
        }) as any,
      ),
    ).toThrow(
      expect.objectContaining({
        name: "StoredAccountApiContextError",
        code: "MISSING_BASE_URL",
        message: "account_api_context_missing_base_url",
      }),
    )
  })

  it("throws a stable error when a stored account has a blank user id", () => {
    expect(() =>
      createAccountApiRequestFromStoredAccount(
        buildStoredAccount({
          account_info: {
            id: "   ",
            username: "Ada",
            access_token: "token",
          },
        }) as any,
      ),
    ).toThrow(
      expect.objectContaining({
        name: "StoredAccountApiContextError",
        code: "MISSING_USER_ID",
        message: "account_api_context_missing_user_id",
      }),
    )
  })

  it("throws a stable error when an access-token stored account has a blank credential", () => {
    expect(() =>
      createAccountApiRequestFromStoredAccount(
        buildStoredAccount({
          account_info: {
            id: "1",
            username: "Ada",
            access_token: "   ",
          },
        }) as any,
      ),
    ).toThrow(
      expect.objectContaining({
        name: "StoredAccountApiContextError",
        code: "MISSING_CREDENTIAL",
        message: "account_api_context_missing_credential",
      }),
    )
  })

  it("throws a stable error when a cookie stored account has no credential", () => {
    expect(() =>
      createAccountApiRequestFromStoredAccount(
        buildStoredAccount({
          authType: AuthTypeEnum.Cookie,
          account_info: {
            id: "1",
            username: "Ada",
            access_token: "   ",
          },
          cookieAuth: undefined,
        }) as any,
      ),
    ).toThrow(
      expect.objectContaining({
        name: "StoredAccountApiContextError",
        code: "MISSING_CREDENTIAL",
        message: "account_api_context_missing_credential",
      }),
    )
  })

  it("throws a stable error when a stored account has no supported auth type", () => {
    expect(() =>
      createAccountApiRequestFromStoredAccount(
        buildStoredAccount({
          authType: AuthTypeEnum.None,
        }) as any,
      ),
    ).toThrow(
      expect.objectContaining({
        name: "StoredAccountApiContextError",
        code: "MISSING_CREDENTIAL",
        message: "account_api_context_missing_credential",
      }),
    )
  })

  it("exposes StoredAccountApiContextError for caller recovery checks", () => {
    expect(
      new StoredAccountApiContextError(
        "MISSING_CREDENTIAL",
        "account_api_context_missing_credential",
      ),
    ).toMatchObject({
      name: "StoredAccountApiContextError",
      code: "MISSING_CREDENTIAL",
      message: "account_api_context_missing_credential",
    })
  })

  it("keeps non-Sub2API account-scoped requests transport-only", async () => {
    fetchTokens.mockResolvedValue([])

    await fetchDisplayAccountTokens(ACCOUNT as any)

    const request = fetchTokens.mock.calls[0]?.[0] as Record<string, unknown>
    expect(request).toEqual(expect.objectContaining(REQUEST))
    expect(request).not.toHaveProperty("accountAuthStore")
    expect(request).not.toHaveProperty("sub2apiAuthSession")
  })

  it("adds an auth session only when the account site profile permits it", async () => {
    const sub2apiAccount = {
      ...ACCOUNT,
      siteType: SITE_TYPES.SUB2API,
    }
    fetchTokens.mockResolvedValue([])

    await fetchDisplayAccountTokens(sub2apiAccount as any)

    const request = fetchTokens.mock.calls[0]?.[0] as Record<string, unknown>
    expect(request).toEqual(expect.objectContaining(REQUEST))
    expect(request).not.toHaveProperty("accountAuthStore")
    expect(request.sub2apiAuthSession).toBe(accountSub2ApiAuthSession)
    expect(
      createDisplayAccountApiContext(sub2apiAccount as any).request,
    ).toEqual(
      expect.objectContaining({
        ...REQUEST,
        sub2apiAuthSession: accountSub2ApiAuthSession,
      }),
    )
  })

  it("throws InvalidTokenPayloadError when the API payload is not an array", async () => {
    fetchTokens.mockResolvedValue({ items: [] })

    await expect(
      fetchDisplayAccountTokens(ACCOUNT as any),
    ).rejects.toBeInstanceOf(InvalidTokenPayloadError)

    try {
      await fetchDisplayAccountTokens(ACCOUNT as any)
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTokenPayloadError)
      if (!(error instanceof InvalidTokenPayloadError)) {
        throw error
      }

      expect(error.accountId).toBe("account-1")
      expect(error.baseUrl).toBe("https://example.com")
      expect(error.siteType).toBe("new-api")
      expect(error.responseType).toBe("object")
    }
  })

  it("keeps invalid token payload errors user-safe while exposing diagnostic log context", () => {
    const error = new InvalidTokenPayloadError({
      accountId: "account-1",
      baseUrl: "https://example.com",
      siteType: "new-api",
      responseType: "object",
    })

    expect(getRuntimeKeyInventoryErrorMessage(error, "fallback")).toBe(
      "fallback",
    )
    expect(getInvalidTokenPayloadLogContext(error)).toEqual({
      payloadAccountId: "account-1",
      payloadBaseUrl: "https://example.com",
      payloadSiteType: "new-api",
      payloadResponseType: "object",
    })
  })

  it("preserves ordinary runtime key inventory error messages without payload diagnostics", () => {
    const error = new Error("network failed")

    expect(getRuntimeKeyInventoryErrorMessage(error, "fallback")).toBe(
      "network failed",
    )
    expect(getInvalidTokenPayloadLogContext(error)).toEqual({})
  })

  it("returns the original token object when the resolved secret key is unchanged", async () => {
    const token = { id: 1, key: "sk-test", status: 1 }
    resolveTokenKey.mockResolvedValue("sk-test")

    const result = await resolveDisplayAccountTokenForSecret(
      ACCOUNT as any,
      token as any,
    )

    expect(result).toBe(token)
    expect(resolveTokenKey).toHaveBeenCalledWith({
      request: expect.objectContaining(REQUEST),
      token,
    })
  })

  it("clones the token when the resolved secret key differs from the masked key", async () => {
    const token = { id: 1, key: "sk-masked", status: 1, name: "Masked" }
    resolveTokenKey.mockResolvedValue("sk-real")

    const result = await resolveDisplayAccountTokenForSecret(
      ACCOUNT as any,
      token as any,
    )

    expect(result).toEqual({
      id: 1,
      key: "sk-real",
      status: 1,
      name: "Masked",
    })
    expect(result).not.toBe(token)
    expect(resolveTokenKey).toHaveBeenCalledWith({
      request: expect.objectContaining(REQUEST),
      token,
    })
  })

  it("passes abort and protection-bypass context to token secret resolution requests", async () => {
    const token = { id: 1, key: "sk-masked", status: 1, name: "Masked" }
    const abortController = new AbortController()
    const protectionBypassExecution = {
      version: PROTECTION_BYPASS_EXECUTION_VERSION,
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
      command: PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
      surface: PROTECTION_BYPASS_SURFACES.Options,
    } as const
    resolveTokenKey.mockResolvedValue("sk-real")

    await resolveDisplayAccountTokenForSecret(ACCOUNT as any, token as any, {
      abortSignal: abortController.signal,
      protectionBypassExecution,
    })

    expect(resolveTokenKey).toHaveBeenCalledWith({
      request: expect.objectContaining({
        ...REQUEST,
        abortSignal: abortController.signal,
        protectionBypassExecution,
      }),
      token,
    })
    const request = resolveTokenKey.mock.calls[0]?.[0]?.request
    expect(request).not.toHaveProperty("tempWindowRequestSource")
    expect(request.protectionBypassExecution).toBe(protectionBypassExecution)
  })

  it("resolves singleton service credential runtime tokens without key management", async () => {
    capabilities = {
      siteType: SITE_TYPES.SHAREDCHAT,
      account: {
        serviceCredential: {
          fetch: fetchServiceCredential,
        },
      },
    }
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(capabilities as any)
    fetchServiceCredential.mockResolvedValueOnce({
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "sk-sharedchat-codex",
      isAuthenticated: true,
    })

    await expect(
      resolveDisplayAccountTokenForSecret(
        {
          ...ACCOUNT,
          siteType: SITE_TYPES.SHAREDCHAT,
        } as any,
        { id: -1, key: "sk-masked", status: 1, name: "Codex" } as any,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: -1,
        key: "sk-sharedchat-codex",
        name: "Codex",
      }),
    )
    expect(resolveTokenKey).not.toHaveBeenCalled()
    expect(fetchServiceCredential).toHaveBeenCalledWith(
      expect.objectContaining(REQUEST),
    )
  })

  it("resolves service credential runtime key secrets through serviceCredential fetch", async () => {
    const serviceCredentialAccount = {
      ...ACCOUNT,
      siteType: SITE_TYPES.SHAREDCHAT,
      baseUrl: "https://runtime.example.invalid",
    }
    capabilities = {
      siteType: SITE_TYPES.SHAREDCHAT,
      account: {
        serviceCredential: {
          fetch: fetchServiceCredential,
        },
      },
    }
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(capabilities as any)
    fetchServiceCredential.mockResolvedValueOnce({
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "service-credential-secret",
      isAuthenticated: true,
    })
    const [runtimeKey] = await fetchDisplayAccountRuntimeKeys(
      serviceCredentialAccount as any,
    )

    fetchServiceCredential.mockResolvedValueOnce({
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "fresh-service-secret",
      isAuthenticated: true,
    })

    await expect(
      resolveDisplayAccountRuntimeKeySecret(
        serviceCredentialAccount as any,
        runtimeKey,
      ),
    ).resolves.toMatchObject({
      ...runtimeKey,
      credential: expect.objectContaining({
        key: "fresh-service-secret",
      }),
      secret: "fresh-service-secret",
    })
  })

  it("resolves inactive service credential runtime keys with refreshed base URL", async () => {
    const serviceCredentialAccount = {
      ...ACCOUNT,
      siteType: SITE_TYPES.SHAREDCHAT,
      baseUrl: "https://runtime.example.invalid",
    }
    capabilities = {
      siteType: SITE_TYPES.SHAREDCHAT,
      account: {
        serviceCredential: {
          fetch: fetchServiceCredential,
        },
      },
    }
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(capabilities as any)
    fetchServiceCredential.mockResolvedValueOnce({
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "service-credential-secret",
      isAuthenticated: true,
      baseUrl: "https://initial-runtime.example.invalid",
    })
    const [runtimeKey] = await fetchDisplayAccountRuntimeKeys(
      serviceCredentialAccount as any,
    )

    fetchServiceCredential.mockResolvedValueOnce({
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "stale-service-secret",
      isAuthenticated: false,
      baseUrl: "https://fresh-runtime.example.invalid",
    })

    await expect(
      resolveDisplayAccountRuntimeKeySecret(
        serviceCredentialAccount as any,
        runtimeKey,
      ),
    ).resolves.toMatchObject({
      ...runtimeKey,
      baseUrl: "https://fresh-runtime.example.invalid",
      credential: expect.objectContaining({
        key: "stale-service-secret",
        isAuthenticated: false,
        baseUrl: "https://fresh-runtime.example.invalid",
      }),
      secret: "",
      status: "inactive",
    })
  })

  it("automatically resolves create-response-only resource keys from an associated profile", async () => {
    const open = vi.fn()
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.OPENROUTER,
      account: {
        keyResourceManagement: {
          inventorySecretAvailability:
            INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
          open,
        },
      },
    } as any)
    vi.mocked(resolveAssociatedProfileSecret).mockResolvedValue({
      status: "resolved",
      secret: "associated-secret",
      profile: {
        id: "profile-example",
        name: "Example credential",
        apiType: "openai-compatible",
        baseUrl: "https://api.example.invalid/v1",
        apiKey: "associated-secret",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    } as any)
    const runtimeKey = buildAccountKeyResourceRuntimeKey(
      { ...ACCOUNT, siteType: SITE_TYPES.OPENROUTER } as any,
      {
        ref: {
          accountId: ACCOUNT.id,
          siteType: SITE_TYPES.OPENROUTER,
          scopeKey: "workspace-example",
          resourceId: "resource-example",
        },
        label: "Example key",
        secret: "",
      },
    )

    await expect(
      resolveDisplayAccountRuntimeKeySecret(
        { ...ACCOUNT, siteType: SITE_TYPES.OPENROUTER } as any,
        runtimeKey,
      ),
    ).resolves.toMatchObject({
      baseUrl: "https://api.example.invalid/v1",
      secret: "associated-secret",
      status: "active",
    })
    expect(open).not.toHaveBeenCalled()
  })

  it("keeps provider resolution authoritative for recoverable resource keys", async () => {
    const resolve = vi.fn().mockResolvedValue({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: "provider-secret",
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      account: {
        keyResourceManagement: {
          open: vi.fn().mockResolvedValue({ runtimeKey: { resolve } }),
        },
      },
    } as any)
    vi.mocked(resolveAssociatedProfileSecret).mockResolvedValue({
      status: "resolved",
      secret: "associated-secret",
      profile: { baseUrl: "https://associated.example.invalid" },
    } as any)
    const runtimeKey = buildAccountKeyResourceRuntimeKey(ACCOUNT as any, {
      ref: {
        accountId: ACCOUNT.id,
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "account",
        resourceId: "resource-example",
      },
      label: "Example key",
      secret: "",
    })

    await expect(
      resolveDisplayAccountRuntimeKeySecret(ACCOUNT as any, runtimeKey),
    ).resolves.toMatchObject({ secret: "sk-provider-secret" })
    expect(resolveAssociatedProfileSecret).not.toHaveBeenCalled()
  })

  it("uses an associated resource secret only after explicit provider fallback", async () => {
    const resolve = vi.fn().mockResolvedValue({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: { code: "not-found" },
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      account: {
        keyResourceManagement: {
          open: vi.fn().mockResolvedValue({ runtimeKey: { resolve } }),
        },
      },
    } as any)
    vi.mocked(resolveAssociatedProfileSecret).mockResolvedValue({
      status: "resolved",
      secret: "associated-secret",
      profile: { baseUrl: "https://associated.example.invalid" },
    } as any)
    const runtimeKey = buildAccountKeyResourceRuntimeKey(ACCOUNT as any, {
      ref: {
        accountId: ACCOUNT.id,
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "account",
        resourceId: "resource-example",
      },
      label: "Example key",
      secret: "",
    })

    await expect(
      resolveDisplayAccountRuntimeKeySecret(ACCOUNT as any, runtimeKey, {
        secretSource:
          ACCOUNT_RUNTIME_KEY_SECRET_SOURCES.ProviderThenAssociatedProfile,
      }),
    ).resolves.toMatchObject({
      baseUrl: "https://associated.example.invalid",
      secret: "sk-associated-secret",
    })
  })

  it("returns a transient sk-prefixed secret for optional-prefix compatible account types", async () => {
    const token = { id: 1, key: "plain-secret", status: 1, name: "Plain" }
    resolveTokenKey.mockResolvedValue("plain-secret")

    const result = await resolveDisplayAccountTokenForSecret(
      { ...ACCOUNT, siteType: "Veloera" } as any,
      token as any,
    )

    expect(result).toEqual({
      id: 1,
      key: "sk-plain-secret",
      status: 1,
      name: "Plain",
    })
    expect(result).not.toBe(token)
    expect(token.key).toBe("plain-secret")
  })

  it("does not synthesize sk-prefixes for non-compatible account types", async () => {
    const token = { id: 1, key: "plain-secret", status: 1, name: "Plain" }
    resolveTokenKey.mockResolvedValue("plain-secret")

    const result = await resolveDisplayAccountTokenForSecret(
      { ...ACCOUNT, siteType: "sub2api" } as any,
      token as any,
    )

    expect(result).toBe(token)
  })

  it("uses an already usable export token without resolving the account context", async () => {
    const token = { id: 1, key: "plain-secret", status: 1, name: "Plain" }

    const result = await resolveExportTokenForSecret(
      { ...ACCOUNT, siteType: "Veloera" } as any,
      token as any,
    )

    expect(result).toEqual({
      id: 1,
      key: "sk-plain-secret",
      status: 1,
      name: "Plain",
    })
    expect(resolveTokenKey).not.toHaveBeenCalled()
  })

  it("resolves export tokens when the current key is masked", async () => {
    const token = {
      id: 1,
      key: "sk-abcd************wxyz",
      status: 1,
      name: "Masked",
    }
    resolveTokenKey.mockResolvedValue("sk-real")

    const result = await resolveExportTokenForSecret(
      ACCOUNT as any,
      token as any,
    )

    expect(result).toEqual({
      id: 1,
      key: "sk-real",
      status: 1,
      name: "Masked",
    })
    expect(resolveTokenKey).toHaveBeenCalledWith({
      request: expect.objectContaining(REQUEST),
      token,
    })
  })

  it("uses an associated profile for create-response-only account tokens", async () => {
    capabilities = {
      siteType: SITE_TYPES.AIHUBMIX,
      account: {
        keyManagement: {
          ...keyManagement,
          inventorySecretAvailability:
            INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
        },
      },
    }
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(capabilities as any)
    vi.mocked(resolveAssociatedProfileSecret).mockResolvedValue({
      status: "resolved",
      secret: "profile-secret",
      profile: { baseUrl: "https://api.example.invalid/v1" },
    } as any)
    const token = {
      id: 42,
      key: "sk-abcd********wxyz",
      status: 1,
      name: "Create-only",
    }

    await expect(
      resolveDisplayAccountTokenForSecret(
        { ...ACCOUNT, siteType: SITE_TYPES.AIHUBMIX } as any,
        token as any,
      ),
    ).resolves.toMatchObject({ key: "profile-secret" })
    expect(resolveTokenKey).not.toHaveBeenCalled()
  })

  it("supports explicit associated-profile token resolution and reports missing links", async () => {
    const token = {
      id: 42,
      key: "sk-masked********",
      status: 1,
      name: "Associated",
    }
    vi.mocked(resolveAssociatedProfileSecret).mockResolvedValueOnce({
      status: "resolved",
      secret: "associated-secret",
      profile: { baseUrl: "https://associated.example.invalid" },
    } as any)

    await expect(
      resolveDisplayAccountTokenForSecret(ACCOUNT as any, token as any, {
        secretSource: ACCOUNT_RUNTIME_KEY_SECRET_SOURCES.AssociatedProfile,
      }),
    ).resolves.toMatchObject({ key: "sk-associated-secret" })

    vi.mocked(resolveAssociatedProfileSecret).mockResolvedValueOnce({
      status: "not-found",
    } as any)
    await expect(
      resolveDisplayAccountTokenForSecret(ACCOUNT as any, token as any, {
        secretSource: ACCOUNT_RUNTIME_KEY_SECRET_SOURCES.AssociatedProfile,
      }),
    ).rejects.toThrow("account_runtime_key_secret_unavailable:not-found")
  })

  it("falls back from token provider resolution without hiding the original failure", async () => {
    const token = {
      id: 43,
      key: "sk-masked********",
      status: 1,
      name: "Fallback",
    }
    resolveTokenKey.mockRejectedValueOnce(new Error("provider unavailable"))
    vi.mocked(resolveAssociatedProfileSecret).mockResolvedValueOnce({
      status: "resolved",
      secret: "associated-fallback-secret",
      profile: { baseUrl: "https://associated.example.invalid" },
    } as any)

    await expect(
      resolveDisplayAccountTokenForSecret(ACCOUNT as any, token as any, {
        secretSource:
          ACCOUNT_RUNTIME_KEY_SECRET_SOURCES.ProviderThenAssociatedProfile,
      }),
    ).resolves.toMatchObject({ key: "sk-associated-fallback-secret" })

    const providerError = new Error("original provider failure")
    resolveTokenKey.mockRejectedValueOnce(providerError)
    vi.mocked(resolveAssociatedProfileSecret).mockResolvedValueOnce({
      status: "not-found",
    } as any)
    await expect(
      resolveDisplayAccountTokenForSecret(ACCOUNT as any, token as any, {
        secretSource:
          ACCOUNT_RUNTIME_KEY_SECRET_SOURCES.ProviderThenAssociatedProfile,
      }),
    ).rejects.toBe(providerError)
  })

  it("keeps a newly created full secret for create-response-only account tokens", async () => {
    capabilities = {
      siteType: SITE_TYPES.AIHUBMIX,
      account: {
        keyManagement: {
          ...keyManagement,
          inventorySecretAvailability:
            INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
        },
      },
    }
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(capabilities as any)
    const token = {
      id: 42,
      key: "sk-created-one-time-secret",
      status: 1,
      name: "Create-only",
    }

    await expect(
      resolveDisplayAccountTokenForSecret(
        { ...ACCOUNT, siteType: SITE_TYPES.AIHUBMIX } as any,
        token as any,
      ),
    ).resolves.toBe(token)
    expect(resolveAssociatedProfileSecret).not.toHaveBeenCalled()
    expect(resolveTokenKey).not.toHaveBeenCalled()
  })

  it("reports unavailable native resource resolution boundaries", async () => {
    const resourceAccount = {
      ...ACCOUNT,
      siteType: SITE_TYPES.OPENROUTER,
    }
    const runtimeKey = buildAccountKeyResourceRuntimeKey(
      resourceAccount as any,
      {
        ref: {
          accountId: ACCOUNT.id,
          siteType: SITE_TYPES.OPENROUTER,
          scopeKey: "workspace-example",
          resourceId: "resource-example",
        },
        label: "Example resource",
        secret: "",
      },
    )

    vi.mocked(getSiteTypeCapabilities).mockReturnValueOnce({
      siteType: SITE_TYPES.OPENROUTER,
      account: {},
    } as any)
    await expect(
      resolveDisplayAccountRuntimeKeySecret(
        resourceAccount as any,
        runtimeKey,
        { secretSource: ACCOUNT_RUNTIME_KEY_SECRET_SOURCES.Provider },
      ),
    ).rejects.toThrow(
      "account_runtime_key_secret_unavailable:provider-capability-unavailable",
    )

    vi.mocked(getSiteTypeCapabilities).mockReturnValueOnce({
      siteType: SITE_TYPES.OPENROUTER,
      account: {
        keyResourceManagement: {
          open: vi.fn().mockResolvedValue({}),
        },
      },
    } as any)
    await expect(
      resolveDisplayAccountRuntimeKeySecret(
        resourceAccount as any,
        runtimeKey,
        { secretSource: ACCOUNT_RUNTIME_KEY_SECRET_SOURCES.Provider },
      ),
    ).rejects.toThrow(
      "account_runtime_key_secret_unavailable:provider-resolution-unavailable",
    )

    const abortController = new AbortController()
    const resolve = vi.fn().mockResolvedValue({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: " ",
    })
    const open = vi.fn().mockResolvedValue({ runtimeKey: { resolve } })
    vi.mocked(getSiteTypeCapabilities).mockReturnValueOnce({
      siteType: SITE_TYPES.OPENROUTER,
      account: { keyResourceManagement: { open } },
    } as any)
    await expect(
      resolveDisplayAccountRuntimeKeySecret(
        resourceAccount as any,
        runtimeKey,
        {
          abortSignal: abortController.signal,
          secretSource: ACCOUNT_RUNTIME_KEY_SECRET_SOURCES.Provider,
        },
      ),
    ).rejects.toThrow(
      "account_runtime_key_secret_unavailable:empty-provider-secret",
    )
    expect(open).toHaveBeenCalledWith(expect.anything(), {
      signal: abortController.signal,
    })
    expect(resolve).toHaveBeenCalledWith(runtimeKey.resourceRef, {
      signal: abortController.signal,
    })
  })

  it("keeps native provider-first resolution authoritative when fallback also fails", async () => {
    const resolve = vi.fn().mockResolvedValueOnce({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: "provider-secret",
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      account: {
        keyResourceManagement: {
          open: vi.fn().mockResolvedValue({ runtimeKey: { resolve } }),
        },
      },
    } as any)
    const runtimeKey = buildAccountKeyResourceRuntimeKey(ACCOUNT as any, {
      ref: {
        accountId: ACCOUNT.id,
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "account",
        resourceId: "resource-provider-first",
      },
      label: "Provider-first key",
      secret: "",
    })

    await expect(
      resolveDisplayAccountRuntimeKeySecret(ACCOUNT as any, runtimeKey, {
        secretSource:
          ACCOUNT_RUNTIME_KEY_SECRET_SOURCES.ProviderThenAssociatedProfile,
      }),
    ).resolves.toMatchObject({ secret: "sk-provider-secret" })

    const providerError = new Error("provider resolution failed")
    resolve.mockRejectedValueOnce(providerError)
    vi.mocked(resolveAssociatedProfileSecret).mockResolvedValueOnce({
      status: "not-found",
    } as any)
    await expect(
      resolveDisplayAccountRuntimeKeySecret(ACCOUNT as any, runtimeKey, {
        secretSource:
          ACCOUNT_RUNTIME_KEY_SECRET_SOURCES.ProviderThenAssociatedProfile,
      }),
    ).rejects.toBe(providerError)
  })

  it("resolves account-token runtime key secrets without double-formatting optional prefixes", async () => {
    const token = { id: 1, key: "plain-secret", status: 1, name: "Plain" }
    const runtimeKey = buildAccountTokenRuntimeKey(
      { ...ACCOUNT, siteType: "Veloera" } as any,
      {
        ...token,
        accountId: ACCOUNT.id,
        accountName: ACCOUNT.name,
      } as any,
    )
    resolveTokenKey.mockResolvedValue("plain-secret")

    const result = await resolveDisplayAccountRuntimeKeySecret(
      { ...ACCOUNT, siteType: "Veloera" } as any,
      runtimeKey,
    )

    expect(result.secret).toBe("sk-plain-secret")
    expect(result.token.key).toBe("sk-plain-secret")
  })

  it("throws when resolving a token secret without key-management or service-credential support", async () => {
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: "unsupported",
    } as any)

    await expect(
      resolveDisplayAccountTokenForSecret(
        {
          ...ACCOUNT,
          siteType: "unsupported",
        } as any,
        { id: 1, key: "sk-masked", status: 1, name: "Masked" } as any,
      ),
    ).rejects.toThrow("keyManagement is not implemented for unsupported")
  })

  it("throws when adapter key management is not implemented", async () => {
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: "unsupported",
    } as any)

    await expect(
      fetchDisplayAccountTokens({
        ...ACCOUNT,
        siteType: "unsupported",
      } as any),
    ).rejects.toThrow("keyManagement is not implemented for unsupported")
  })

  it("throws when adapter token provisioning is not implemented", async () => {
    const { requireDisplayAccountTokenProvisioning } = await import(
      "~/services/accounts/utils/apiServiceRequest"
    )

    expect(() =>
      requireDisplayAccountTokenProvisioning(
        { siteType: "unsupported" } as any,
        undefined,
      ),
    ).toThrow("tokenProvisioning is not implemented for unsupported")
  })

  it("throws when adapter invite-link loading is not implemented", async () => {
    const { requireDisplayAccountInviteLink } = await import(
      "~/services/accounts/utils/apiServiceRequest"
    )

    expect(() =>
      requireDisplayAccountInviteLink(
        { siteType: "unsupported" } as any,
        undefined,
      ),
    ).toThrow("inviteLink is not implemented for unsupported")
  })

  it("only allows token management for enabled accounts with complete auth context", () => {
    expect(canManageDisplayAccountTokens(null)).toBe(false)
    expect(
      canManageDisplayAccountTokens({
        ...ACCOUNT,
        disabled: true,
      } as any),
    ).toBe(false)
    expect(
      canManageDisplayAccountTokens({
        ...ACCOUNT,
        authType: AuthTypeEnum.None,
      } as any),
    ).toBe(false)
    expect(
      canManageDisplayAccountTokens({
        ...ACCOUNT,
        token: "   ",
      } as any),
    ).toBe(false)
    expect(
      canManageDisplayAccountTokens({
        ...ACCOUNT,
        authType: AuthTypeEnum.Cookie,
        token: "",
        cookieAuthSessionCookie: "session=abc",
      } as any),
    ).toBe(true)
    expect(
      canManageDisplayAccountTokens({
        ...ACCOUNT,
        userId: Number.NaN,
      } as any),
    ).toBe(false)

    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: "unsupported",
      account: {},
    } as any)

    expect(
      canManageDisplayAccountTokens({
        ...ACCOUNT,
        siteType: "unsupported",
      } as any),
    ).toBe(false)
  })

  it("only allows token creation when the account has key-management capability", () => {
    expect(canCreateDisplayAccountTokens(null)).toBe(false)
    expect(canCreateDisplayAccountTokens(ACCOUNT as any)).toBe(true)

    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: "unsupported",
      account: {},
    } as any)

    expect(
      canCreateDisplayAccountTokens({
        ...ACCOUNT,
        siteType: "unsupported",
      } as any),
    ).toBe(false)

    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.SHAREDCHAT,
      account: {
        serviceCredential: {
          fetch: fetchServiceCredential,
        },
      },
    } as any)

    expect(
      canCreateDisplayAccountTokens({
        ...ACCOUNT,
        siteType: SITE_TYPES.SHAREDCHAT,
      } as any),
    ).toBe(false)
  })

  it("only allows invite-link loading when the account has capability and valid auth context", () => {
    expect(canFetchDisplayAccountInviteLink(null)).toBe(false)
    expect(canFetchDisplayAccountInviteLink(ACCOUNT as any)).toBe(true)

    expect(
      canFetchDisplayAccountInviteLink({
        ...ACCOUNT,
        disabled: true,
      } as any),
    ).toBe(false)
    expect(
      canFetchDisplayAccountInviteLink({
        ...ACCOUNT,
        token: "   ",
      } as any),
    ).toBe(false)

    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: "unsupported",
      account: {},
    } as any)

    expect(
      canFetchDisplayAccountInviteLink({
        ...ACCOUNT,
        siteType: "unsupported",
      } as any),
    ).toBe(false)
  })
})
