import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { SITE_TYPES } from "~/constants/siteType"
import { validateAndSaveAccount } from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import { DefaultTokenLifecyclePolicyBlockedError } from "~/services/accounts/defaultTokenLifecycle"
import { TOKEN_PROVISIONING_BLOCK_REASONS } from "~/services/apiAdapters/contracts/tokenProvisioning"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { AuthTypeEnum, type CheckInConfig, type DisplaySiteData } from "~/types"

const {
  fetchAccountDataMock,
  ensureDefaultApiTokenForAccountMock,
  getSiteTypeCapabilitiesMock,
  toastSuccessMock,
  toastErrorMock,
  toastCustomMock,
  toastLoadingMock,
  toastDismissMock,
} = vi.hoisted(() => ({
  fetchAccountDataMock: vi.fn(),
  ensureDefaultApiTokenForAccountMock: vi.fn(),
  getSiteTypeCapabilitiesMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastCustomMock: vi.fn(),
  toastLoadingMock: vi.fn(),
  toastDismissMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
    custom: toastCustomMock,
    loading: toastLoadingMock,
    dismiss: toastDismissMock,
  },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: getSiteTypeCapabilitiesMock,
}))

vi.mock(
  "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken",
  () => ({
    ensureDefaultApiTokenForAccount: ensureDefaultApiTokenForAccountMock,
    generateDefaultTokenRequest: () => ({
      name: "user group (auto)",
      unlimited_quota: true,
      expired_time: -1,
      remain_quota: 0,
      allow_ips: "",
      model_limits_enabled: false,
      model_limits: "",
      group: "",
    }),
  }),
)

const CHECK_IN_DISABLED: CheckInConfig = {
  enableDetection: false,
  autoCheckInEnabled: true,
  siteStatus: { isCheckedInToday: false },
  customCheckIn: {
    url: "",
    redeemUrl: "",
    openRedeemWithCheckIn: true,
    isCheckedInToday: false,
  },
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("accountOperations auto-provision key on add", () => {
  beforeEach(async () => {
    fetchAccountDataMock.mockReset()
    ensureDefaultApiTokenForAccountMock.mockReset()
    getSiteTypeCapabilitiesMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    toastCustomMock.mockReset()
    toastLoadingMock.mockReset()
    toastDismissMock.mockReset()

    fetchAccountDataMock.mockResolvedValue({
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
      checkIn: CHECK_IN_DISABLED,
    })
    getSiteTypeCapabilitiesMock.mockReturnValue({
      account: {
        data: {
          fetchData: fetchAccountDataMock,
        },
      },
    })

    ensureDefaultApiTokenForAccountMock.mockResolvedValue({
      token: { id: 1, name: "t", key: "k" },
      created: true,
    })

    await accountStorage.clearAllData()

    const storage = new Storage({ area: "local" })
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: true,
    })
  })

  it("runs auto-provision after saving when enabled and eligible", async () => {
    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)
    expect(result.accountId).toBeTruthy()

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
    expect(toastCustomMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("uses warning toast when auto-provision is skipped because an API key already exists", async () => {
    ensureDefaultApiTokenForAccountMock.mockResolvedValueOnce({
      token: { id: 1, name: "t", key: "k" },
      created: false,
    })

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledTimes(1)
    expect(toastCustomMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("does not run auto-provision when the preference is disabled", async () => {
    const storage = new Storage({ area: "local" })
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: false,
    })

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("uses the disambiguated account label for the auto-provision flow", async () => {
    const firstResult = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester-1",
      "test-token-1",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(firstResult.success).toBe(true)

    await flushPromises()
    await flushPromises()

    toastSuccessMock.mockReset()
    ensureDefaultApiTokenForAccountMock.mockClear()

    const secondResult = await validateAndSaveAccount(
      "https://api-2.example.com",
      "Test Site",
      "tester-2",
      "test-token-2",
      "2",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(secondResult.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
    expect(toastCustomMock).not.toHaveBeenCalled()
    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledWith({
      account: expect.objectContaining({
        site_name: "Test Site",
        account_info: expect.objectContaining({
          username: "tester-2",
        }),
      }),
    })
  })

  it("defaults to disabling auto-provision when preferences read fails", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockRejectedValueOnce(
      new Error("prefs-fail"),
    )

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).not.toHaveBeenCalled()
  })

  it("silently ignores policy-blocked auto-provision for sub2api accounts", async () => {
    ensureDefaultApiTokenForAccountMock.mockRejectedValueOnce(
      new DefaultTokenLifecyclePolicyBlockedError({
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
        message: "messages:tokenProvisioning.createRequiresGroup",
      }),
    )

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.SUB2API,
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("silently ignores policy-blocked auto-provision for AIHubMix accounts", async () => {
    ensureDefaultApiTokenForAccountMock.mockRejectedValueOnce(
      new DefaultTokenLifecyclePolicyBlockedError({
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired,
        message: "messages:aihubmix.createRequiresOneTimeKeyDialog",
      }),
    )

    const result = await validateAndSaveAccount(
      "https://aihubmix.example.invalid",
      "AIHubMix",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.AIHUBMIX,
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("skips auto-provision for none-auth accounts", async () => {
    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.None,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("does not fail account add when provisioning throws", async () => {
    ensureDefaultApiTokenForAccountMock.mockRejectedValueOnce(new Error("boom"))

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledTimes(1)
  })

  it("does not require saved display request fields for background auto-provision", async () => {
    const invalidDisplaySiteData: Partial<DisplaySiteData> = {
      id: "invalid-display-account",
      name: "Invalid Display",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://api.example.com",
      authType: AuthTypeEnum.AccessToken,
      userId: "1",
      token: "",
      cookieAuthSessionCookie: "",
    }
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValueOnce(
      invalidDisplaySiteData as DisplaySiteData,
    )

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({
          id: expect.any(String),
          site_url: "https://api.example.com",
          account_info: expect.objectContaining({
            id: "1",
            access_token: "test-token",
          }),
        }),
      }),
    )
    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
    expect(toastErrorMock).not.toHaveBeenCalled()
  })
})
