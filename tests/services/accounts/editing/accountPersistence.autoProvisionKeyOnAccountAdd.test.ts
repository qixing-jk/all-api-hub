import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { OPENROUTER_WEB_ORIGIN, SITE_TYPES } from "~/constants/siteType"
import { autoProvisionKeyOnAccountAdd } from "~/services/accounts/accountKeyAutoProvisioning/autoProvisionOnAccountAdd"
import { validateAndSaveAccount } from "~/services/accounts/editing/accountCreation"
import type { AccountKeyResourceSession } from "~/services/apiAdapters/contracts/accountKeyResource"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"
import { accountStorageTestSurface as accountStorage } from "~~/tests/test-utils/accountStorageTestSurface"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const {
  fetchAccountDataMock,
  ensureAccountKeyMock,
  getSiteTypeCapabilitiesMock,
  toastSuccessMock,
  toastErrorMock,
  toastWarningMock,
  toastLoadingMock,
  toastDismissMock,
  validateManagementKeyMock,
} = vi.hoisted(() => ({
  fetchAccountDataMock: vi.fn(),
  ensureAccountKeyMock: vi.fn(),
  getSiteTypeCapabilitiesMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastWarningMock: vi.fn(),
  toastLoadingMock: vi.fn(),
  toastDismissMock: vi.fn(),
  validateManagementKeyMock: vi.fn(),
}))

vi.mock("~/lib/notify", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
    warning: toastWarningMock,
    loading: toastLoadingMock,
    dismiss: toastDismissMock,
  },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: getSiteTypeCapabilitiesMock,
}))

vi.mock("~/services/apiService/openrouter", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/apiService/openrouter")
  >()),
  validateManagementKey: validateManagementKeyMock,
}))

vi.mock("~/services/accounts/keys/accountKeyCreation", () => ({
  ensureAccountKey: ensureAccountKeyMock,
}))

