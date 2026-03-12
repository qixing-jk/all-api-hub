import { afterEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  return {
    ...actual,
    userPreferences: {
      getPreferences: vi.fn(),
    },
  }
})

afterEach(() => {
  vi.doUnmock("~/services/accounts/accountStorage")
  vi.doUnmock("~/services/redemption/redeemService")
  vi.resetModules()
  vi.restoreAllMocks()
})

describe("redemptionAssist shouldPrompt batch filtering", () => {
  it("returns only prompt-eligible codes for a url", async () => {
    vi.resetModules()
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    const getPreferencesMock = vi.mocked(userPreferences.getPreferences)

    getPreferencesMock.mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      redemptionAssist: {
        enabled: true,
        contextMenu: {
          enabled: true,
        },
        urlWhitelist: {
          enabled: false,
          patterns: [""],
          includeAccountSiteUrls: true,
          includeCheckInAndRedeemUrls: true,
        },
        // Strict hex validation for this test case.
        relaxedCodeValidation: false,
      },
    })

    const { handleRedemptionAssistMessage } = await import(
      "~/services/redemption/redemptionAssist"
    )

    const validHex = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
    const invalidHex = "g1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
    const tooShort = "1234"

    const sendResponse = vi.fn()

    await handleRedemptionAssistMessage(
      {
        action: RuntimeActionIds.RedemptionAssistShouldPrompt,
        url: "https://example.com/redeem",
        codes: [validHex, invalidHex, tooShort],
      },
      { tab: { id: 99 } } as any,
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      promptableCodes: [validHex],
    })
  })
})

describe("redemptionAssist post-redeem refresh", () => {
  it("refreshes account after successful auto redeem (explicit account)", async () => {
    vi.resetModules()

    const refreshAccount = vi.fn().mockResolvedValue({ refreshed: true })
    const redeemCodeForAccount = vi
      .fn()
      .mockResolvedValue({ success: true, message: "ok" })

    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        refreshAccount,
      },
    }))

    vi.doMock("~/services/redemption/redeemService", () => ({
      redeemService: {
        redeemCodeForAccount,
      },
    }))

    const { handleRedemptionAssistMessage } = await import(
      "~/services/redemption/redemptionAssist"
    )

    const sendResponse = vi.fn()

    await handleRedemptionAssistMessage(
      {
        action: RuntimeActionIds.RedemptionAssistAutoRedeem,
        accountId: "acc_1",
        code: "CODE_1",
      },
      {} as any,
      sendResponse,
    )

    expect(redeemCodeForAccount).toHaveBeenCalledWith("acc_1", "CODE_1")
    expect(refreshAccount).toHaveBeenCalledWith("acc_1", true)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: { success: true, message: "ok" },
    })
  })

  it("refreshes account after successful auto redeem by url (inferred account)", async () => {
    vi.resetModules()

    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    const getPreferencesMock = vi.mocked(userPreferences.getPreferences)
    getPreferencesMock.mockResolvedValue(DEFAULT_PREFERENCES)

    const refreshAccount = vi.fn().mockResolvedValue({ refreshed: true })
    const redeemCodeForAccount = vi
      .fn()
      .mockResolvedValue({ success: true, message: "ok" })

    const displayAccount = {
      id: "acc_2",
      baseUrl: "https://example.com",
      checkIn: {
        customCheckIn: {
          url: "https://example.com/checkin",
        },
      },
    }

    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        refreshAccount,
        getAllAccounts: vi.fn().mockResolvedValue([]),
        convertToDisplayData: vi.fn().mockReturnValue([displayAccount]),
      },
    }))

    vi.doMock("~/services/redemption/redeemService", () => ({
      redeemService: {
        redeemCodeForAccount,
      },
    }))

    const { handleRedemptionAssistMessage } = await import(
      "~/services/redemption/redemptionAssist"
    )

    const sendResponse = vi.fn()

    await handleRedemptionAssistMessage(
      {
        action: RuntimeActionIds.RedemptionAssistAutoRedeemByUrl,
        url: "https://example.com/redeem",
        code: "CODE_2",
      },
      {} as any,
      sendResponse,
    )

    expect(redeemCodeForAccount).toHaveBeenCalledWith("acc_2", "CODE_2")
    expect(refreshAccount).toHaveBeenCalledWith("acc_2", true)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "ok",
        selectedAccount: displayAccount,
      },
    })
  })

  it("swallows refresh failures and still reports redemption success", async () => {
    vi.resetModules()

    const refreshAccount = vi.fn().mockRejectedValue(new Error("refresh boom"))
    const redeemCodeForAccount = vi
      .fn()
      .mockResolvedValue({ success: true, message: "ok" })

    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        refreshAccount,
      },
    }))

    vi.doMock("~/services/redemption/redeemService", () => ({
      redeemService: {
        redeemCodeForAccount,
      },
    }))

    const { handleRedemptionAssistMessage } = await import(
      "~/services/redemption/redemptionAssist"
    )

    const sendResponse = vi.fn()

    await handleRedemptionAssistMessage(
      {
        action: RuntimeActionIds.RedemptionAssistAutoRedeem,
        accountId: "acc_3",
        code: "CODE_3",
      },
      {} as any,
      sendResponse,
    )

    expect(refreshAccount).toHaveBeenCalledWith("acc_3", true)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: { success: true, message: "ok" },
    })
  })

  it("awaits refresh before responding", async () => {
    vi.resetModules()

    let resolveRefresh: ((value: { refreshed: true }) => void) | undefined
    const refreshAccount = vi.fn(
      () =>
        new Promise<{ refreshed: true }>((resolve) => {
          resolveRefresh = resolve
        }),
    )
    const redeemCodeForAccount = vi
      .fn()
      .mockResolvedValue({ success: true, message: "ok" })

    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        refreshAccount,
      },
    }))

    vi.doMock("~/services/redemption/redeemService", () => ({
      redeemService: {
        redeemCodeForAccount,
      },
    }))

    const { handleRedemptionAssistMessage } = await import(
      "~/services/redemption/redemptionAssist"
    )

    const sendResponse = vi.fn()

    const handlePromise = handleRedemptionAssistMessage(
      {
        action: RuntimeActionIds.RedemptionAssistAutoRedeem,
        accountId: "acc_await",
        code: "CODE_AWAIT",
      },
      {} as any,
      sendResponse,
    )

    await Promise.resolve()
    expect(refreshAccount).toHaveBeenCalledWith("acc_await", true)
    expect(sendResponse).not.toHaveBeenCalled()

    resolveRefresh?.({ refreshed: true })
    await handlePromise

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: { success: true, message: "ok" },
    })
  })

  it("does not refresh when redemption fails", async () => {
    vi.resetModules()

    const refreshAccount = vi.fn().mockResolvedValue({ refreshed: true })
    const redeemCodeForAccount = vi
      .fn()
      .mockResolvedValue({ success: false, message: "nope" })

    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        refreshAccount,
      },
    }))

    vi.doMock("~/services/redemption/redeemService", () => ({
      redeemService: {
        redeemCodeForAccount,
      },
    }))

    const { handleRedemptionAssistMessage } = await import(
      "~/services/redemption/redemptionAssist"
    )

    const sendResponse = vi.fn()

    await handleRedemptionAssistMessage(
      {
        action: RuntimeActionIds.RedemptionAssistAutoRedeem,
        accountId: "acc_4",
        code: "CODE_4",
      },
      {} as any,
      sendResponse,
    )

    expect(refreshAccount).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: { success: false, message: "nope" },
    })
  })
})
