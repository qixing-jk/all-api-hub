import { beforeEach, describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import type { Asset } from "~/services/amounts/assets"
import { confirmedAward } from "~/services/amounts/awards"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
  EVIDENCE_KINDS,
} from "~/services/amounts/financialConstants"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  redeemService,
  REDEMPTION_RESULT_CODES,
} from "~/services/redemption/redeemService"
import { AuthTypeEnum } from "~/types"
import i18n from "~/utils/i18n/core"
import { accountStorageTestSurface as accountStorage } from "~~/tests/test-utils/accountStorageTestSurface"
import {
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAccountById: vi.fn() },
}))
vi.mock("~/services/accounts/accountStorage/accountReadModels", () => ({
  accountReadModels: { getDisplayDataById: vi.fn() },
}))
vi.mock("~/services/accounts/accountStorage/accountPresentation", () => ({
  accountPresentation: { convertToDisplayData: vi.fn() },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn(),
}))

const grant = (
  value: unknown,
  asset: Asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
) =>
  confirmedAward({
    id: "credit",
    asset,
    value,
    source: {
      adapter: "fixture",
      operation: "redeem",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    },
    scope: accountBalanceScope({
      baseUrl: "https://example.com",
      accountId: "account-1",
    }),
    observedAt: 1,
    fulfillment: AWARD_FULFILLMENT.Credited,
    target: AWARD_TARGETS.Wallet,
  })

describe("redeemService.redeemCodeForAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps confirmed awards when the post-redemption display read fails", async () => {
    const account = buildSiteAccount({ id: "account-1", site_type: "new-api" })
    const display = buildDisplaySiteData({ id: "account-1" })
    const awards = [grant("2")]
    const redeem = vi.fn().mockResolvedValue({ awards })
    vi.mocked(accountStorage.getAccountById).mockResolvedValueOnce(account)
    vi.mocked(accountStorage.getDisplayDataById).mockRejectedValueOnce(
      new Error("storage unavailable"),
    )
    ;(
      accountStorage.convertToDisplayData as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce(display)
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      account: { redemption: { redeem } },
    } as any)
    const result = await redeemService.redeemCodeForAccount("account-1", "CODE")
    expect(result).toMatchObject({ success: true, awards, account: display })
    expect(redeem).toHaveBeenCalledTimes(1)
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
    const awards = [grant("0.02469")]
    const redeem = vi.fn().mockResolvedValue({ awards })

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
        directRequestReason: "caller_managed" as const,
        allowAccountCredentialRecovery: true,
        baseUrl: "https://example.com",
        managementApiBaseUrl: "https://example.com",
        accountId: "account-1",
        siteType: "new-api",
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
      awards,
      account: displayData,
    })
  })

  it("preserves confirmed non-cash RelayFor benefits in shared redemption feedback", async () => {
    const benefits = {
      message: "Monthly subscription · expires 2099-01-01",
      awards: [grant(undefined, { kind: "unknown" })],
    }
    vi.mocked(accountStorage.getAccountById).mockResolvedValueOnce({
      id: "relayfor",
      site_type: SITE_TYPES.RELAYFOR,
      site_url: "https://relayfor.xyz",
      account_info: { id: "1", access_token: "test-token" },
    } as any)
    vi.mocked(accountStorage.getDisplayDataById).mockResolvedValueOnce({
      id: "relayfor",
    } as any)
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      account: {
        redemption: { redeem: vi.fn().mockResolvedValue(benefits) },
      },
    } as any)
    const result = await redeemService.redeemCodeForAccount(
      "relayfor",
      "SUBSCRIPTION",
    )
    expect(result.success).toBe(true)
    expect(result.message).toBe(benefits.message)
    expect(result.awards).toEqual(benefits.awards)
  })

  it("falls back to converted display data and preserves unknown grant amounts", async () => {
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
    const awards = [grant(undefined)]
    const redeem = vi.fn().mockResolvedValue({ awards })

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
        directRequestReason: "caller_managed" as const,
        allowAccountCredentialRecovery: true,
        baseUrl: "https://one-api.example.com",
        managementApiBaseUrl: "https://one-api.example.com",
        accountId: "account-2",
        siteType: "one-api",
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
      awards,
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
    ;(
      accountStorage.getAccountById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(account)
    ;(
      getSiteTypeCapabilities as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      siteType: SITE_TYPES.SUB2API,
    })

    const result = await redeemService.redeemCodeForAccount("sub2api-1", "CODE")

    expect(result).toEqual({
      success: false,
      code: REDEMPTION_RESULT_CODES.UnsupportedSiteType,
      message: "redemptionAssist:messages.unsupportedSiteType",
    })
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
    ;(
      accountStorage.getAccountById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(account)
    ;(
      getSiteTypeCapabilities as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      siteType: SITE_TYPES.AIHUBMIX,
    })

    const result = await redeemService.redeemCodeForAccount(
      "aihubmix-1",
      "CODE",
    )

    expect(result).toEqual({
      success: false,
      code: REDEMPTION_RESULT_CODES.UnsupportedSiteType,
      message: "redemptionAssist:messages.unsupportedSiteType",
    })
  })
})

it("shows a redeemed native asset in its own units rather than the monetary quota scale", async () => {
  i18n.addResourceBundle("en", "redemptionAssist", {
    messages: { redeemSuccess: "Credited: {{amount}}" },
  })
  try {
    vi.mocked(accountStorage.getAccountById).mockResolvedValueOnce(
      buildSiteAccount({
        id: "points",
        site_type: SITE_TYPES.EMRANK,
        site_url: "https://emrank.tech",
        account_info: { ...buildSiteAccount().account_info, id: "6088" },
        authType: AuthTypeEnum.Cookie,
      }),
    )
    vi.mocked(accountStorage.getDisplayDataById).mockResolvedValueOnce(
      buildDisplaySiteData({ id: "points" }),
    )
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.EMRANK,
      account: {
        redemption: {
          redeem: vi.fn().mockResolvedValue({
            awards: [
              grant("2000", {
                kind: ASSET_KINDS.Quota,
                id: "test:points",
                label: "Points",
                displayScale: 1000,
                displayLabel: "K Points",
              }),
            ],
          }),
        },
      },
    })
    const result = await redeemService.redeemCodeForAccount("points", "CODE")
    expect(result).toMatchObject({
      success: true,
      awards: [{ amount: { status: "known", value: "2000" } }],
      message: "Credited: 2 K Points",
    })
  } finally {
    i18n.removeResourceBundle("en", "redemptionAssist")
  }
})
