import { beforeEach, describe, expect, it, vi } from "vitest"

import { AccountUpdateUserTimestampMode } from "~/services/accounts/accountDefaults"
import { accountSub2ApiAuthSession } from "~/services/accounts/sub2apiAuthSession"

const { getAccountByIdMock, updateSub2ApiAuthMock } = vi.hoisted(() => ({
  getAccountByIdMock: vi.fn(),
  updateSub2ApiAuthMock: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: {
    getAccountById: (...args: unknown[]) => getAccountByIdMock(...args),
  },
}))
vi.mock("~/services/accounts/accountStorage/sub2ApiAuthPersistence", () => ({
  sub2ApiAuthPersistence: {
    updateSub2ApiAuth: (...args: unknown[]) => updateSub2ApiAuthMock(...args),
  },
}))

describe("accountSub2ApiAuthSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccountByIdMock.mockResolvedValue(null)
    updateSub2ApiAuthMock.mockResolvedValue({ status: "persisted" })
  })

  it("returns a narrow stored auth snapshot for an existing Sub2API account", async () => {
    getAccountByIdMock.mockResolvedValueOnce({
      site_type: "sub2api",
      site_url: "https://auth.example.invalid/dashboard",
      account_info: {
        id: "9",
        access_token: " stored-jwt ",
      },
      sub2apiAuth: {
        refreshToken: " stored-refresh ",
        tokenExpiresAt: 1_700_000_000_000,
      },
    })

    await expect(
      accountSub2ApiAuthSession.getLatestAuth("account-1"),
    ).resolves.toEqual({
      accessToken: "stored-jwt",
      origin: "https://auth.example.invalid",
      userId: "9",
      sub2apiAuth: {
        refreshToken: "stored-refresh",
        tokenExpiresAt: 1_700_000_000_000,
      },
    })

    expect(getAccountByIdMock).toHaveBeenCalledWith("account-1")
  })

  it("omits invalid stored auth fields while preserving valid partial snapshot data", async () => {
    getAccountByIdMock.mockResolvedValueOnce({
      account_info: {
        id: "   ",
        access_token: "   ",
      },
      sub2apiAuth: {
        refreshToken: "   ",
        tokenExpiresAt: Infinity,
      },
    })

    await expect(
      accountSub2ApiAuthSession.getLatestAuth("account-1"),
    ).resolves.toEqual({})

    getAccountByIdMock.mockResolvedValueOnce({
      account_info: {
        id: "",
        access_token: "valid-jwt",
      },
    })

    await expect(
      accountSub2ApiAuthSession.getLatestAuth("account-1"),
    ).resolves.toEqual({
      accessToken: "valid-jwt",
    })

    getAccountByIdMock.mockResolvedValueOnce({
      account_info: {
        id: "10",
        access_token: "valid-jwt",
      },
      sub2apiAuth: {
        refreshToken: "valid-refresh",
        tokenExpiresAt: NaN,
      },
    })

    await expect(
      accountSub2ApiAuthSession.getLatestAuth("account-1"),
    ).resolves.toEqual({
      accessToken: "valid-jwt",
      userId: "10",
      sub2apiAuth: {
        refreshToken: "valid-refresh",
      },
    })
  })

  it("returns null when the account no longer exists", async () => {
    getAccountByIdMock.mockResolvedValueOnce(null)

    await expect(
      accountSub2ApiAuthSession.getLatestAuth("missing-account"),
    ).resolves.toBeNull()
  })

  it("persists access-token-only re-sync updates while preserving the user timestamp", async () => {
    await expect(
      accountSub2ApiAuthSession.persistAuthUpdate("account-1", {
        accessToken: "resynced-jwt",
        expectedOrigin: "https://sub2.example.com",
        expectedUserId: "9",
      }),
    ).resolves.toEqual({ status: "persisted" })

    expect(updateSub2ApiAuthMock).toHaveBeenCalledWith(
      "account-1",
      expect.objectContaining({
        accessToken: "resynced-jwt",
        expectedOrigin: "https://sub2.example.com",
        expectedUserId: "9",
      }),
      { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
    )
  })

  it("delegates refresh-token updates to storage normalization", async () => {
    await expect(
      accountSub2ApiAuthSession.persistAuthUpdate("account-1", {
        accessToken: "new-jwt",
        refreshToken: "  trimmed-refresh  ",
        tokenExpiresAt: 1_700_000_060_000,
        expectedOrigin: "https://sub2.example.com",
        expectedUserId: "9",
      }),
    ).resolves.toEqual({ status: "persisted" })

    expect(updateSub2ApiAuthMock).toHaveBeenCalledWith(
      "account-1",
      expect.objectContaining({ refreshToken: "  trimmed-refresh  " }),
      { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
    )

    updateSub2ApiAuthMock.mockClear()

    await expect(
      accountSub2ApiAuthSession.persistAuthUpdate("account-1", {
        accessToken: "new-jwt",
        refreshToken: "   ",
        tokenExpiresAt: 1_700_000_060_000,
        expectedOrigin: "https://sub2.example.com",
        expectedUserId: "9",
      }),
    ).resolves.toEqual({ status: "persisted" })

    expect(updateSub2ApiAuthMock).toHaveBeenCalledWith(
      "account-1",
      expect.objectContaining({ refreshToken: "   " }),
      { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
    )
  })

  it("persists rotated refresh-token metadata while preserving the user timestamp", async () => {
    await expect(
      accountSub2ApiAuthSession.persistAuthUpdate("account-1", {
        accessToken: "new-jwt",
        refreshToken: "new-refresh",
        tokenExpiresAt: 1_700_000_060_000,
        expectedOrigin: "https://sub2.example.com",
        expectedUserId: "9",
      }),
    ).resolves.toEqual({ status: "persisted" })

    expect(updateSub2ApiAuthMock).toHaveBeenCalledWith(
      "account-1",
      expect.objectContaining({ refreshToken: "new-refresh" }),
      { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
    )
  })
})
