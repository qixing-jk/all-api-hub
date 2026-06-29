import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { accountStorage } from "~/services/accounts/accountStorage"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { redeemService } from "~/services/redemption/redeemService"

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountById: vi.fn(),
    getDisplayDataById: vi.fn(),
    convertToDisplayData: vi.fn(),
  },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn(),
}))

describe("redeemService.redeemCodeForAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns a localized error when the account is missing", async () => {
    ;(
      accountStorage.getAccountById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null)

    const result = await redeemService.redeemCodeForAccount("missing", "CODE")

    expect(result.success).toBe(false)
    expect(result.message).toBe("messages:storage.accountNotFound")
    expect(getSiteTypeCapabilities).not.toHaveBeenCalled()
  })

  it("rejects disabled accounts and does not call the API service", async () => {
    ;(
      accountStorage.getAccountById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      id: "disabled-1",
      disabled: true,
      site_name: "Disabled Site",
    })

    const result = await redeemService.redeemCodeForAccount(
      "disabled-1",
      "CODE",
    )

    expect(result.success).toBe(false)
    expect(result.message).toBe("messages:storage.accountDisabled")
    expect(getSiteTypeCapabilities).not.toHaveBeenCalled()
  })

  it("redeems successfully and prefers stored display data when available", async () => {
    const account = {
      id: "account-1",
      disabled: false,
      site_type: "new-api",
      site_url: "https://example.com",
      authType: "bearer",
      account_info: {
        id: "user-1",
        access_token: "token-1",
      },
      cookieAuth: {
        sessionCookie: "session=abc",
      },
    }
    const displayData = {
      id: "account-1",
      site_name: "Example Site",
    }
    const redeem = vi.fn().mockResolvedValue(12345)

    ;(
      accountStorage.getAccountById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(account)
    ;(
      accountStorage.getDisplayDataById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(displayData)
    ;(
      getSiteTypeCapabilities as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      account: {
        redemption: {
          redeem,
        },
      },
    })

    const result = await redeemService.redeemCodeForAccount("account-1", "CODE")

    expect(getSiteTypeCapabilities).toHaveBeenCalledWith("new-api")
    expect(redeem).toHaveBeenCalledWith({
      request: {
        baseUrl: "https://example.com",
        accountId: "account-1",
        auth: {
          authType: "bearer",
          userId: "user-1",
          accessToken: "token-1",
          cookie: "session=abc",
        },
      },
      code: "CODE",
    })
    expect(accountStorage.getDisplayDataById).toHaveBeenCalledWith("account-1")
    expect(accountStorage.convertToDisplayData).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      message: "redemptionAssist:messages.redeemSuccess",
      creditedAmount: 12345,
      account: displayData,
    })
  })

  it("falls back to converted display data and supports non-numeric credited amounts", async () => {
    const account = {
      id: "account-2",
      disabled: false,
      site_type: "one-api",
      site_url: "https://one-api.example.com",
      authType: "token",
      account_info: {
        id: "user-2",
        access_token: "token-2",
      },
    }
    const convertedDisplayData = {
      id: "account-2",
      site_name: "Converted Site",
    }
    const redeem = vi.fn().mockResolvedValue("unexpected")

    ;(
      accountStorage.getAccountById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(account)
    ;(
      accountStorage.getDisplayDataById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null)
    ;(
      accountStorage.convertToDisplayData as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce(convertedDisplayData)
    ;(
      getSiteTypeCapabilities as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      account: {
        redemption: {
          redeem,
        },
      },
    })

    const result = await redeemService.redeemCodeForAccount("account-2", "CODE")

    expect(redeem).toHaveBeenCalledWith({
      request: {
        baseUrl: "https://one-api.example.com",
        accountId: "account-2",
        auth: {
          authType: "token",
          userId: "user-2",
          accessToken: "token-2",
          cookie: undefined,
        },
      },
      code: "CODE",
    })
    expect(accountStorage.convertToDisplayData).toHaveBeenCalledWith(account)
    expect(result).toEqual({
      success: true,
      message: "redemptionAssist:messages.redeemSuccess",
      creditedAmount: "unexpected",
      account: convertedDisplayData,
    })
  })

  it("returns the thrown error message when redemption fails with an Error", async () => {
    const account = {
      id: "account-3",
      disabled: false,
      site_type: "new-api",
      site_url: "https://example.com",
      authType: "bearer",
      account_info: {
        id: "user-3",
        access_token: "token-3",
      },
    }
    const redeem = vi.fn().mockRejectedValue(new Error("backend exploded"))

    ;(
      accountStorage.getAccountById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(account)
    ;(
      getSiteTypeCapabilities as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      account: {
        redemption: {
          redeem,
        },
      },
    })

    const result = await redeemService.redeemCodeForAccount("account-3", "CODE")

    expect(result).toEqual({
      success: false,
      message: "backend exploded",
    })
  })

  it("falls back to the localized failure message when the thrown error message is blank", async () => {
    const account = {
      id: "account-4",
      disabled: false,
      site_type: "new-api",
      site_url: "https://example.com",
      authType: "bearer",
      account_info: {
        id: "user-4",
        access_token: "token-4",
      },
    }
    const blankError = new Error("")
    const redeem = vi.fn().mockRejectedValue(blankError)

    ;(
      accountStorage.getAccountById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(account)
    ;(
      getSiteTypeCapabilities as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      account: {
        redemption: {
          redeem,
        },
      },
    })

    const result = await redeemService.redeemCodeForAccount("account-4", "CODE")

    expect(result).toEqual({
      success: false,
      message: "redemptionAssist:messages.redeemFailed",
    })
  })

  it("returns a local failure for unsupported Sub2API redemption", async () => {
    const account = {
      id: "sub2api-1",
      disabled: false,
      site_type: SITE_TYPES.SUB2API,
      site_url: "https://sub2api.example.com",
      authType: "bearer",
      account_info: {
        id: "user-sub2api",
        access_token: "token-sub2api",
      },
    }
    const redeem = vi.fn()

    ;(
      accountStorage.getAccountById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(account)
    ;(
      getSiteTypeCapabilities as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({})

    const result = await redeemService.redeemCodeForAccount("sub2api-1", "CODE")

    expect(result).toEqual({
      success: false,
      message: "redemptionAssist:messages.redeemFailed",
    })
    expect(redeem).not.toHaveBeenCalled()
  })

  it("returns a local failure for unsupported AIHubMix redemption", async () => {
    const account = {
      id: "aihubmix-1",
      disabled: false,
      site_type: SITE_TYPES.AIHUBMIX,
      site_url: "https://aihubmix.com",
      authType: "bearer",
      account_info: {
        id: "user-aihubmix",
        access_token: "token-aihubmix",
      },
    }
    const redeem = vi.fn()

    ;(
      accountStorage.getAccountById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(account)
    ;(
      getSiteTypeCapabilities as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({})

    const result = await redeemService.redeemCodeForAccount(
      "aihubmix-1",
      "CODE",
    )

    expect(result).toEqual({
      success: false,
      message: "redemptionAssist:messages.redeemFailed",
    })
    expect(redeem).not.toHaveBeenCalled()
  })
})
