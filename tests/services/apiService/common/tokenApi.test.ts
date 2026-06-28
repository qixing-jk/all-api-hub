import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  formatOptionalSkPrefixSiteToken,
  formatOptionalSkPrefixSiteTokenAuthKey,
  formatOptionalSkPrefixSiteTokenComparableKey,
  formatOptionalSkPrefixTokenComparableKey,
  hasOptionalSkPrefixSiteTokenSemantics,
  normalizeApiTokenKeyValue,
} from "~/services/accountTokens/apiTokenKey"
import {
  fetchTokenSecretKeyById,
  fetchTokenSecretKeyByIdWithMethod,
  invalidateResolvedApiTokenKeyCache,
  resolveApiTokenKey,
  resolveApiTokenKeyWithFetcher,
  syncResolvedApiTokenKeyCache,
} from "~/services/apiService/common/tokenKeyResolver"
import { fetchApiData } from "~/services/apiService/common/utils"
import { AuthTypeEnum } from "~/types"

const { mockFetchApi, mockFetchApiData } = vi.hoisted(() => ({
  mockFetchApi: vi.fn(),
  mockFetchApiData: vi.fn(),
}))

vi.mock("~/constants/ui", () => ({
  UI_CONSTANTS: {},
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {},
}))

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: mockFetchApi,
  fetchApiData: mockFetchApiData,
  aggregateUsageData: vi.fn(),
  extractAmount: vi.fn(),
  getTodayTimestampRange: vi.fn(),
}))

const mockedFetchApiData = fetchApiData as unknown as ReturnType<typeof vi.fn>

