import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_ROUTE_KINDS } from "~/services/accounts/utils/siteRouteResolver"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"

const messagingMocks = vi.hoisted(() => ({
  onRedemptionAssistMessage: vi.fn(() => vi.fn()),
}))

vi.mock("~/services/accounts/utils/siteRouteResolver", () => ({
  SITE_ROUTE_KINDS: {
    CheckIn: "checkIn",
    Redeem: "redeem",
  },
  resolveAccountSiteRouteUrl: vi.fn(
    (account: { baseUrl: string }, route: "checkIn" | "redeem") =>
      Promise.resolve(
        `${account.baseUrl}${route === "checkIn" ? "/profile" : "/wallet"}`,
      ),
  ),
}))

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

vi.mock("~/services/redemption/redemptionAssistMessaging", () => ({
  RedemptionAssistMessageTypes: {
    UpdateSettings: "redemptionAssist:updateSettings",
    ShouldPrompt: "redemptionAssist:shouldPrompt",
    AutoRedeem: "redemptionAssist:autoRedeem",
    AutoRedeemByUrl: "redemptionAssist:autoRedeemByUrl",
  },
  onRedemptionAssistMessage: messagingMocks.onRedemptionAssistMessage,
}))

async function resolveShouldPrompt(
  request: { url: string; codes: string[] },
  sender: browser.runtime.MessageSender = {},
) {
  const { resolveRedemptionAssistShouldPromptMessage } = await import(
    "~/services/redemption/redemptionAssist"
  )
  return resolveRedemptionAssistShouldPromptMessage(request, sender)
}

async function updateRuntimeSettings(request: { settings: any }) {
  const { updateRedemptionAssistRuntimeSettings } = await import(
    "~/services/redemption/redemptionAssist"
  )
  return updateRedemptionAssistRuntimeSettings(request)
}

async function resolveAutoRedeem(request: { accountId: string; code: string }) {
  const { resolveRedemptionAssistAutoRedeemMessage } = await import(
    "~/services/redemption/redemptionAssist"
  )
  return resolveRedemptionAssistAutoRedeemMessage(request)
}

async function resolveAutoRedeemByUrl(request: { url: string; code: string }) {
  const { resolveRedemptionAssistAutoRedeemByUrlMessage } = await import(
    "~/services/redemption/redemptionAssist"
  )
  return resolveRedemptionAssistAutoRedeemByUrlMessage(request)
}

