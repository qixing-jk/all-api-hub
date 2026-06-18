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
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(),
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
  let resolveTokenKey: ReturnType<typeof vi.fn>
  let keyManagement: {
    fetchTokens: typeof fetchTokens
    createToken: typeof createToken
    resolveTokenKey: typeof resolveTokenKey
  }
  let adapter: {
    siteType: string
    keyManagement?: typeof keyManagement
  }
  let service: {
    fetchUserGroups: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    fetchTokens = vi.fn()
    createToken = vi.fn()
    resolveTokenKey = vi.fn()
    keyManagement = { fetchTokens, createToken, resolveTokenKey }
    adapter = { siteType: "new-api", keyManagement }
    service = { fetchUserGroups: vi.fn() }

    vi.mocked(getSiteAdapter).mockReset()
    vi.mocked(getApiService).mockReset()
    vi.mocked(getSiteAdapter).mockReturnValue(adapter as any)
    vi.mocked(getApiService).mockReturnValue(service as any)
  })

  it("returns the token array when the API payload is valid", async () => {
    fetchTokens.mockResolvedValue([{ id: 1, key: "sk-test", status: 1 }])

    const result = await fetchDisplayAccountTokens(ACCOUNT as any)

    expect(result).toEqual([{ id: 1, key: "sk-test", status: 1 }])
    expect(fetchTokens).toHaveBeenCalledWith(expect.objectContaining(REQUEST))
    expect(createDisplayAccountApiContext(ACCOUNT as any)).toEqual({
      service,
      adapter,
      keyManagement,
      request: expect.objectContaining(REQUEST),
    })
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

  it("adds a Sub2API auth session only for Sub2API display-account contexts", async () => {
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
