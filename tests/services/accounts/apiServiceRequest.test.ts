import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { accountSub2ApiAuthSession } from "~/services/accounts/sub2apiAuthSession"
import {
  canCreateDisplayAccountTokens,
  canManageDisplayAccountTokens,
  createAccountApiRequestFromStoredAccount,
  createDisplayAccountApiContext,
  createDisplayAccountRequestContext,
  fetchDisplayAccountRuntimeKeys,
  fetchDisplayAccountTokens,
  InvalidTokenPayloadError,
  resolveDisplayAccountTokenForSecret,
  resolveStoredAccountApiContext,
  StoredAccountApiContextError,
} from "~/services/accounts/utils/apiServiceRequest"
import { resolveExportTokenForSecret } from "~/services/accounts/utils/exportTokenSecret"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { AuthTypeEnum } from "~/types"

const { mockGetAccountById } = vi.hoisted(() => ({
  mockGetAccountById: vi.fn(),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn(),
}))

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
  siteType: "new-api",
  baseUrl: "https://example.com",
  authType: AuthTypeEnum.AccessToken,
  userId: "1",
  token: "token",
  cookieAuthSessionCookie: "",
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
    getRepairPolicy: ReturnType<typeof vi.fn>
  }
  let keyManagement: {
    fetchTokens: typeof fetchTokens
    createToken: typeof createToken
    updateToken: typeof updateToken
    resolveTokenKey: typeof resolveTokenKey
    deleteToken: typeof deleteToken
    fetchAvailableModels: typeof fetchAvailableModels
    userGroups: {
      fetch: typeof fetchUserGroups
    }
  }
  let capabilities: {
    siteType: string
    account?: {
      keyManagement?: typeof keyManagement
      serviceCredential?: {
        fetch: typeof fetchServiceCredential
      }
      tokenProvisioning?: typeof tokenProvisioning
    }
  }

  beforeEach(() => {
    fetchTokens = vi.fn()
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
      getRepairPolicy: vi.fn(),
    }
    capabilities = {
      siteType: "new-api",
      account: { keyManagement, tokenProvisioning },
    }

    vi.mocked(getSiteTypeCapabilities).mockReset()
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(capabilities as any)
    mockGetAccountById.mockReset()
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
        request: expect.not.objectContaining({
          accountAuthStore: expect.anything(),
        }),
      }),
    )
  })

  it("returns singleton service credentials as runtime keys when token inventory is unsupported", async () => {
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
      baseUrl: "https://new.sharedchat.cc/codex",
    })

    await expect(
      fetchDisplayAccountRuntimeKeys({
        ...ACCOUNT,
        siteType: SITE_TYPES.SHAREDCHAT,
      } as any),
    ).resolves.toEqual([
      expect.objectContaining({
        id: -1,
        key: "sk-sharedchat-codex",
        name: "Codex",
        status: 1,
      }),
    ])
    expect(fetchServiceCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        ...REQUEST,
      }),
    )
    expect(fetchTokens).not.toHaveBeenCalled()
  })

  it("keeps runtime key loading on key management when token inventory is supported", async () => {
    fetchTokens.mockResolvedValueOnce([{ id: 1, key: "sk-test", status: 1 }])

    await expect(
      fetchDisplayAccountRuntimeKeys(ACCOUNT as any),
    ).resolves.toEqual([{ id: 1, key: "sk-test", status: 1 }])

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

  it("passes abort signals to token secret resolution requests", async () => {
    const token = { id: 1, key: "sk-masked", status: 1, name: "Masked" }
    const abortController = new AbortController()
    resolveTokenKey.mockResolvedValue("sk-real")

    await resolveDisplayAccountTokenForSecret(ACCOUNT as any, token as any, {
      abortSignal: abortController.signal,
    })

    expect(resolveTokenKey).toHaveBeenCalledWith({
      request: expect.objectContaining({
        ...REQUEST,
        abortSignal: abortController.signal,
      }),
      token,
    })
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
})