const CHECK_IN_DISABLED = buildCheckInConfig({
  customCheckIn: {
    url: "",
    redeemUrl: "",
    openRedeemWithCheckIn: true,
    isCheckedInToday: false,
  },
})

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("accountPersistence auto-provision key on add", () => {
  beforeEach(async () => {
    fetchAccountDataMock.mockReset()
    ensureAccountKeyMock.mockReset()
    getSiteTypeCapabilitiesMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    toastWarningMock.mockReset()
    toastLoadingMock.mockReset()
    toastDismissMock.mockReset()
    validateManagementKeyMock.mockReset()
    validateManagementKeyMock.mockResolvedValue({
      userId: "openrouter:local-identity",
    })

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
        keyResourceManagement: {
          defaultCreation: "editor-defaults",
          open: vi.fn(),
        },
      },
    })

    ensureAccountKeyMock.mockResolvedValue({
      token: { id: 1, name: "t", key: "k" },
      kind: "created",
    })

    await accountStorage.clearAllData()

    const storage = new Storage({ area: "local" })
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: true,
    })
  })

  it("silently skips provisioning when the saved account no longer exists", async () => {
    await autoProvisionKeyOnAccountAdd("missing-account", true)

    expect(ensureAccountKeyMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastWarningMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("runs auto-provision after saving when enabled and eligible", async () => {
    const result = await validateAndSaveAccount({
      url: "https://api.example.com",
      siteName: "Test Site",
      username: "tester",
      accessToken: "test-token",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: "unknown",
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    })

    expect(result.success).toBe(true)
    expect(result.accountId).toBeTruthy()

    await flushPromises()
    await flushPromises()

    expect(ensureAccountKeyMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
    expect(toastWarningMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("uses the saved all-groups mode to fill missing groups through native provisioning", async () => {
    const remoteGroups = new Set(["group:existing"])
    const session: AccountKeyResourceSession = {
      resolveDefaultScope: vi.fn(),
      listScopes: vi.fn(),
      openCollection: vi.fn(),
      openCreateEditor: vi.fn(),
      provisioning: {
        inspect: async () => ({
          requirements: ["group:existing", "group:missing"].map((group) => ({
            requirementKey: group,
            displayName: group,
            provisioning: { kind: "automatic" as const },
          })),
          items: [...remoteGroups].map((group) => ({
            ref: {
              accountId: "account",
              siteType: SITE_TYPES.NEW_API,
              scopeKey: "account",
              resourceId: group,
            },
            placement: {
              kind: "requirement" as const,
              requirementKeys: [group],
            },
            coverage: "usable" as const,
          })),
        }),
        provision: async (group) => {
          remoteGroups.add(group)
          return {
            certainty: "applied",
            value: {
              ref: {
                accountId: "account",
                siteType: SITE_TYPES.NEW_API,
                scopeKey: "account",
                resourceId: group,
              },
            },
          }
        },
      },
    }
    getSiteTypeCapabilitiesMock.mockReturnValue({
      account: {
        data: { fetchData: fetchAccountDataMock },
        keyResourceManagement: { open: async () => session },
      },
    })
    await userPreferences.savePreferences({
      autoProvisionKeyOnAccountAdd: true,
      autoProvisionKeyOnAccountAddMode: "all-groups",
    })

    const result = await validateAndSaveAccount({
      url: "https://api.example.com",
      siteName: "Test Site",
      username: "tester",
      accessToken: "test-token",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    })

    expect(result.success).toBe(true)
    await vi.waitFor(() => expect(remoteGroups.has("group:missing")).toBe(true))
    expect(remoteGroups.size).toBe(2)
    expect(ensureAccountKeyMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "messages:accountOperations.autoProvisionGroupsCreated",
    )
  })

  it("uses warning toast when auto-provision is skipped because an API key already exists", async () => {
    ensureAccountKeyMock.mockResolvedValueOnce({
      token: { id: 1, name: "t", key: "k" },
      kind: "ready",
    })

    const result = await validateAndSaveAccount({
      url: "https://api.example.com",
      siteName: "Test Site",
      username: "tester",
      accessToken: "test-token",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: "unknown",
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    })

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureAccountKeyMock).toHaveBeenCalledTimes(1)
    expect(toastWarningMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("does not run auto-provision when the preference is disabled", async () => {
    const storage = new Storage({ area: "local" })
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: false,
    })

    const result = await validateAndSaveAccount({
      url: "https://api.example.com",
      siteName: "Test Site",
      username: "tester",
      accessToken: "test-token",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: "unknown",
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    })

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureAccountKeyMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("preserves the saved account name and identity for native auto-provision", async () => {
    const firstResult = await validateAndSaveAccount({
      url: "https://api.example.com",
      siteName: "Test Site",
      username: "tester-1",
      accessToken: "test-token-1",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: "unknown",
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    })

    expect(firstResult.success).toBe(true)

    await flushPromises()
    await flushPromises()

    toastSuccessMock.mockReset()
    ensureAccountKeyMock.mockClear()

    const secondResult = await validateAndSaveAccount({
      url: "https://api-2.example.com",
      siteName: "Test Site",
      username: "tester-2",
      accessToken: "test-token-2",
      userId: "2",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: "unknown",
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    })

    expect(secondResult.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureAccountKeyMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
    expect(toastWarningMock).not.toHaveBeenCalled()
    expect(ensureAccountKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Test Site",
        username: "tester-2",
      }),
    )
  })

  it("defaults to disabling auto-provision when preferences read fails", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockRejectedValueOnce(
      new Error("prefs-fail"),
    )

    const result = await validateAndSaveAccount({
      url: "https://api.example.com",
      siteName: "Test Site",
      username: "tester",
      accessToken: "test-token",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: "unknown",
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    })

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureAccountKeyMock).not.toHaveBeenCalled()
  })

  it("explains when auto-provision needs a manual group selection", async () => {
    ensureAccountKeyMock.mockResolvedValueOnce({
      kind: "input-required",
      reason: "editor",
    })

    const result = await validateAndSaveAccount({
      url: "https://api.example.com",
      siteName: "Test Site",
      username: "",
      accessToken: "test-token",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: SITE_TYPES.SUB2API,
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    })

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureAccountKeyMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(toastWarningMock).toHaveBeenCalledTimes(1)
  })

  it("explains when a one-time key must be created manually", async () => {
    ensureAccountKeyMock.mockResolvedValueOnce({
      kind: "input-required",
      reason: "one-time-secret",
    })

    const result = await validateAndSaveAccount({
      url: "https://aihubmix.example.invalid",
      siteName: "AIHubMix",
      username: "tester",
      accessToken: "test-token",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: SITE_TYPES.AIHUBMIX,
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    })

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureAccountKeyMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(toastWarningMock).toHaveBeenCalledTimes(1)
  })

  it("explains that OpenRouter does not use legacy automatic key creation", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.OPENROUTER,
      account: {
        data: { fetchData: fetchAccountDataMock },
        keyResourceManagement: { open: vi.fn() },
      },
    })

    const result = await validateAndSaveAccount({
      url: OPENROUTER_WEB_ORIGIN,
      siteName: "OpenRouter",
      username: "",
      accessToken: "management-key-placeholder",
      userId: "",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: SITE_TYPES.OPENROUTER,
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    })

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureAccountKeyMock).not.toHaveBeenCalled()
    expect(toastWarningMock).toHaveBeenCalledTimes(1)
  })

  it("skips auto-provision for none-auth accounts", async () => {
    const result = await validateAndSaveAccount({
      url: "https://api.example.com",
      siteName: "Test Site",
      username: "tester",
      accessToken: "",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: "unknown",
      authType: AuthTypeEnum.None,
      cookieAuthSessionCookie: "",
    })

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureAccountKeyMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("explains that service-credential-only accounts do not support automatic key creation", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.SHAREDCHAT,
      account: {
        data: {
          fetchData: fetchAccountDataMock,
        },
        serviceCredential: {
          fetch: vi.fn(),
          rotate: vi.fn(),
        },
      },
    })

    const result = await validateAndSaveAccount({
      url: "https://sharedchat.example.invalid",
      siteName: "SharedChat",
      username: "tester",
      accessToken: "",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: SITE_TYPES.SHAREDCHAT,
      authType: AuthTypeEnum.Cookie,
      cookieAuthSessionCookie: "session=abc",
    })

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureAccountKeyMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastWarningMock).toHaveBeenCalledTimes(1)
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("does not fail account add when provisioning throws", async () => {
    ensureAccountKeyMock.mockRejectedValueOnce(new Error("boom"))

    const result = await validateAndSaveAccount({
      url: "https://api.example.com",
      siteName: "Test Site",
      username: "tester",
      accessToken: "test-token",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: "unknown",
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    })

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureAccountKeyMock).toHaveBeenCalledTimes(1)
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

    const result = await validateAndSaveAccount({
      url: "https://api.example.com",
      siteName: "Test Site",
      username: "tester",
      accessToken: "test-token",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: "unknown",
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    })

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureAccountKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        baseUrl: "https://api.example.com",
        userId: "1",
        token: "test-token",
      }),
    )
    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
    expect(toastErrorMock).not.toHaveBeenCalled()
  })
})
