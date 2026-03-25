import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchDisplayAccountTokens,
  InvalidTokenPayloadError,
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
  userId: 1,
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
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const result = await fetchDisplayAccountTokens(ACCOUNT as any)

    expect(result).toEqual([{ id: 1, key: "sk-test", status: 1 }])
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
})
