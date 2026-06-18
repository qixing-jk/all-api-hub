import { beforeEach, describe, expect, it, vi } from "vitest"

import { AccountUpdateUserTimestampMode } from "~/services/accounts/accountDefaults"
import { accountSub2ApiAuthSession } from "~/services/accounts/sub2apiAuthSession"

const { getAccountByIdMock, updateAccountMock } = vi.hoisted(() => ({
  getAccountByIdMock: vi.fn(),
  updateAccountMock: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountById: (...args: unknown[]) => getAccountByIdMock(...args),
    updateAccount: (...args: unknown[]) => updateAccountMock(...args),
  },
}))

describe("accountSub2ApiAuthSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccountByIdMock.mockResolvedValue(null)
    updateAccountMock.mockResolvedValue(true)
  })

  it("returns a narrow stored auth snapshot for an existing Sub2API account", async () => {
    getAccountByIdMock.mockResolvedValueOnce({
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
      }),
    ).resolves.toBe(true)

    expect(updateAccountMock).toHaveBeenCalledWith(
      "account-1",
      {
        account_info: {
          access_token: "resynced-jwt",
        },
      },
      { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
    )
  })

  it("normalizes refresh-token updates before persisting", async () => {
    await expect(
      accountSub2ApiAuthSession.persistAuthUpdate("account-1", {
        accessToken: "new-jwt",
        refreshToken: "  trimmed-refresh  ",
        tokenExpiresAt: 1_700_000_060_000,
      }),
    ).resolves.toBe(true)

    expect(updateAccountMock).toHaveBeenCalledWith(
      "account-1",
      {
        account_info: {
          access_token: "new-jwt",
        },
        sub2apiAuth: {
          refreshToken: "trimmed-refresh",
          tokenExpiresAt: 1_700_000_060_000,
        },
      },
      { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
    )

    updateAccountMock.mockClear()

    await expect(
      accountSub2ApiAuthSession.persistAuthUpdate("account-1", {
        accessToken: "new-jwt",
        refreshToken: "   ",
        tokenExpiresAt: 1_700_000_060_000,
      }),
    ).resolves.toBe(true)

    expect(updateAccountMock).toHaveBeenCalledWith(
      "account-1",
      {
        account_info: {
          access_token: "new-jwt",
        },
      },
      { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
    )
  })

  it("persists rotated refresh-token metadata while preserving the user timestamp", async () => {
    await expect(
      accountSub2ApiAuthSession.persistAuthUpdate("account-1", {
        accessToken: "new-jwt",
        refreshToken: "new-refresh",
        tokenExpiresAt: 1_700_000_060_000,
      }),
    ).resolves.toBe(true)

    expect(updateAccountMock).toHaveBeenCalledWith(
      "account-1",
      {
        account_info: {
          access_token: "new-jwt",
        },
        sub2apiAuth: {
          refreshToken: "new-refresh",
          tokenExpiresAt: 1_700_000_060_000,
        },
      },
      { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
    )
  })
})
