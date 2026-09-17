import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { buildAccountKeyResourceRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { accountSub2ApiAuthSession } from "~/services/accounts/sub2apiAuthSession"
import {
  ACCOUNT_RUNTIME_KEY_SECRET_SOURCES,
  canFetchDisplayAccountInviteLink,
  createAccountApiRequestFromStoredAccount,
  createDisplayAccountApiContext,
  createDisplayAccountRequestContext,
  fetchDisplayAccountInviteLink,
  fetchDisplayAccountRuntimeKeys,
  resolveDisplayAccountRuntimeKeySecret,
  StoredAccountApiContextError,
} from "~/services/accounts/utils/apiServiceRequest"
import { ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS } from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { resolveAssociatedProfileSecret } from "~/services/apiCredentialProfiles/accountRuntimeKeyRecovery"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { INVITE_LINK_FAILURE_REASONS } from "~/services/inviteLinks/errors"
import { AuthTypeEnum } from "~/types"

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
  site_type: SITE_TYPES.NEW_API,
  authType: AuthTypeEnum.AccessToken,
  account_info: {
    id: "1",
    username: "Ada",
    access_token: "token",
    quota: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
  cookieAuth: undefined,
  ...overrides,
})

describe("display account API context and native runtime keys", () => {
  let fetchInviteLink: ReturnType<typeof vi.fn>
  let fetchServiceCredential: ReturnType<typeof vi.fn>
  let capabilities: {
    siteType: string
    account?: {
      inviteLink?: { fetchInviteLink: typeof fetchInviteLink }
      serviceCredential?: {
        fetch: typeof fetchServiceCredential
        rotate?: ReturnType<typeof vi.fn>
      }
    }
  }
  beforeEach(() => {
    fetchInviteLink = vi.fn()
    fetchServiceCredential = vi.fn()
    capabilities = {
      siteType: "new-api",
      account: { inviteLink: { fetchInviteLink } },
    }
    vi.mocked(getSiteTypeCapabilities).mockReset()
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(capabilities as any)
    vi.mocked(resolveAssociatedProfileSecret).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("loads native runtime policy without querying the secret resolution", async () => {
    const ref = {
      accountId: ACCOUNT.id,
      siteType: ACCOUNT.siteType,
      scopeKey: "account",
      resourceId: "opaque-key",
    }
    const modelAccess = {
      groups: ["vip"],
      allowedModelIds: ["model-a"],
      suggestedModelIds: ["model-a"],
    }
    const list = vi.fn().mockResolvedValue({
      items: [
        {
          ref,
          displayName: "Native key",
          maskedLabel: "sk-****",
          status: "enabled",
          fields: [],
          actions: { canUpdate: true, canDelete: true },
          runtimeKey: { modelAccess },
        },
      ],
    })
    const resolve = vi.fn()
    const open = vi.fn().mockResolvedValue({
      resolveDefaultScope: async () => ({ scopeKey: "account" }),
      openCollection: async () => ({ list }),
      runtimeKey: { resolve },
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      account: { keyResourceManagement: { open } },
    } as any)
    const keys = await fetchDisplayAccountRuntimeKeys({
      ...ACCOUNT,
      tagIds: [],
    })
    expect(keys).toMatchObject([
      {
        source: "account_key_resource",
        resourceRef: ref,
        label: "Native key",
        status: "active",
        secret: "",
        modelAccess,
      },
    ])
    expect(resolve).not.toHaveBeenCalled()
  })

  it("projects account-native key resources without inventing legacy key management", () => {
    const accountKeyResources = { open: vi.fn() }
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.OPENROUTER,
      account: {
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
      serviceCredential: undefined,
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

  it("builds a request context from the supplied stored account", () => {
    const account = buildStoredAccount({
      account_info: {
        ...buildStoredAccount().account_info,
        id: "stored-user",
        username: "Latest",
        access_token: "stored-token",
      },
    })

    expect(createAccountApiRequestFromStoredAccount(account)).toEqual({
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
  })

  it("preserves stored cookie-auth session in request auth", () => {
    const account = buildStoredAccount({
      authType: AuthTypeEnum.Cookie,
      account_info: {
        ...buildStoredAccount().account_info,
        id: "stored-user",
        username: "Latest",
        access_token: "",
      },
      cookieAuth: {
        sessionCookie: "session=stored",
      },
    })

    const context = createAccountApiRequestFromStoredAccount(account)

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

  it("decorates stored Sub2API contexts with the account auth session port", () => {
    const account = buildStoredAccount({
      site_type: SITE_TYPES.SUB2API,
    })

    const context = createAccountApiRequestFromStoredAccount(account)

    expect(context.siteType).toBe(SITE_TYPES.SUB2API)
    expect(context.request).toEqual(
      expect.objectContaining({
        sub2apiAuthSession: accountSub2ApiAuthSession,
      }),
    )
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

  it("uses an in-hand one-time resource secret before profile lookup or provider recovery", async () => {
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
    const account = { ...ACCOUNT, siteType: SITE_TYPES.OPENROUTER }
    const runtimeKey = buildAccountKeyResourceRuntimeKey(account as any, {
      ref: {
        accountId: ACCOUNT.id,
        siteType: SITE_TYPES.OPENROUTER,
        scopeKey: "account",
        resourceId: "created-key",
      },
      label: "Just created",
      secret: "sk-one-time-secret",
    })
    await expect(
      resolveDisplayAccountRuntimeKeySecret(account as any, runtimeKey),
    ).resolves.toMatchObject({
      secret: "sk-one-time-secret",
      resourceRef: runtimeKey.resourceRef,
    })
    expect(open).not.toHaveBeenCalled()
    expect(resolveAssociatedProfileSecret).not.toHaveBeenCalled()
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

  it("formats the recovered native secret exactly once", async () => {
    const resolve = vi.fn().mockResolvedValue({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: "plain-secret",
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.VELOERA,
      account: {
        keyResourceManagement: {
          open: vi.fn().mockResolvedValue({ runtimeKey: { resolve } }),
        },
      },
    } as any)
    const account = { ...ACCOUNT, siteType: SITE_TYPES.VELOERA } as any
    const runtimeKey = buildAccountKeyResourceRuntimeKey(account, {
      ref: {
        accountId: account.id,
        siteType: account.siteType,
        scopeKey: "account",
        resourceId: "1",
      },
      label: "Plain",
      secret: "",
    })
    const result = await resolveDisplayAccountRuntimeKeySecret(
      account,
      runtimeKey,
    )
    expect(result.secret).toBe("sk-plain-secret")
    expect(resolve).toHaveBeenCalledTimes(1)
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
