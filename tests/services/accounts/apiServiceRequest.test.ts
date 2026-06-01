import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  canManageDisplayAccountTokens,
  createDisplayAccountApiContext,
  fetchDisplayAccountTokens,
  InvalidTokenPayloadError,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(),
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

describe("fetchDisplayAccountTokens", () => {
  beforeEach(() => {
    vi.mocked(getApiService).mockReset()
  })

  it("returns the token array when the API payload is valid", async () => {
    const fetchAccountTokens = vi
      .fn()
      .mockResolvedValue([{ id: 1, key: "sk-test", status: 1 }])
    const service = { fetchAccountTokens }
    vi.mocked(getApiService).mockReturnValue(service as any)

    const result = await fetchDisplayAccountTokens(ACCOUNT as any)

    expect(result).toEqual([{ id: 1, key: "sk-test", status: 1 }])
    expect(createDisplayAccountApiContext(ACCOUNT as any)).toEqual({
      service,
      request: {
        baseUrl: "https://example.com",
        accountId: "account-1",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "1",
          accessToken: "token",
          cookie: "",
        },
      },
    })
  })

  it("throws InvalidTokenPayloadError when the API payload is not an array", async () => {
    const fetchAccountTokens = vi.fn().mockResolvedValue({ items: [] })
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

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
    const resolveApiTokenKey = vi.fn().mockResolvedValue("sk-test")
    vi.mocked(getApiService).mockReturnValue({ resolveApiTokenKey } as any)

    const result = await resolveDisplayAccountTokenForSecret(
      ACCOUNT as any,
      token as any,
    )

    expect(result).toBe(token)
  })

  it("clones the token when the resolved secret key differs from the masked key", async () => {
    const token = { id: 1, key: "sk-masked", status: 1, name: "Masked" }
    const resolveApiTokenKey = vi.fn().mockResolvedValue("sk-real")
    vi.mocked(getApiService).mockReturnValue({ resolveApiTokenKey } as any)

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
  })

  it("returns a transient sk-prefixed secret for optional-prefix compatible account types", async () => {
    const token = { id: 1, key: "plain-secret", status: 1, name: "Plain" }
    const resolveApiTokenKey = vi.fn().mockResolvedValue("plain-secret")
    vi.mocked(getApiService).mockReturnValue({ resolveApiTokenKey } as any)

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
    const resolveApiTokenKey = vi.fn().mockResolvedValue("plain-secret")
    vi.mocked(getApiService).mockReturnValue({ resolveApiTokenKey } as any)

    const result = await resolveDisplayAccountTokenForSecret(
      { ...ACCOUNT, siteType: "sub2api" } as any,
      token as any,
    )

    expect(result).toBe(token)
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