describe("redemptionAssist shouldPrompt batch filtering", () => {
  it("registers typed runtime listeners once", async () => {
    vi.resetModules()
    messagingMocks.onRedemptionAssistMessage.mockClear()

    const { setupRedemptionAssistMessagingListeners } = await import(
      "~/services/redemption/redemptionAssist"
    )

    setupRedemptionAssistMessagingListeners()
    setupRedemptionAssistMessagingListeners()

    expect(messagingMocks.onRedemptionAssistMessage).toHaveBeenCalledTimes(4)
    expect(messagingMocks.onRedemptionAssistMessage).toHaveBeenNthCalledWith(
      1,
      "redemptionAssist:updateSettings",
      expect.any(Function),
    )
    expect(messagingMocks.onRedemptionAssistMessage).toHaveBeenNthCalledWith(
      2,
      "redemptionAssist:shouldPrompt",
      expect.any(Function),
    )
    expect(messagingMocks.onRedemptionAssistMessage).toHaveBeenNthCalledWith(
      3,
      "redemptionAssist:autoRedeem",
      expect.any(Function),
    )
    expect(messagingMocks.onRedemptionAssistMessage).toHaveBeenNthCalledWith(
      4,
      "redemptionAssist:autoRedeemByUrl",
      expect.any(Function),
    )
  })

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

    const validHex = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
    const invalidHex = "g1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
    const tooShort = "1234"

    const response = await resolveShouldPrompt(
      {
        url: "https://example.com/redeem",
        codes: [validHex, invalidHex, tooShort],
      },
      { tab: { id: 99 } } as any,
    )

    expect(response).toEqual({
      success: true,
      promptableCodes: [validHex],
    })
  })

  it("filters out codes when the whitelist blocks the url", async () => {
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
          enabled: true,
          patterns: ["^https://allowed\\.example\\.com"],
          includeAccountSiteUrls: false,
          includeCheckInAndRedeemUrls: false,
        },
        relaxedCodeValidation: false,
      },
    })

    const response = await resolveShouldPrompt(
      {
        url: "https://blocked.example.com/redeem",
        codes: ["a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"],
      },
      { tab: { id: 7 } } as any,
    )

    expect(response).toEqual({
      success: true,
      promptableCodes: [],
    })
  })

  it("allows prompting when the whitelist is enabled but resolves to no effective patterns", async () => {
    vi.resetModules()
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      redemptionAssist: {
        enabled: true,
        contextMenu: {
          enabled: true,
        },
        urlWhitelist: {
          enabled: true,
          patterns: ["", "   ", null as any],
          includeAccountSiteUrls: false,
          includeCheckInAndRedeemUrls: false,
        },
        relaxedCodeValidation: false,
      },
    })

    const validHex = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"

    const response = await resolveShouldPrompt(
      {
        url: "https://anywhere.example.com/redeem",
        codes: [validHex],
      },
      { tab: { id: 8 } } as any,
    )

    expect(response).toEqual({
      success: true,
      promptableCodes: [validHex],
    })
  })

  it("derives whitelist patterns from account urls and reuses the cached pattern set", async () => {
    vi.resetModules()
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      redemptionAssist: {
        enabled: true,
        contextMenu: {
          enabled: true,
        },
        urlWhitelist: {
          enabled: true,
          patterns: [],
          includeAccountSiteUrls: true,
          includeCheckInAndRedeemUrls: true,
        },
        relaxedCodeValidation: false,
      },
    })

    const getAllAccounts = vi.fn().mockResolvedValue([])
    const convertToDisplayData = vi.fn().mockReturnValue([
      {
        id: "acc_derived_1",
        siteType: "new-api",
        baseUrl: "https://allowed.example.com/path",
        disabled: false,
        checkIn: {
          customCheckIn: {
            url: "https://allowed.example.com/custom-check-in",
            redeemUrl: "https://allowed.example.com/custom-redeem",
          },
        },
      },
      {
        id: "acc_derived_2",
        siteType: "new-api",
        baseUrl: "not-a-url",
        disabled: false,
      },
      {
        id: "acc_derived_disabled",
        siteType: "new-api",
        baseUrl: "https://disabled.example.com",
        disabled: true,
      },
    ])

    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        getAllAccounts,
        convertToDisplayData,
      },
    }))

    const validHex = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"

    const firstResponse = await resolveShouldPrompt(
      {
        url: "https://allowed.example.com/custom-redeem/code",
        codes: [validHex],
      },
      { tab: { id: 10 } } as any,
    )

    const secondResponse = await resolveShouldPrompt(
      {
        url: "https://allowed.example.com/custom-check-in",
        codes: [validHex],
      },
      { tab: { id: 10 } } as any,
    )

    expect(firstResponse).toEqual({
      success: true,
      promptableCodes: [validHex],
    })
    expect(secondResponse).toEqual({
      success: true,
      promptableCodes: [validHex],
    })
    expect(getAllAccounts).toHaveBeenCalledTimes(1)
    expect(convertToDisplayData).toHaveBeenCalledTimes(1)
  })

  it("derives default check-in and redeem whitelist patterns through the site route resolver", async () => {
    vi.resetModules()
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      redemptionAssist: {
        enabled: true,
        contextMenu: {
          enabled: true,
        },
        urlWhitelist: {
          enabled: true,
          patterns: [],
          includeAccountSiteUrls: false,
          includeCheckInAndRedeemUrls: true,
        },
        relaxedCodeValidation: false,
      },
    })

    const getAllAccounts = vi.fn().mockResolvedValue([])
    const convertToDisplayData = vi.fn().mockReturnValue([
      {
        id: "acc_default_routes",
        siteType: "new-api",
        baseUrl: "https://new-api-default.example/path",
        disabled: false,
      },
    ])

    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        getAllAccounts,
        convertToDisplayData,
      },
    }))

    const { resolveAccountSiteRouteUrl } = await import(
      "~/services/accounts/utils/siteRouteResolver"
    )
    const validHex = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"

    const response = await resolveShouldPrompt(
      {
        url: "https://new-api-default.example/wallet/code",
        codes: [validHex],
      },
      { tab: { id: 12 } } as any,
    )

    expect(resolveAccountSiteRouteUrl).toHaveBeenCalledWith(
      {
        baseUrl: "https://new-api-default.example",
        siteType: "new-api",
      },
      SITE_ROUTE_KINDS.CheckIn,
    )
    expect(resolveAccountSiteRouteUrl).toHaveBeenCalledWith(
      {
        baseUrl: "https://new-api-default.example",
        siteType: "new-api",
      },
      SITE_ROUTE_KINDS.Redeem,
    )
    expect(response).toEqual({
      success: true,
      promptableCodes: [validHex],
    })
  })

  it("updates runtime settings through the message handler and disables promptability immediately", async () => {
    vi.resetModules()
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      redemptionAssist: {
        enabled: true,
        contextMenu: {
          enabled: true,
        },
        urlWhitelist: {
          enabled: false,
          patterns: [],
          includeAccountSiteUrls: true,
          includeCheckInAndRedeemUrls: true,
        },
        relaxedCodeValidation: false,
      },
    })

    const validHex = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"

    const firstResponse = await resolveShouldPrompt(
      {
        url: "https://runtime.example.com/redeem",
        codes: [validHex],
      },
      { tab: { id: 11 } } as any,
    )

    const updateResponse = await updateRuntimeSettings({
      settings: {
        enabled: false,
        relaxedCodeValidation: true,
        urlWhitelist: {
          enabled: true,
          patterns: ["^https://runtime\\.example\\.com"],
          includeAccountSiteUrls: false,
          includeCheckInAndRedeemUrls: false,
        },
      },
    })

    const secondResponse = await resolveShouldPrompt(
      {
        url: "https://runtime.example.com/redeem",
        codes: [validHex],
      },
      { tab: { id: 11 } } as any,
    )

    expect(firstResponse).toEqual({
      success: true,
      promptableCodes: [validHex],
    })
    expect(updateResponse).toEqual({ success: true })
    expect(secondResponse).toEqual({
      success: true,
      promptableCodes: [],
    })
  })

  it("falls back to default runtime settings when loading preferences fails", async () => {
    vi.resetModules()
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockRejectedValue(
      new Error("prefs exploded"),
    )

    const response = await resolveShouldPrompt(
      {
        url: "https://example.com/redeem",
        codes: ["z".repeat(32)],
      },
      { tab: { id: 12 } } as any,
    )

    expect(response).toEqual({
      success: true,
      promptableCodes: ["z".repeat(32)],
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

    const response = await resolveAutoRedeem({
      accountId: "acc_1",
      code: "CODE_1",
    })

    expect(redeemCodeForAccount).toHaveBeenCalledWith("acc_1", "CODE_1")
    expect(refreshAccount).toHaveBeenCalledWith("acc_1", true)
    expect(response).toEqual({
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

    const response = await resolveAutoRedeemByUrl({
      url: "https://example.com/redeem",
      code: "CODE_2",
    })

    expect(redeemCodeForAccount).toHaveBeenCalledWith("acc_2", "CODE_2")
    expect(refreshAccount).toHaveBeenCalledWith("acc_2", true)
    expect(response).toEqual({
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

    const response = await resolveAutoRedeem({
      accountId: "acc_3",
      code: "CODE_3",
    })

    expect(refreshAccount).toHaveBeenCalledWith("acc_3", true)
    expect(response).toEqual({
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

    const handlePromise = resolveAutoRedeem({
      accountId: "acc_await",
      code: "CODE_AWAIT",
    })

    await vi.waitFor(() => {
      expect(refreshAccount).toHaveBeenCalledWith("acc_await", true)
    })
    let resolved = false
    handlePromise.then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(false)

    resolveRefresh?.({ refreshed: true })
    const response = await handlePromise

    expect(response).toEqual({
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

    const response = await resolveAutoRedeem({
      accountId: "acc_4",
      code: "CODE_4",
    })

    expect(refreshAccount).not.toHaveBeenCalled()
    expect(response).toEqual({
      success: true,
      data: { success: false, message: "nope" },
    })
  })

  it("returns INVALID_URL when auto redeem by url receives an unparsable url", async () => {
    vi.resetModules()

    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue(
      DEFAULT_PREFERENCES,
    )

    const response = await resolveAutoRedeemByUrl({
      url: "not-a-url",
      code: "CODE_BAD_URL",
    })

    expect(response).toEqual({
      success: true,
      data: {
        success: false,
        code: "INVALID_URL",
        message: "redemptionAssist:messages.noAccountForUrl",
      },
    })
  })

  it("returns MULTIPLE_ACCOUNTS when several same-domain candidates match", async () => {
    vi.resetModules()

    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue(
      DEFAULT_PREFERENCES,
    )

    const candidates = [
      {
        id: "acc_multi_1",
        baseUrl: "https://example.com",
        checkIn: { customCheckIn: { url: "https://example.com/check-in" } },
      },
      {
        id: "acc_multi_2",
        baseUrl: "https://example.com",
        checkIn: { customCheckIn: { url: "https://example.com/redeem" } },
      },
    ]

    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        getAllAccounts: vi.fn().mockResolvedValue([]),
        convertToDisplayData: vi.fn().mockReturnValue(candidates),
      },
    }))

    vi.doMock("~/services/search/accountSearch", () => ({
      searchAccounts: vi.fn().mockReturnValue(
        candidates.map((account) => ({
          account,
        })),
      ),
    }))

    const response = await resolveAutoRedeemByUrl({
      url: "https://example.com/redeem",
      code: "CODE_MULTI",
    })

    expect(response).toEqual({
      success: true,
      data: {
        success: false,
        code: "MULTIPLE_ACCOUNTS",
        candidates,
      },
    })
  })

  it("returns NO_ACCOUNTS when search results exist but none provide a matching custom check-in url", async () => {
    vi.resetModules()

    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue(
      DEFAULT_PREFERENCES,
    )

    const allAccounts = [
      {
        id: "acc_missing_checkin",
        baseUrl: "https://manual.example.com",
      },
    ]

    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        getAllAccounts: vi.fn().mockResolvedValue([]),
        convertToDisplayData: vi.fn().mockReturnValue(allAccounts),
      },
    }))

    vi.doMock("~/services/search/accountSearch", () => ({
      searchAccounts: vi.fn().mockReturnValue(
        allAccounts.map((account) => ({
          account,
        })),
      ),
    }))

    const response = await resolveAutoRedeemByUrl({
      url: "https://example.com/redeem",
      code: "CODE_NO_CUSTOM_URL",
    })

    expect(response).toEqual({
      success: true,
      data: {
        success: false,
        code: "NO_ACCOUNTS",
        candidates: [],
        allAccounts,
        message: "redemptionAssist:messages.noAccountForUrl",
      },
    })
  })

  it("returns the failed redeem result for a single matched account without refreshing", async () => {
    vi.resetModules()

    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue(
      DEFAULT_PREFERENCES,
    )

    const refreshAccount = vi.fn().mockResolvedValue({ refreshed: true })
    const redeemCodeForAccount = vi
      .fn()
      .mockResolvedValue({ success: false, message: "denied" })

    const displayAccount = {
      id: "acc_single_fail",
      baseUrl: "https://example.com",
      checkIn: {
        customCheckIn: {
          url: "https://example.com/check-in",
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

    vi.doMock("~/services/search/accountSearch", () => ({
      searchAccounts: vi.fn().mockReturnValue([
        {
          account: displayAccount,
        },
      ]),
    }))

    vi.doMock("~/services/redemption/redeemService", () => ({
      redeemService: {
        redeemCodeForAccount,
      },
    }))

    const response = await resolveAutoRedeemByUrl({
      url: "https://example.com/redeem",
      code: "CODE_FAIL",
    })

    expect(refreshAccount).not.toHaveBeenCalled()
    expect(response).toEqual({
      success: true,
      data: {
        success: false,
        message: "denied",
        selectedAccount: displayAccount,
      },
    })
  })

  it("returns NO_ACCOUNTS with all accounts when no same-domain candidate matches", async () => {
    vi.resetModules()

    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue(
      DEFAULT_PREFERENCES,
    )

    const allAccounts = [
      {
        id: "acc_manual_1",
        baseUrl: "https://manual.example.com",
        checkIn: {
          customCheckIn: { url: "https://other.example.com/check-in" },
        },
      },
    ]

    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        getAllAccounts: vi.fn().mockResolvedValue([]),
        convertToDisplayData: vi.fn().mockReturnValue(allAccounts),
      },
    }))

    vi.doMock("~/services/search/accountSearch", () => ({
      searchAccounts: vi.fn().mockReturnValue([]),
    }))

    const response = await resolveAutoRedeemByUrl({
      url: "https://example.com/redeem",
      code: "CODE_NONE",
    })

    expect(response).toEqual({
      success: true,
      data: {
        success: false,
        code: "NO_ACCOUNTS",
        candidates: [],
        allAccounts,
        message: "redemptionAssist:messages.noAccountForUrl",
      },
    })
  })

  it("handles validation failures", async () => {
    vi.resetModules()

    await expect(resolveShouldPrompt({ url: "", codes: [] })).resolves.toEqual({
      success: false,
      error: "Missing url or codes",
    })
    await expect(
      resolveAutoRedeem({ accountId: "", code: "" }),
    ).resolves.toEqual({
      success: false,
      error: "Missing accountId or code",
    })
    await expect(
      resolveAutoRedeemByUrl({ url: "", code: "" }),
    ).resolves.toEqual({
      success: false,
      error: "Missing url or code",
    })
  })

  it("reports handler errors when redeeming throws", async () => {
    vi.resetModules()

    const redeemCodeForAccount = vi
      .fn()
      .mockRejectedValue(new Error("redeem exploded"))

    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        refreshAccount: vi.fn(),
      },
    }))

    vi.doMock("~/services/redemption/redeemService", () => ({
      redeemService: {
        redeemCodeForAccount,
      },
    }))

    const response = await resolveAutoRedeem({
      accountId: "acc_error",
      code: "CODE_ERR",
    })

    expect(response).toEqual({
      success: false,
      error: "redeem exploded",
    })
  })
})