describe("apiService common token APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchApiData.mockReset()
    mockFetchApi.mockReset()
  })

  it("normalizeApiTokenKeyValue trims whitespace without adding sk- prefixes", () => {
    expect(normalizeApiTokenKeyValue("  plain-key  ")).toBe("plain-key")
    expect(normalizeApiTokenKeyValue("sk-already")).toBe("sk-already")
  })

  it("formats auth/display keys for optional sk-prefix compatible site types only", () => {
    expect(hasOptionalSkPrefixSiteTokenSemantics(SITE_TYPES.NEW_API)).toBe(true)
    expect(hasOptionalSkPrefixSiteTokenSemantics(SITE_TYPES.VELOERA)).toBe(true)
    expect(hasOptionalSkPrefixSiteTokenSemantics(SITE_TYPES.ONE_HUB)).toBe(true)
    expect(hasOptionalSkPrefixSiteTokenSemantics(SITE_TYPES.DONE_HUB)).toBe(
      true,
    )
    expect(hasOptionalSkPrefixSiteTokenSemantics(SITE_TYPES.ANYROUTER)).toBe(
      true,
    )
    expect(hasOptionalSkPrefixSiteTokenSemantics(SITE_TYPES.SUB2API)).toBe(
      false,
    )
    expect(hasOptionalSkPrefixSiteTokenSemantics(SITE_TYPES.AIHUBMIX)).toBe(
      false,
    )

    expect(
      formatOptionalSkPrefixSiteTokenAuthKey(" plain-key ", SITE_TYPES.VELOERA),
    ).toBe("sk-plain-key")
    expect(
      formatOptionalSkPrefixSiteTokenAuthKey("sk-already", SITE_TYPES.DONE_HUB),
    ).toBe("sk-already")
    expect(
      formatOptionalSkPrefixSiteTokenAuthKey("plain-key", SITE_TYPES.SUB2API),
    ).toBe("plain-key")
    expect(
      formatOptionalSkPrefixSiteTokenAuthKey("   ", SITE_TYPES.NEW_API),
    ).toBe("")
  })

  it("formats comparable keys for optional sk-prefix semantics", () => {
    expect(formatOptionalSkPrefixTokenComparableKey(" sk-abc ")).toBe("abc")
    expect(
      formatOptionalSkPrefixSiteTokenComparableKey(
        "sk-abc",
        SITE_TYPES.NEW_API,
      ),
    ).toBe("abc")
    expect(
      formatOptionalSkPrefixSiteTokenComparableKey(
        "sk-abc",
        SITE_TYPES.SUB2API,
      ),
    ).toBe("sk-abc")
  })

  it("formats token auth keys by site type and preserves identity when unchanged", () => {
    const token = { id: 1, key: "plain-key" } as any
    const formatted = formatOptionalSkPrefixSiteToken(token, SITE_TYPES.NEW_API)

    expect(formatted.key).toBe("sk-plain-key")
    expect(formatted).not.toBe(token)

    const alreadyPrefixed = { id: 2, key: "sk-ready" } as any
    const unchanged = formatOptionalSkPrefixSiteToken(
      alreadyPrefixed,
      SITE_TYPES.NEW_API,
    )

    expect(unchanged).toBe(alreadyPrefixed)
  })

  it("resolveApiTokenKey fetches the explicit secret when inventory key is masked", async () => {
    mockedFetchApiData.mockResolvedValueOnce({ key: "resolved-secret" })

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "token",
      },
    }

    const result = await resolveApiTokenKey(
      request as any,
      {
        id: 7,
        key: "sk-abcd************wxyz",
      } as any,
    )

    expect(mockedFetchApiData).toHaveBeenCalledWith(request, {
      endpoint: "/api/token/7/key",
      options: {
        method: "POST",
      },
    })
    expect(result).toBe("resolved-secret")
  })

  it("fetchTokenSecretKeyByIdWithMethod uses the caller-provided HTTP method", async () => {
    mockedFetchApiData.mockResolvedValueOnce({ key: "resolved-via-get" })

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-get-secret",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "token",
      },
    }

    await expect(
      fetchTokenSecretKeyByIdWithMethod(request as any, 70, "GET"),
    ).resolves.toBe("resolved-via-get")

    expect(mockedFetchApiData).toHaveBeenCalledWith(request, {
      endpoint: "/api/token/70/key",
      options: {
        method: "GET",
      },
    })
  })

  it("resolveApiTokenKey passes through legacy full keys without an extra fetch", async () => {
    const request = {
      baseUrl: "https://example.com",
      accountId: "account-2",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "token",
      },
    }

    const result = await resolveApiTokenKey(
      request as any,
      {
        id: 8,
        key: "sk-direct-secret",
      } as any,
    )

    expect(mockedFetchApiData).not.toHaveBeenCalled()
    expect(result).toBe("sk-direct-secret")
  })

  it("resolveApiTokenKey deduplicates concurrent masked-key fetches", async () => {
    mockedFetchApiData.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ key: "deduped-secret" }), 0)
        }),
    )

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-3",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "token",
      },
    }

    const maskedToken = {
      id: 9,
      key: "sk-zzzz************yyyy",
    }

    const [first, second] = await Promise.all([
      resolveApiTokenKey(request as any, maskedToken as any),
      resolveApiTokenKey(request as any, maskedToken as any),
    ])

    expect(mockedFetchApiData).toHaveBeenCalledTimes(1)
    expect(first).toBe("deduped-secret")
    expect(second).toBe("deduped-secret")
  })

  it("resolveApiTokenKeyWithFetcher reuses the shared dedupe/cache path for custom site fetchers", async () => {
    const fetchSecretKey = vi.fn().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve("custom-secret"), 0)
        }),
    )

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-custom-fetcher",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "token",
      },
    }

    const maskedToken = {
      id: 71,
      key: "sk-mask************site",
    }

    const [first, second] = await Promise.all([
      resolveApiTokenKeyWithFetcher(
        request as any,
        maskedToken as any,
        fetchSecretKey,
      ),
      resolveApiTokenKeyWithFetcher(
        request as any,
        maskedToken as any,
        fetchSecretKey,
      ),
    ])

    expect(fetchSecretKey).toHaveBeenCalledTimes(1)
    expect(fetchSecretKey).toHaveBeenCalledWith(request, 71)
    expect(first).toBe("custom-secret")
    expect(second).toBe("custom-secret")
  })

  it("resolveApiTokenKey returns an empty normalized key without fetching", async () => {
    const request = {
      baseUrl: "https://example.com",
      accountId: "account-empty",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "token",
      },
    }

    const result = await resolveApiTokenKey(
      request as any,
      {
        id: 10,
        key: "   ",
      } as any,
    )

    expect(result).toBe("")
    expect(mockedFetchApiData).not.toHaveBeenCalled()
  })

  it("resolveApiTokenKey normalizes non-masked inventory keys without fetching", async () => {
    const request = {
      baseUrl: "https://example.com",
      accountId: "account-plain",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "token",
      },
    }

    const result = await resolveApiTokenKey(
      request as any,
      {
        id: 11,
        key: "plain-secret",
      } as any,
    )

    expect(result).toBe("plain-secret")
    expect(mockedFetchApiData).not.toHaveBeenCalled()
  })

  it("resolveApiTokenKey rejects masked keys that cannot be resolved by id", async () => {
    const request = {
      baseUrl: "https://example.com",
      accountId: "account-unresolvable",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "token",
      },
    }

    await expect(
      resolveApiTokenKey(
        request as any,
        {
          id: Number.NaN,
          key: "sk-abc************xyz",
        } as any,
      ),
    ).rejects.toThrow("token_secret_key_unresolvable")

    expect(mockedFetchApiData).not.toHaveBeenCalled()
  })

  it("fetchTokenSecretKeyById rejects when the secret endpoint returns a blank key", async () => {
    mockedFetchApiData.mockResolvedValueOnce({ key: "   " })

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-missing-secret",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "token",
      },
    }

    await expect(fetchTokenSecretKeyById(request as any, 12)).rejects.toThrow(
      "token_secret_key_missing",
    )
  })

  it("fetchTokenSecretKeyById rejects when the secret endpoint omits the key field", async () => {
    mockedFetchApiData.mockResolvedValueOnce({})

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-missing-key-field",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "token",
      },
    }

    await expect(fetchTokenSecretKeyById(request as any, 16)).rejects.toThrow(
      "token_secret_key_missing",
    )
  })

  it("invalidateResolvedApiTokenKeyCache clears cached entries for the current scope", async () => {
    mockedFetchApiData
      .mockResolvedValueOnce({ key: "first-secret" })
      .mockResolvedValueOnce({ key: "second-secret" })

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-invalidate",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "token",
      },
    }
    const token = {
      id: 13,
      key: "sk-mask************key",
    }

    await expect(
      resolveApiTokenKey(request as any, token as any),
    ).resolves.toBe("first-secret")

    invalidateResolvedApiTokenKeyCache(request as any)

    await expect(
      resolveApiTokenKey(request as any, token as any),
    ).resolves.toBe("second-secret")
    expect(mockedFetchApiData).toHaveBeenCalledTimes(2)
  })

  it("syncResolvedApiTokenKeyCache drops stale cached entries when inventory changes", async () => {
    mockedFetchApiData
      .mockResolvedValueOnce({ key: "first-secret" })
      .mockResolvedValueOnce({ key: "refetched-secret" })

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-sync",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "token",
      },
    }
    const token = {
      id: 14,
      key: "sk-old************mask",
    }

    await expect(
      resolveApiTokenKey(request as any, token as any),
    ).resolves.toBe("first-secret")

    syncResolvedApiTokenKeyCache(
      request as any,
      [
        {
          id: 14,
          key: "sk-new************mask",
        },
      ] as any,
    )

    await expect(
      resolveApiTokenKey(request as any, token as any),
    ).resolves.toBe("refetched-secret")
    expect(mockedFetchApiData).toHaveBeenCalledTimes(2)
  })

  it("invalidateResolvedApiTokenKeyCache only clears entries inside the matching scope", async () => {
    mockedFetchApiData
      .mockResolvedValueOnce({ key: "scoped-secret" })
      .mockResolvedValueOnce({ key: "other-secret" })
      .mockResolvedValueOnce({ key: "refetched-scoped-secret" })

    const scopedRequest = {
      baseUrl: "https://example.com",
      accountId: "account-scope-a",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token-a",
      },
    }
    const otherRequest = {
      baseUrl: "https://example.com",
      accountId: "account-scope-b",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "2",
        accessToken: "token-b",
      },
    }
    const scopedToken = {
      id: 17,
      key: "sk-scope************one",
    }
    const otherToken = {
      id: 18,
      key: "sk-scope************two",
    }

    await expect(
      resolveApiTokenKey(scopedRequest as any, scopedToken as any),
    ).resolves.toBe("scoped-secret")
    await expect(
      resolveApiTokenKey(otherRequest as any, otherToken as any),
    ).resolves.toBe("other-secret")

    invalidateResolvedApiTokenKeyCache(scopedRequest as any)

    await expect(
      resolveApiTokenKey(scopedRequest as any, scopedToken as any),
    ).resolves.toBe("refetched-scoped-secret")
    await expect(
      resolveApiTokenKey(otherRequest as any, otherToken as any),
    ).resolves.toBe("other-secret")

    expect(mockedFetchApiData).toHaveBeenCalledTimes(3)
  })

  it("syncResolvedApiTokenKeyCache evicts masked-key cache entries when inventory no longer includes the key", async () => {
    mockedFetchApiData
      .mockResolvedValueOnce({ key: "stable-secret" })
      .mockResolvedValueOnce({ key: "refetched-secret" })

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-stable-sync",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
      },
    }
    const token = {
      id: 19,
      key: "sk-stable************mask",
    }

    await expect(
      resolveApiTokenKey(request as any, token as any),
    ).resolves.toBe("stable-secret")

    syncResolvedApiTokenKeyCache(
      request as any,
      [
        {
          id: 19,
          key: undefined,
        },
      ] as any,
    )

    await expect(
      resolveApiTokenKey(request as any, { id: 19, key: undefined } as any),
    ).resolves.toBe("")

    await expect(
      resolveApiTokenKey(request as any, token as any),
    ).resolves.toBe("refetched-secret")

    expect(mockedFetchApiData).toHaveBeenCalledTimes(2)
  })

  it("clears rejected masked-key fetches from cache so later retries can refetch", async () => {
    mockedFetchApiData
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ key: "retry-secret" })

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-retry",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "token",
      },
    }
    const token = {
      id: 15,
      key: "sk-retry************mask",
    }

    await expect(
      resolveApiTokenKey(request as any, token as any),
    ).rejects.toThrow("temporary failure")
    await expect(
      resolveApiTokenKey(request as any, token as any),
    ).resolves.toBe("retry-secret")

    expect(mockedFetchApiData).toHaveBeenCalledTimes(2)
  })
})
