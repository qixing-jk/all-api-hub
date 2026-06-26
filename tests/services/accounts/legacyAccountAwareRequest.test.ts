import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveLegacyAccountAwareRequest } from "~/services/accounts/utils/legacyAccountAwareRequest"
import { AuthTypeEnum } from "~/types"

const { mockGetAccountByBaseUrlAndUserId } = vi.hoisted(() => ({
  mockGetAccountByBaseUrlAndUserId: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountByBaseUrlAndUserId: mockGetAccountByBaseUrlAndUserId,
  },
}))

describe("resolveLegacyAccountAwareRequest", () => {
  beforeEach(() => {
    mockGetAccountByBaseUrlAndUserId.mockReset()
  })

  it("enriches account metadata when accountId is absent", async () => {
    mockGetAccountByBaseUrlAndUserId.mockResolvedValueOnce({
      id: "account-1",
      cookieAuth: {
        sessionCookie: "session=stored",
      },
    })

    await expect(
      resolveLegacyAccountAwareRequest(
        {
          baseUrl: "https://example.com",
          auth: {
            authType: AuthTypeEnum.Cookie,
            userId: "123",
          },
        },
        { endpoint: "/api/test" },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        accountId: "account-1",
        cookieAuthSessionCookie: "session=stored",
      }),
    )

    expect(mockGetAccountByBaseUrlAndUserId).toHaveBeenCalledWith(
      "https://example.com",
      "123",
    )
  })

  it("preserves caller-provided legacy session cookie when enriching metadata", async () => {
    mockGetAccountByBaseUrlAndUserId.mockResolvedValueOnce({
      id: "account-1",
      cookieAuth: {
        sessionCookie: "session=stored",
      },
    })

    await expect(
      resolveLegacyAccountAwareRequest(
        {
          baseUrl: "https://example.com",
          cookieAuthSessionCookie: "session=fresh",
          auth: {
            authType: AuthTypeEnum.Cookie,
            userId: "123",
          },
        },
        { endpoint: "/api/test" },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        accountId: "account-1",
        cookieAuthSessionCookie: "session=fresh",
      }),
    )
  })

  it("returns the original request when lookup misses", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "123",
      },
    }

    mockGetAccountByBaseUrlAndUserId.mockResolvedValueOnce(null)

    await expect(
      resolveLegacyAccountAwareRequest(request, { endpoint: "/api/test" }),
    ).resolves.toBe(request)
  })

  it("does not query storage when auth user id is missing", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
      },
    }

    await expect(
      resolveLegacyAccountAwareRequest(request, { endpoint: "/api/test" }),
    ).resolves.toBe(request)
    expect(mockGetAccountByBaseUrlAndUserId).not.toHaveBeenCalled()
  })

  it("does not query storage when accountId is already present", async () => {
    const request = {
      baseUrl: "https://example.com",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "123",
      },
    }

    await expect(
      resolveLegacyAccountAwareRequest(request, { endpoint: "/api/test" }),
    ).resolves.toBe(request)
    expect(mockGetAccountByBaseUrlAndUserId).not.toHaveBeenCalled()
  })
})
