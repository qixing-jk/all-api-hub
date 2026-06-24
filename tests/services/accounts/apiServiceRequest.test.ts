import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { accountSub2ApiAuthSession } from "~/services/accounts/sub2apiAuthSession"
import {
  canManageDisplayAccountTokens,
  createDisplayAccountApiContext,
  fetchDisplayAccountTokens,
  InvalidTokenPayloadError,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: vi.fn(),
}))

vi.mock("~/services/accounts/sub2apiAuthSession", () => ({
  accountSub2ApiAuthSession: {
    getLatestAuth: vi.fn(),
    persistAuthUpdate: vi.fn(),
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

describe("fetchDisplayAccountTokens", () => {
  let fetchTokens: ReturnType<typeof vi.fn>
  let createToken: ReturnType<typeof vi.fn>
  let updateToken: ReturnType<typeof vi.fn>
  let resolveTokenKey: ReturnType<typeof vi.fn>
  let deleteToken: ReturnType<typeof vi.fn>
  let fetchUserGroups: ReturnType<typeof vi.fn>
  let fetchAvailableModels: ReturnType<typeof vi.fn>
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
  let adapter: {
    siteType: string
    keyManagement?: typeof keyManagement
    tokenProvisioning?: typeof tokenProvisioning
  }

  beforeEach(() => {
    fetchTokens = vi.fn()
    createToken = vi.fn()
    updateToken = vi.fn()
    resolveTokenKey = vi.fn()
    deleteToken = vi.fn()
    fetchUserGroups = vi.fn()
    fetchAvailableModels = vi.fn()
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
    adapter = { siteType: "new-api", keyManagement, tokenProvisioning }

    vi.mocked(getSiteAdapter).mockReset()
    vi.mocked(getSiteAdapter).mockReturnValue(adapter as any)
  })

  it("returns the token array when the API payload is valid", async () => {
    fetchTokens.mockResolvedValue([{ id: 1, key: "sk-test", status: 1 }])

    const result = await fetchDisplayAccountTokens(ACCOUNT as any)

    expect(result).toEqual([{ id: 1, key: "sk-test", status: 1 }])
    expect(fetchTokens).toHaveBeenCalledWith(expect.objectContaining(REQUEST))
    expect(createDisplayAccountApiContext(ACCOUNT as any)).toEqual({
      adapter,
      keyManagement,
      tokenProvisioning,
      request: expect.objectContaining(REQUEST),
    })
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

  it("throws when adapter key management is not implemented", async () => {
    vi.mocked(getSiteAdapter).mockReturnValue({
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
  })
})
