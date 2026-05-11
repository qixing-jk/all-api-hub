import type { FormEvent, ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import {
  ACCOUNT_POST_SAVE_WORKFLOW_STEPS,
  ENSURE_ACCOUNT_TOKEN_RESULT_KINDS,
} from "~/services/accounts/accountPostSaveWorkflow"
import { accountStorage } from "~/services/accounts/accountStorage"
import * as apiServiceRequest from "~/services/accounts/utils/apiServiceRequest"
import {
  AuthTypeEnum,
  SiteAccount,
  SiteHealthStatus,
  type ApiToken,
  type DisplaySiteData,
} from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const {
  mockToast,
  mockValidateAndSaveAccount,
  mockValidateAndUpdateAccount,
  mockEnsureAccountTokenForPostSaveWorkflow,
  mockOpenWithAccount,
  mockOpenSub2ApiTokenCreationDialog,
  mockGetManagedSiteConfig,
  mockOpenSettingsTab,
} = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockValidateAndSaveAccount: vi.fn(),
  mockValidateAndUpdateAccount: vi.fn(),
  mockEnsureAccountTokenForPostSaveWorkflow: vi.fn(),
  mockOpenWithAccount: vi.fn(),
  mockOpenSub2ApiTokenCreationDialog: vi.fn(),
  mockGetManagedSiteConfig: vi.fn(),
  mockOpenSettingsTab: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("react-hot-toast", () => {
  const toastMock = Object.assign(mockToast, {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    custom: vi.fn(),
    dismiss: vi.fn(),
  })

  return {
    default: toastMock,
  }
})

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({
    openWithAccount: mockOpenWithAccount,
    openSub2ApiTokenCreationDialog: mockOpenSub2ApiTokenCreationDialog,
  }),
}))

vi.mock("~/services/accounts/accountOperations", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/accounts/accountOperations")
    >()

  return {
    ...actual,
    validateAndSaveAccount: mockValidateAndSaveAccount,
    validateAndUpdateAccount: mockValidateAndUpdateAccount,
  }
})

vi.mock(
  "~/services/accounts/accountPostSaveWorkflow",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/accountPostSaveWorkflow")
      >()

    return {
      ...actual,
      ensureAccountTokenForPostSaveWorkflow:
        mockEnsureAccountTokenForPostSaveWorkflow,
    }
  },
)

vi.mock(
  "~/services/managedSites/managedSiteService",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/managedSites/managedSiteService")
      >()

    return {
      ...actual,
      getManagedSiteServiceForType: vi.fn(() => ({
        siteType: SITE_TYPES.NEW_API,
        messagesKey: "newapi",
        getConfig: mockGetManagedSiteConfig,
      })),
    }
  },
)

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getActiveTabs: vi.fn(async () => []),
    getAllTabs: vi.fn(async () => []),
    onTabActivated: vi.fn(() => () => {}),
    onTabUpdated: vi.fn(() => () => {}),
    sendRuntimeMessage: vi.fn(),
  }
})

vi.mock("~/utils/navigation", () => ({
  openSettingsTab: mockOpenSettingsTab,
}))

describe("useAccountDialog save and auto-config flows", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    await accountStorage.clearAllData()
    mockValidateAndSaveAccount.mockResolvedValue({
      success: true,
      accountId: "saved-account-id",
      message: "Saved successfully",
      feedbackLevel: "success",
    })
    mockGetManagedSiteConfig.mockResolvedValue({
      baseUrl: "https://managed.example.com",
      token: "admin-token",
      userId: "1",
    })
    mockValidateAndUpdateAccount.mockResolvedValue({
      success: true,
      feedbackLevel: "success",
    })
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: buildToken({ id: 99, key: "sk-default-ensured" }),
      created: false,
    })
    mockOpenWithAccount.mockResolvedValue({ opened: true })
  })

  const renderAddHook = (options?: { onSuccess?: ReturnType<typeof vi.fn> }) =>
    renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: options?.onSuccess ?? vi.fn(),
      }),
    )

  const renderEditHook = (options?: {
    account?: any
    onSuccess?: ReturnType<typeof vi.fn>
  }) => {
    const accountValue =
      options?.account ??
      ({
        id: "existing-account-id",
        siteUrl: "https://edit.example.com",
        siteName: "Edit Example",
      } as any)

    return renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account: accountValue,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: options?.onSuccess ?? vi.fn(),
      }),
    )
  }

  const buildDisplayAccount = (
    overrides: Partial<DisplaySiteData> = {},
  ): DisplaySiteData =>
    ({
      id: "saved-account-id",
      name: "Saved Example",
      username: "saved-user",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      health: { status: SiteHealthStatus.Healthy },
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://api.example.com",
      token: "saved-token",
      userId: 12,
      authType: AuthTypeEnum.AccessToken,
      checkIn: { enableDetection: false },
      cookieAuthSessionCookie: "",
      ...overrides,
    }) as DisplaySiteData

  const buildToken = (overrides: Partial<ApiToken> = {}): ApiToken => ({
    id: 1,
    user_id: 12,
    key: "sk-ensured",
    status: 1,
    name: "ensured",
    created_time: 1,
    accessed_time: 1,
    expired_time: -1,
    remain_quota: -1,
    unlimited_quota: true,
    used_quota: 0,
    ...overrides,
  })

  it("shows managed-site setup guidance before saving when auto-config prerequisites are missing", async () => {
    mockGetManagedSiteConfig.mockResolvedValue(null)

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(mockValidateAndSaveAccount).not.toHaveBeenCalled()
    expect(mockOpenWithAccount).not.toHaveBeenCalled()
    expect(result.current.state.managedSiteConfigPrompt).toMatchObject({
      isOpen: true,
      managedSiteLabel: "settings:managedSite.newApi",
      missingMessage: "messages:newapi.configMissing",
    })
  })

  it("opens managed-site settings from the setup guidance dialog", async () => {
    mockGetManagedSiteConfig.mockResolvedValue(null)

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    await act(async () => {
      result.current.handlers.handleOpenManagedSiteSettings()
    })

    expect(mockOpenSettingsTab).toHaveBeenCalledWith("managedSite", {
      preserveHistory: true,
    })
    expect(result.current.state.managedSiteConfigPrompt.isOpen).toBe(false)
  })

  it("passes trimmed Sub2API refresh-token auth into save and opens the post-save token dialog when display data is available", async () => {
    const savedDisplayData = {
      id: "saved-account-id",
      siteUrl: "https://sub2.example.com",
      siteName: "Sub2API",
    } as any

    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteName("Sub2API")
      result.current.setters.setUsername("sub-user")
      result.current.setters.setAccessToken("jwt-token")
      result.current.setters.setUserId("42")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
      result.current.handlers.handleSub2apiUseRefreshTokenChange(true)
      result.current.setters.setSub2apiRefreshToken(" refresh-token ")
      result.current.setters.setSub2apiTokenExpiresAt(123456789)
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(mockValidateAndSaveAccount).toHaveBeenCalledWith(
      "https://sub2.example.com",
      "Sub2API",
      "sub-user",
      "jwt-token",
      "42",
      "7",
      "",
      [],
      expect.any(Object),
      SITE_TYPES.SUB2API,
      AuthTypeEnum.AccessToken,
      "",
      "",
      false,
      {
        refreshToken: "refresh-token",
        tokenExpiresAt: 123456789,
      },
      { skipAutoProvisionKeyOnAccountAdd: false },
    )
    expect(mockOpenSub2ApiTokenCreationDialog).toHaveBeenCalledWith(
      savedDisplayData,
    )
    expect(toast.success).toHaveBeenCalledWith("Saved successfully")
  })

  it("does not persist Sub2API refresh-token auth until the mode is explicitly enabled", async () => {
    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteName("Sub2API")
      result.current.setters.setUsername("sub-user")
      result.current.setters.setAccessToken("jwt-token")
      result.current.setters.setUserId("42")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
      result.current.setters.setSub2apiRefreshToken(" refresh-token ")
      result.current.setters.setSub2apiTokenExpiresAt(123456789)
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(mockValidateAndSaveAccount).toHaveBeenCalledWith(
      "https://sub2.example.com",
      "Sub2API",
      "sub-user",
      "jwt-token",
      "42",
      "7",
      "",
      [],
      expect.any(Object),
      SITE_TYPES.SUB2API,
      AuthTypeEnum.AccessToken,
      "",
      "",
      false,
      undefined,
      { skipAutoProvisionKeyOnAccountAdd: false },
    )
  })

  it("updates an existing account with trimmed values and uses the default update success toast", async () => {
    const { result } = renderEditHook({
      account: {
        id: "existing-account-id",
      },
    })

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl(" https://edit.example.com/path ")
      result.current.setters.setSiteName(" Example Account ")
      result.current.setters.setUsername(" updated-user ")
      result.current.setters.setAccessToken(" updated-token ")
      result.current.setters.setUserId(" 42 ")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setNotes("  updated notes  ")
      result.current.setters.setTagIds(["tag-a"])
      result.current.setters.setExcludeFromTotalBalance(true)
      result.current.setters.setSiteType("one-api")
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(mockValidateAndUpdateAccount).toHaveBeenCalledWith(
      "existing-account-id",
      "https://edit.example.com/path",
      "Example Account",
      "updated-user",
      "updated-token",
      "42",
      "7",
      "updated notes",
      ["tag-a"],
      expect.any(Object),
      "one-api",
      AuthTypeEnum.AccessToken,
      "",
      "",
      true,
      undefined,
    )
    expect(toast.success).toHaveBeenCalledWith(
      "accountDialog:messages.updateSuccess",
    )
  })

  it("uses a warning toast for partial-success saves when account data refresh fails", async () => {
    mockValidateAndSaveAccount.mockResolvedValueOnce({
      success: true,
      accountId: "saved-account-id",
      message: "Account saved, but latest metrics are placeholders.",
      feedbackLevel: "warning",
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
      result.current.setters.setSiteName("Example")
      result.current.setters.setUsername("user")
      result.current.setters.setAccessToken("token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("one-api")
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(toast.custom).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        duration: 5000,
      }),
    )
    const saveWarningRenderer = vi.mocked(toast.custom).mock.calls[0]?.[0] as
      | ((toastInstance: any) => any)
      | undefined
    const saveWarningElement = saveWarningRenderer?.({
      id: "warning-toast-id",
      type: "custom",
      visible: true,
      dismissed: false,
      height: 0,
      ariaProps: {
        role: "status",
        "aria-live": "polite",
      },
      message: "",
      createdAt: Date.now(),
      pauseDuration: 0,
      position: "bottom-center",
    } as any)
    expect(saveWarningElement?.props.action).toEqual(
      expect.objectContaining({
        label: "common:actions.refresh",
      }),
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("uses a warning toast for partial-success updates when latest account data stays stale", async () => {
    mockValidateAndUpdateAccount.mockResolvedValueOnce({
      success: true,
      accountId: "existing-account-id",
      message: "Account settings saved, but latest metrics are still stale.",
      feedbackLevel: "warning",
    })

    const { result } = renderEditHook({
      account: {
        id: "existing-account-id",
      },
    })

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://edit.example.com")
      result.current.setters.setSiteName("Edit Example")
      result.current.setters.setUsername("user")
      result.current.setters.setAccessToken("token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("one-api")
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(toast.custom).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        duration: 5000,
      }),
    )
    const updateWarningRenderer = vi.mocked(toast.custom).mock.calls[0]?.[0] as
      | ((toastInstance: any) => any)
      | undefined
    const updateWarningElement = updateWarningRenderer?.({
      id: "warning-toast-id",
      type: "custom",
      visible: true,
      dismissed: false,
      height: 0,
      ariaProps: {
        role: "status",
        "aria-live": "polite",
      },
      message: "",
      createdAt: Date.now(),
      pauseDuration: 0,
      position: "bottom-center",
    } as any)
    expect(updateWarningElement?.props.action).toEqual(
      expect.objectContaining({
        label: "common:actions.refresh",
      }),
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("falls back to the local warning copy when a partial-success save returns an empty message", async () => {
    mockValidateAndSaveAccount.mockResolvedValueOnce({
      success: true,
      accountId: "saved-account-id",
      message: "",
      feedbackLevel: "warning",
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
      result.current.setters.setSiteName("Example")
      result.current.setters.setUsername("user")
      result.current.setters.setAccessToken("token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("one-api")
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(toast.custom).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        duration: 5000,
      }),
    )
    const saveWarningRenderer = vi.mocked(toast.custom).mock.calls[0]?.[0] as
      | ((toastInstance: any) => any)
      | undefined
    const saveWarningElement = saveWarningRenderer?.({
      id: "warning-toast-id",
      type: "custom",
      visible: true,
      dismissed: false,
      height: 0,
      ariaProps: {
        role: "status",
        "aria-live": "polite",
      },
      message: "",
      createdAt: Date.now(),
      pauseDuration: 0,
      position: "bottom-center",
    } as any)
    expect(saveWarningElement?.props.message).toBe(
      "accountDialog:messages.addSuccess",
    )
    expect(saveWarningElement?.props.action).toEqual(
      expect.objectContaining({
        label: "common:actions.refresh",
      }),
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("prevents the native form submit and delegates to the normal save flow", async () => {
    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
      result.current.setters.setSiteName("Example")
      result.current.setters.setUsername("user")
      result.current.setters.setAccessToken("token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("one-api")
    })

    const preventDefault = vi.fn()

    await act(async () => {
      result.current.handlers.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(mockValidateAndSaveAccount).toHaveBeenCalledTimes(1)
  })

  it("keeps Sub2API saves successful even when the post-save token dialog fails", async () => {
    const savedDisplayData = {
      id: "saved-account-id",
      siteUrl: "https://sub2.example.com",
      siteName: "Sub2API",
    } as any

    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    mockOpenSub2ApiTokenCreationDialog.mockRejectedValueOnce(
      new Error("dialog boot failed"),
    )

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteName("Sub2API")
      result.current.setters.setUsername("sub-user")
      result.current.setters.setAccessToken("jwt-token")
      result.current.setters.setUserId("42")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    let saveResult: any
    await act(async () => {
      saveResult = await result.current.handlers.handleSaveAccount()
    })

    expect(saveResult).toEqual(
      expect.objectContaining({
        success: true,
        accountId: "saved-account-id",
      }),
    )
    expect(mockOpenSub2ApiTokenCreationDialog).toHaveBeenCalledWith(
      savedDisplayData,
    )
    expect(toast.success).toHaveBeenCalledWith("Saved successfully")
    expect(toast.error).not.toHaveBeenCalled()
    expect(result.current.state.isSaving).toBe(false)
  })

  it("stops auto-config after save when the saved account id is missing", async () => {
    mockValidateAndSaveAccount.mockResolvedValueOnce({
      success: true,
      message: "Saved without id",
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
      result.current.setters.setSiteName("Example")
      result.current.setters.setUsername("user")
      result.current.setters.setAccessToken("token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("one-api")
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(mockValidateAndSaveAccount).toHaveBeenCalledTimes(1)
    expect(mockOpenWithAccount).not.toHaveBeenCalled()
    expect(mockOpenSub2ApiTokenCreationDialog).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      "accountDialog:messages.saveAccountFailed",
    )
  })

  it("new-account quick-config saves without background key provisioning and opens with the ensured token", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Example",
      site_url: "https://api.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.NEW_API,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 12,
        username: "saved-user",
        access_token: "saved-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount()
    const ensuredToken = buildToken({ id: 101, key: "sk-ready" })

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: ensuredToken,
      created: false,
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
      result.current.setters.setSiteName("Example")
      result.current.setters.setUsername("saved-user")
      result.current.setters.setAccessToken("saved-token")
      result.current.setters.setUserId("12")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.NEW_API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(mockValidateAndSaveAccount).toHaveBeenCalledWith(
      "https://api.example.com",
      "Example",
      "saved-user",
      "saved-token",
      "12",
      "7",
      "",
      [],
      expect.any(Object),
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
      "",
      false,
      undefined,
      { skipAutoProvisionKeyOnAccountAdd: true },
    )
    expect(mockEnsureAccountTokenForPostSaveWorkflow).toHaveBeenCalledWith({
      account: savedSiteAccount,
      displaySiteData: savedDisplayData,
    })
    expect(mockOpenWithAccount).toHaveBeenCalledWith(
      savedDisplayData,
      ensuredToken,
      expect.any(Function),
      expect.objectContaining({
        shouldContinue: expect.any(Function),
      }),
    )
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
    )
  })

  it("waits for AIHubMix one-time token acknowledgement before opening quick-config", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "AIHubMix",
      site_url: "https://aihubmix.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.AIHUBMIX,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 13,
        username: "aihubmix-user",
        access_token: "aihubmix-access-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount({
      name: "AIHubMix",
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
      token: "aihubmix-access-token",
      userId: 13,
    })
    const oneTimeToken = buildToken({
      id: 102,
      key: "sk-aihubmix-one-time",
    })

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: oneTimeToken,
      created: true,
      oneTimeSecret: true,
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://aihubmix.com")
      result.current.setters.setSiteName("AIHubMix")
      result.current.setters.setUsername("aihubmix-user")
      result.current.setters.setAccessToken("aihubmix-access-token")
      result.current.setters.setUserId("13")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.AIHUBMIX)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(result.current.state.postSaveOneTimeToken).toBe(oneTimeToken)
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForOneTimeKeyAcknowledgement,
    )
    expect(mockOpenWithAccount).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.handlers.handlePostSaveOneTimeTokenClose()
    })

    expect(result.current.state.postSaveOneTimeToken).toBeNull()
    expect(mockOpenWithAccount).toHaveBeenCalledWith(
      savedDisplayData,
      oneTimeToken,
      expect.any(Function),
      expect.objectContaining({
        shouldContinue: expect.any(Function),
      }),
    )
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
    )
  })

  it("clears AIHubMix post-save workflow state when the dialog closes during one-time token acknowledgement", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "AIHubMix",
      site_url: "https://aihubmix.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.AIHUBMIX,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 13,
        username: "aihubmix-user",
        access_token: "aihubmix-access-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount({
      name: "AIHubMix",
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
      token: "aihubmix-access-token",
      userId: 13,
    })
    const oneTimeToken = buildToken({
      id: 102,
      key: "sk-aihubmix-one-time",
    })

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: oneTimeToken,
      created: true,
      oneTimeSecret: true,
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://aihubmix.com")
      result.current.setters.setSiteName("AIHubMix")
      result.current.setters.setUsername("aihubmix-user")
      result.current.setters.setAccessToken("aihubmix-access-token")
      result.current.setters.setUserId("13")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.AIHUBMIX)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(result.current.state.postSaveOneTimeToken).toBe(oneTimeToken)
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForOneTimeKeyAcknowledgement,
    )

    await act(async () => {
      result.current.handlers.handleClose()
    })

    expect(result.current.state.postSaveOneTimeToken).toBeNull()
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle,
    )
  })

  it("does not restore AIHubMix paused post-save state when a pending token check resolves after close and reopen", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "AIHubMix",
      site_url: "https://aihubmix.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.AIHUBMIX,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 13,
        username: "aihubmix-user",
        access_token: "aihubmix-access-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount({
      name: "AIHubMix",
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
      token: "aihubmix-access-token",
      userId: 13,
    })
    const oneTimeToken = buildToken({
      id: 108,
      key: "sk-aihubmix-stale-one-time",
    })

    let resolveEnsureAccountToken:
      | ((
          value: Awaited<
            ReturnType<typeof mockEnsureAccountTokenForPostSaveWorkflow>
          >,
        ) => void)
      | null = null

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    mockEnsureAccountTokenForPostSaveWorkflow.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEnsureAccountToken = resolve
        }),
    )

    const onClose = vi.fn()
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useAccountDialog({
          mode: DIALOG_MODES.ADD,
          isOpen,
          onClose,
          onSuccess: vi.fn(),
        }),
      {
        initialProps: { isOpen: true },
      },
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://aihubmix.com")
      result.current.setters.setSiteName("AIHubMix")
      result.current.setters.setUsername("aihubmix-user")
      result.current.setters.setAccessToken("aihubmix-access-token")
      result.current.setters.setUserId("13")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.AIHUBMIX)
    })

    let autoConfigPromise: Promise<void> | undefined

    await act(async () => {
      autoConfigPromise = result.current.handlers.handleAutoConfig()
    })

    await waitFor(() => {
      expect(result.current.state.accountPostSaveWorkflowStep).toBe(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.CheckingToken,
      )
    })

    await act(async () => {
      result.current.handlers.handleClose()
    })

    rerender({ isOpen: false })
    rerender({ isOpen: true })

    await waitFor(() => {
      expect(result.current.state.accountPostSaveWorkflowStep).toBe(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle,
      )
      expect(result.current.state.postSaveOneTimeToken).toBeNull()
    })

    await act(async () => {
      resolveEnsureAccountToken?.({
        kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
        token: oneTimeToken,
        created: true,
        oneTimeSecret: true,
      })
      await autoConfigPromise
    })

    await waitFor(() => {
      expect(result.current.state.accountPostSaveWorkflowStep).toBe(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle,
      )
      expect(result.current.state.postSaveOneTimeToken).toBeNull()
    })
  })

  it("marks the AIHubMix paused workflow as failed when opening quick-config rejects after token acknowledgement", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "AIHubMix",
      site_url: "https://aihubmix.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.AIHUBMIX,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 13,
        username: "aihubmix-user",
        access_token: "aihubmix-access-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount({
      name: "AIHubMix",
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
      token: "aihubmix-access-token",
      userId: 13,
    })
    const oneTimeToken = buildToken({
      id: 102,
      key: "sk-aihubmix-one-time",
    })

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: oneTimeToken,
      created: true,
      oneTimeSecret: true,
    })
    mockOpenWithAccount.mockRejectedValueOnce(
      new Error("channel dialog failed"),
    )

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://aihubmix.com")
      result.current.setters.setSiteName("AIHubMix")
      result.current.setters.setUsername("aihubmix-user")
      result.current.setters.setAccessToken("aihubmix-access-token")
      result.current.setters.setUserId("13")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.AIHUBMIX)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForOneTimeKeyAcknowledgement,
    )

    await expect(
      act(async () => {
        await result.current.handlers.handlePostSaveOneTimeTokenClose()
      }),
    ).resolves.toBeUndefined()

    await waitFor(() => {
      expect(result.current.state.postSaveOneTimeToken).toBeNull()
      expect(result.current.state.accountPostSaveWorkflowStep).toBe(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
      )
      expect(toast.error).toHaveBeenCalledWith(
        "accountDialog:messages.newApiConfigFailed",
      )
    })
  })

  it("waits for Sub2API group token creation before opening quick-config", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Sub2API",
      site_url: "https://sub2.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.SUB2API,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 14,
        username: "sub-user",
        access_token: "sub-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount({
      name: "Sub2API",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
      token: "sub-token",
      userId: 14,
    })
    const createdToken = buildToken({
      id: 103,
      key: "sk-sub2-created",
      group: "vip",
    })

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
      allowedGroups: ["default", "vip"],
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteName("Sub2API")
      result.current.setters.setUsername("sub-user")
      result.current.setters.setAccessToken("sub-token")
      result.current.setters.setUserId("14")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(result.current.state.postSaveSub2ApiAllowedGroups).toEqual([
      "default",
      "vip",
    ])
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForSub2ApiGroupSelection,
    )
    expect(mockOpenWithAccount).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.handlers.handlePostSaveSub2ApiTokenCreated(
        createdToken,
      )
    })

    expect(result.current.state.postSaveSub2ApiAllowedGroups).toBeNull()
    expect(mockOpenWithAccount).toHaveBeenCalledWith(
      savedDisplayData,
      createdToken,
      expect.any(Function),
      expect.objectContaining({
        shouldContinue: expect.any(Function),
      }),
    )
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
    )
  })

  it("resumes paused Sub2API quick-config after boolean token creation by selecting the newly added token id", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Sub2API",
      site_url: "https://sub2.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.SUB2API,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 14,
        username: "sub-user",
        access_token: "sub-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount({
      name: "Sub2API",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
      token: "sub-token",
      userId: 14,
    })
    const existingToken = buildToken({
      id: 88,
      key: "sk-sub2-existing",
      group: "default",
    })
    const createdToken = buildToken({
      id: 104,
      key: "sk-sub2-refetched",
      group: "vip",
    })
    const fetchAccountTokens = vi
      .fn()
      .mockResolvedValue([createdToken, existingToken])

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    vi.spyOn(
      apiServiceRequest,
      "createDisplayAccountApiContext",
    ).mockReturnValue({
      service: {
        fetchAccountTokens,
      } as any,
      request: { accountId: savedDisplayData.id } as any,
    })
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
      allowedGroups: ["default", "vip"],
      existingTokenIds: [existingToken.id],
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteName("Sub2API")
      result.current.setters.setUsername("sub-user")
      result.current.setters.setAccessToken("sub-token")
      result.current.setters.setUserId("14")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForSub2ApiGroupSelection,
    )

    await act(async () => {
      await result.current.handlers.handlePostSaveSub2ApiTokenCreated()
    })

    expect(fetchAccountTokens).toHaveBeenCalledWith({
      accountId: savedDisplayData.id,
    })
    expect(mockOpenWithAccount).toHaveBeenCalledWith(
      savedDisplayData,
      createdToken,
      expect.any(Function),
      expect.objectContaining({
        shouldContinue: expect.any(Function),
      }),
    )
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
    )
  })

  it("fails closed when boolean Sub2API token creation refetch does not identify exactly one new token", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Sub2API",
      site_url: "https://sub2.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.SUB2API,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 14,
        username: "sub-user",
        access_token: "sub-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount({
      name: "Sub2API",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
      token: "sub-token",
      userId: 14,
    })
    const existingToken = buildToken({
      id: 88,
      key: "sk-sub2-existing",
      group: "default",
    })
    const fetchAccountTokens = vi
      .fn()
      .mockResolvedValueOnce([existingToken])
      .mockResolvedValueOnce([existingToken])

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    vi.spyOn(
      apiServiceRequest,
      "createDisplayAccountApiContext",
    ).mockReturnValue({
      service: {
        fetchAccountTokens,
      } as any,
      request: { accountId: savedDisplayData.id } as any,
    })
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
      allowedGroups: ["default", "vip"],
      existingTokenIds: [existingToken.id],
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteName("Sub2API")
      result.current.setters.setUsername("sub-user")
      result.current.setters.setAccessToken("sub-token")
      result.current.setters.setUserId("14")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    await act(async () => {
      await result.current.handlers.handlePostSaveSub2ApiTokenCreated()
    })

    expect(mockOpenWithAccount).not.toHaveBeenCalled()
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
    )
    expect(toast.error).toHaveBeenCalledWith(
      "messages:accountOperations.createTokenFailed",
    )
  })

  it("ignores stale boolean Sub2API token recovery results after the dialog closes", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Sub2API",
      site_url: "https://sub2.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.SUB2API,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 14,
        username: "sub-user",
        access_token: "sub-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount({
      name: "Sub2API",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
      token: "sub-token",
      userId: 14,
    })
    const existingToken = buildToken({
      id: 88,
      key: "sk-sub2-existing",
      group: "default",
    })

    let resolveFetchAccountTokens: ((value: ApiToken[]) => void) | null = null
    const fetchAccountTokens = vi.fn(
      () =>
        new Promise<ApiToken[]>((resolve) => {
          resolveFetchAccountTokens = resolve
        }),
    )

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    vi.spyOn(
      apiServiceRequest,
      "createDisplayAccountApiContext",
    ).mockReturnValue({
      service: {
        fetchAccountTokens,
      } as any,
      request: { accountId: savedDisplayData.id } as any,
    })
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
      allowedGroups: ["default", "vip"],
      existingTokenIds: [existingToken.id],
    })

    const onClose = vi.fn()
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useAccountDialog({
          mode: DIALOG_MODES.ADD,
          isOpen,
          onClose,
          onSuccess: vi.fn(),
        }),
      {
        initialProps: { isOpen: true },
      },
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteName("Sub2API")
      result.current.setters.setUsername("sub-user")
      result.current.setters.setAccessToken("sub-token")
      result.current.setters.setUserId("14")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForSub2ApiGroupSelection,
    )

    let recoverPromise: Promise<void> | undefined
    await act(async () => {
      recoverPromise =
        result.current.handlers.handlePostSaveSub2ApiTokenCreated()
    })

    await waitFor(() => {
      expect(fetchAccountTokens).toHaveBeenCalledWith({
        accountId: savedDisplayData.id,
      })
    })

    await act(async () => {
      result.current.handlers.handleClose()
    })

    rerender({ isOpen: false })
    rerender({ isOpen: true })

    await waitFor(() => {
      expect(result.current.state.accountPostSaveWorkflowStep).toBe(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle,
      )
      expect(result.current.state.postSaveSub2ApiAllowedGroups).toBeNull()
      expect(result.current.state.postSaveSub2ApiAccount).toBeNull()
    })

    await act(async () => {
      resolveFetchAccountTokens?.([existingToken])
      await recoverPromise
    })

    expect(mockOpenWithAccount).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalledWith(
      "messages:accountOperations.createTokenFailed",
    )
    expect(toast.error).not.toHaveBeenCalledWith(
      "accountDialog:messages.newApiConfigFailed",
    )
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle,
    )
  })

  it("marks the Sub2API paused workflow as failed when opening quick-config rejects after token creation", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Sub2API",
      site_url: "https://sub2.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.SUB2API,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 14,
        username: "sub-user",
        access_token: "sub-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount({
      name: "Sub2API",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
      token: "sub-token",
      userId: 14,
    })
    const createdToken = buildToken({
      id: 103,
      key: "sk-sub2-created",
      group: "vip",
    })

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
      allowedGroups: ["default", "vip"],
    })
    mockOpenWithAccount.mockRejectedValueOnce(
      new Error("channel dialog failed"),
    )

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteName("Sub2API")
      result.current.setters.setUsername("sub-user")
      result.current.setters.setAccessToken("sub-token")
      result.current.setters.setUserId("14")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForSub2ApiGroupSelection,
    )

    await expect(
      act(async () => {
        await result.current.handlers.handlePostSaveSub2ApiTokenCreated(
          createdToken,
        )
      }),
    ).resolves.toBeUndefined()

    await waitFor(() => {
      expect(result.current.state.postSaveSub2ApiAllowedGroups).toBeNull()
      expect(result.current.state.accountPostSaveWorkflowStep).toBe(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
      )
      expect(toast.error).toHaveBeenCalledWith(
        "accountDialog:messages.newApiConfigFailed",
      )
    })
  })

  it("clears Sub2API post-save workflow state when the dialog closes during group selection", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Sub2API",
      site_url: "https://sub2.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.SUB2API,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 14,
        username: "sub-user",
        access_token: "sub-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount({
      name: "Sub2API",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
      token: "sub-token",
      userId: 14,
    })

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
      allowedGroups: ["default", "vip"],
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteName("Sub2API")
      result.current.setters.setUsername("sub-user")
      result.current.setters.setAccessToken("sub-token")
      result.current.setters.setUserId("14")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(result.current.state.postSaveSub2ApiAllowedGroups).toEqual([
      "default",
      "vip",
    ])
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForSub2ApiGroupSelection,
    )

    await act(async () => {
      result.current.handlers.handleClose()
    })

    expect(result.current.state.postSaveSub2ApiAllowedGroups).toBeNull()
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle,
    )
  })

  it("returns Sub2API group selection to idle when the token dialog closes without creating a token", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Sub2API",
      site_url: "https://sub2.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.SUB2API,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 14,
        username: "sub-user",
        access_token: "sub-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount({
      name: "Sub2API",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
      token: "sub-token",
      userId: 14,
    })

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
      allowedGroups: ["default", "vip"],
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteName("Sub2API")
      result.current.setters.setUsername("sub-user")
      result.current.setters.setAccessToken("sub-token")
      result.current.setters.setUserId("14")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForSub2ApiGroupSelection,
    )

    await act(async () => {
      await result.current.handlers.handlePostSaveSub2ApiTokenDialogClose()
    })

    expect(mockOpenWithAccount).not.toHaveBeenCalled()
    expect(result.current.state.postSaveSub2ApiAllowedGroups).toBeNull()
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle,
    )
  })

  it("ignores stale AccountDialog-owned Sub2API dialog success after close and reopen", async () => {
    const firstSavedSiteAccount = buildSiteAccount({
      id: "first-account-id",
      site_name: "First Sub2API",
      site_url: "https://first-sub2.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.SUB2API,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 21,
        username: "first-user",
        access_token: "first-token",
      },
    }) as SiteAccount
    const secondSavedSiteAccount = buildSiteAccount({
      id: "second-account-id",
      site_name: "Second Sub2API",
      site_url: "https://second-sub2.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.SUB2API,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 22,
        username: "second-user",
        access_token: "second-token",
      },
    }) as SiteAccount
    const firstDisplayData = buildDisplayAccount({
      id: "first-account-id",
      name: "First Sub2API",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://first-sub2.example.com",
      token: "first-token",
      userId: 21,
    })
    const secondDisplayData = buildDisplayAccount({
      id: "second-account-id",
      name: "Second Sub2API",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://second-sub2.example.com",
      token: "second-token",
      userId: 22,
    })

    vi.spyOn(accountStorage, "getAccountById").mockImplementation(
      async (accountId) => {
        if (accountId === "first-account-id") {
          return firstSavedSiteAccount
        }
        if (accountId === "second-account-id") {
          return secondSavedSiteAccount
        }
        return null
      },
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockImplementation(
      async (accountId) => {
        if (accountId === "first-account-id") {
          return firstDisplayData
        }
        if (accountId === "second-account-id") {
          return secondDisplayData
        }
        return null
      },
    )
    mockValidateAndSaveAccount
      .mockResolvedValueOnce({
        success: true,
        accountId: "first-account-id",
        message: "Saved successfully",
        feedbackLevel: "success",
      })
      .mockResolvedValueOnce({
        success: true,
        accountId: "second-account-id",
        message: "Saved successfully",
        feedbackLevel: "success",
      })
    mockEnsureAccountTokenForPostSaveWorkflow
      .mockResolvedValueOnce({
        kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
        allowedGroups: ["default", "vip"],
      })
      .mockResolvedValueOnce({
        kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
        allowedGroups: ["default", "vip"],
      })

    let resolveOpenWithAccount:
      | ((value: Awaited<ReturnType<typeof mockOpenWithAccount>>) => void)
      | null = null
    mockOpenWithAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOpenWithAccount = resolve
        }),
    )

    const onClose = vi.fn()
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useAccountDialog({
          mode: DIALOG_MODES.ADD,
          isOpen,
          onClose,
          onSuccess: vi.fn(),
        }),
      {
        initialProps: { isOpen: true },
      },
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://first-sub2.example.com")
      result.current.setters.setSiteName("First Sub2API")
      result.current.setters.setUsername("first-user")
      result.current.setters.setAccessToken("first-token")
      result.current.setters.setUserId("21")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    const firstSessionId = result.current.state.postSaveSub2ApiDialogSessionId
    expect(firstSessionId).not.toBeNull()
    const firstDialogHandlers =
      result.current.handlers.getPostSaveSub2ApiDialogHandlers(firstSessionId)

    await act(async () => {
      result.current.handlers.handleClose()
    })

    rerender({ isOpen: false })
    rerender({ isOpen: true })

    await waitFor(() => {
      expect(result.current.state.url).toBe("")
    })

    await act(async () => {
      result.current.setters.setUrl("https://second-sub2.example.com")
      result.current.setters.setSiteName("Second Sub2API")
      result.current.setters.setUsername("second-user")
      result.current.setters.setAccessToken("second-token")
      result.current.setters.setUserId("22")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    const secondSessionId = result.current.state.postSaveSub2ApiDialogSessionId
    expect(secondSessionId).not.toBeNull()
    expect(secondSessionId).not.toBe(firstSessionId)
    const secondDialogHandlers =
      result.current.handlers.getPostSaveSub2ApiDialogHandlers(secondSessionId)

    const staleToken = buildToken({
      id: 201,
      key: "sk-stale-sub2",
      group: "default",
    })
    await act(async () => {
      await firstDialogHandlers.onSuccess(staleToken)
    })

    expect(mockOpenWithAccount).not.toHaveBeenCalled()

    const currentToken = buildToken({
      id: 202,
      key: "sk-current-sub2",
      group: "vip",
    })
    let resumePromise: Promise<void> | undefined
    await act(async () => {
      resumePromise = secondDialogHandlers.onSuccess(currentToken)
      secondDialogHandlers.onClose()
    })

    expect(mockOpenWithAccount).toHaveBeenCalledTimes(1)
    expect(mockOpenWithAccount).toHaveBeenCalledWith(
      secondDisplayData,
      currentToken,
      expect.any(Function),
      expect.objectContaining({
        shouldContinue: expect.any(Function),
      }),
    )

    await act(async () => {
      resolveOpenWithAccount?.({ opened: true })
      await resumePromise
    })

    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
    )
  })

  it("opens channel auto-config directly for an existing edit-mode account without saving again", async () => {
    const onSuccess = vi.fn()
    const existingAccount = {
      id: "existing-display-id",
      siteUrl: "https://edit.example.com",
      siteName: "Edit Example",
    } as any

    mockOpenWithAccount.mockImplementationOnce(
      async (
        _displaySiteData: any,
        _channelId: any,
        onCompleted?: () => void,
      ) => {
        onCompleted?.()
        return { opened: true }
      },
    )

    const { result } = renderEditHook({
      account: existingAccount,
      onSuccess,
    })

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(mockValidateAndSaveAccount).not.toHaveBeenCalled()
    expect(mockOpenWithAccount).toHaveBeenCalledWith(
      existingAccount,
      null,
      expect.any(Function),
      expect.objectContaining({
        shouldContinue: expect.any(Function),
      }),
    )
    expect(onSuccess).toHaveBeenCalledWith(existingAccount)
  })

  it("does not mark direct auto-config complete when the channel dialog does not open", async () => {
    const onSuccess = vi.fn()
    const existingAccount = {
      id: "existing-display-id",
      siteUrl: "https://edit.example.com",
      siteName: "Edit Example",
    } as any

    mockOpenWithAccount.mockResolvedValueOnce({ opened: false })

    const { result } = renderEditHook({
      account: existingAccount,
      onSuccess,
    })

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
    )
    expect(onSuccess).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("keeps direct auto-config waiting when channel opening is deferred by a prerequisite dialog", async () => {
    const onSuccess = vi.fn()
    const existingAccount = {
      id: "existing-display-id",
      siteUrl: "https://edit.example.com",
      siteName: "Edit Example",
    } as any

    mockOpenWithAccount.mockResolvedValueOnce({
      opened: false,
      deferred: true,
    })

    const { result } = renderEditHook({
      account: existingAccount,
      onSuccess,
    })

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.OpeningManagedSiteDialog,
    )
    expect(onSuccess).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("falls back to converted display data during auto-config when persisted display data is unavailable", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Fallback Example",
      site_url: "https://api.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: "new-api",
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 9,
        username: "saved-user",
        access_token: "saved-token",
      },
    }) as SiteAccount

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(null)

    const fallbackDisplayData =
      accountStorage.convertToDisplayData(savedSiteAccount)
    const ensuredToken = buildToken({ id: 104, key: "sk-fallback-ensured" })
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: ensuredToken,
      created: false,
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
      result.current.setters.setSiteName("Fallback Example")
      result.current.setters.setUsername("saved-user")
      result.current.setters.setAccessToken("saved-token")
      result.current.setters.setUserId("9")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("new-api")
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(mockOpenWithAccount).toHaveBeenCalledWith(
      fallbackDisplayData,
      ensuredToken,
      expect.any(Function),
      expect.objectContaining({
        shouldContinue: expect.any(Function),
      }),
    )
    expect(mockOpenSub2ApiTokenCreationDialog).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalledWith(
      "messages:toast.error.findAccountDetailsFailed",
    )
  })

  it("uses the saveFailed fallback when save returns unsuccessful without a message", async () => {
    mockValidateAndSaveAccount.mockResolvedValueOnce({
      success: false,
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
      result.current.setters.setSiteName("Example")
      result.current.setters.setUsername("user")
      result.current.setters.setAccessToken("token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("one-api")
    })

    await expect(
      act(async () => {
        await result.current.handlers.handleSaveAccount()
      }),
    ).rejects.toThrow("accountDialog:messages.saveFailed")

    expect(toast.success).not.toHaveBeenCalled()
    expect(result.current.state.isSaving).toBe(false)
  })

  it("uses the saveFailed fallback when edit-mode updates return unsuccessful without a message", async () => {
    mockValidateAndUpdateAccount.mockResolvedValueOnce({
      success: false,
    })

    const { result } = renderEditHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://edit.example.com")
      result.current.setters.setSiteName("Edit Example")
      result.current.setters.setUsername("user")
      result.current.setters.setAccessToken("token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("one-api")
    })

    await expect(
      act(async () => {
        await result.current.handlers.handleSaveAccount()
      }),
    ).rejects.toThrow("accountDialog:messages.saveFailed")

    expect(toast.success).not.toHaveBeenCalled()
    expect(result.current.state.isSaving).toBe(false)
  })

  it("skips the Sub2API post-save prompt during auto-config even when the saved display data is available", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Sub2API",
      site_url: "https://sub2.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.SUB2API,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 11,
        username: "sub-user",
        access_token: "jwt-token",
      },
    }) as SiteAccount

    const savedDisplayData =
      accountStorage.convertToDisplayData(savedSiteAccount)

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    const ensuredToken = buildToken({ id: 105, key: "sk-sub2-ensured" })
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: ensuredToken,
      created: false,
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteName("Sub2API")
      result.current.setters.setUsername("sub-user")
      result.current.setters.setAccessToken("jwt-token")
      result.current.setters.setUserId("11")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(mockOpenWithAccount).toHaveBeenCalledWith(
      savedDisplayData,
      ensuredToken,
      expect.any(Function),
      expect.objectContaining({
        shouldContinue: expect.any(Function),
      }),
    )
    expect(mockOpenSub2ApiTokenCreationDialog).not.toHaveBeenCalled()
  })

  it("reports a missing saved account during auto-config instead of opening the channel dialog", async () => {
    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(null)

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
      result.current.setters.setSiteName("Example")
      result.current.setters.setUsername("user")
      result.current.setters.setAccessToken("token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("one-api")
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(mockOpenWithAccount).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      "messages:toast.error.findAccountDetailsFailed",
    )
  })

  it("surfaces channel dialog failures through the auto-config error toast", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Example",
      site_url: "https://api.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: "new-api",
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 12,
        username: "saved-user",
        access_token: "saved-token",
      },
    }) as SiteAccount

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      accountStorage.convertToDisplayData(savedSiteAccount),
    )
    mockOpenWithAccount.mockRejectedValueOnce(
      new Error("channel dialog failed"),
    )

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
      result.current.setters.setSiteName("Example")
      result.current.setters.setUsername("saved-user")
      result.current.setters.setAccessToken("saved-token")
      result.current.setters.setUserId("12")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("new-api")
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(toast.error).toHaveBeenCalledWith(
      "accountDialog:messages.newApiConfigFailed",
    )
    expect(result.current.state.isAutoConfiguring).toBe(false)
  })

  it("forwards the saved account id through the auto-config completion callback", async () => {
    const onSuccess = vi.fn()
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Example",
      site_url: "https://api.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: "new-api",
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 18,
        username: "saved-user",
        access_token: "saved-token",
      },
    }) as SiteAccount

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      accountStorage.convertToDisplayData(savedSiteAccount),
    )
    mockOpenWithAccount.mockImplementationOnce(
      async (
        _displaySiteData: any,
        _channelId: any,
        onCompleted?: () => void,
      ) => {
        onCompleted?.()
        return { opened: true }
      },
    )

    const { result } = renderAddHook({ onSuccess })

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
      result.current.setters.setSiteName("Example")
      result.current.setters.setUsername("saved-user")
      result.current.setters.setAccessToken("saved-token")
      result.current.setters.setUserId("18")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("new-api")
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(onSuccess).toHaveBeenCalledWith("saved-account-id")
    expect(result.current.state.isAutoConfiguring).toBe(false)
  })

  it("does not reuse a previously auto-configured saved id after the dialog closes and reopens", async () => {
    const firstSavedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "First Example",
      site_url: "https://first.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: "new-api",
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 18,
        username: "first-user",
        access_token: "first-token",
      },
    }) as SiteAccount
    const secondSavedSiteAccount = buildSiteAccount({
      id: "second-account-id",
      site_name: "Second Example",
      site_url: "https://second.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: "new-api",
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 19,
        username: "second-user",
        access_token: "second-token",
      },
    }) as SiteAccount

    const getAccountByIdSpy = vi
      .spyOn(accountStorage, "getAccountById")
      .mockImplementation(async (accountId) => {
        if (accountId === "saved-account-id") return firstSavedSiteAccount
        if (accountId === "second-account-id") return secondSavedSiteAccount
        return null
      })
    const getDisplayDataByIdSpy = vi
      .spyOn(accountStorage, "getDisplayDataById")
      .mockImplementation(async (accountId) => {
        if (accountId === "saved-account-id") {
          return accountStorage.convertToDisplayData(firstSavedSiteAccount)
        }
        if (accountId === "second-account-id") {
          return accountStorage.convertToDisplayData(secondSavedSiteAccount)
        }
        return null
      })

    mockValidateAndSaveAccount
      .mockResolvedValueOnce({
        success: true,
        accountId: "saved-account-id",
        message: "Saved successfully",
        feedbackLevel: "success",
      })
      .mockResolvedValueOnce({
        success: true,
        accountId: "second-account-id",
        message: "Saved successfully",
        feedbackLevel: "success",
      })
    const firstEnsuredToken = buildToken({ id: 106, key: "sk-first-ensured" })
    const secondEnsuredToken = buildToken({ id: 107, key: "sk-second-ensured" })
    mockEnsureAccountTokenForPostSaveWorkflow
      .mockResolvedValueOnce({
        kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
        token: firstEnsuredToken,
        created: false,
      })
      .mockResolvedValueOnce({
        kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
        token: secondEnsuredToken,
        created: false,
      })
    mockOpenWithAccount.mockImplementation(
      async (
        _displaySiteData: any,
        _channelId: any,
        onCompleted?: () => void,
      ) => {
        onCompleted?.()
        return { opened: true }
      },
    )

    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useAccountDialog({
          mode: DIALOG_MODES.ADD,
          isOpen,
          onClose,
          onSuccess,
        }),
      {
        initialProps: { isOpen: true },
      },
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://first.example.com")
      result.current.setters.setSiteName("First Example")
      result.current.setters.setUsername("first-user")
      result.current.setters.setAccessToken("first-token")
      result.current.setters.setUserId("18")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("new-api")
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(mockValidateAndSaveAccount).toHaveBeenCalledTimes(1)
    expect(getAccountByIdSpy).toHaveBeenCalledWith("saved-account-id")
    expect(getDisplayDataByIdSpy).toHaveBeenCalledWith("saved-account-id")

    await act(async () => {
      result.current.handlers.handleClose()
    })

    rerender({ isOpen: false })
    rerender({ isOpen: true })

    await waitFor(() => {
      expect(result.current.state.url).toBe("")
    })

    await act(async () => {
      result.current.setters.setUrl("https://second.example.com")
      result.current.setters.setSiteName("Second Example")
      result.current.setters.setUsername("second-user")
      result.current.setters.setAccessToken("second-token")
      result.current.setters.setUserId("19")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("new-api")
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(mockValidateAndSaveAccount).toHaveBeenCalledTimes(2)
    expect(getAccountByIdSpy).toHaveBeenCalledWith("second-account-id")
    expect(getDisplayDataByIdSpy).toHaveBeenCalledWith("second-account-id")
    expect(mockOpenWithAccount).toHaveBeenLastCalledWith(
      accountStorage.convertToDisplayData(secondSavedSiteAccount),
      secondEnsuredToken,
      expect.any(Function),
      expect.objectContaining({
        shouldContinue: expect.any(Function),
      }),
    )
  })

  it("cancels a stale channel-open continuation after close and does not retarget success to a reopened account", async () => {
    const firstSavedSiteAccount = buildSiteAccount({
      id: "first-account-id",
      site_name: "First Example",
      site_url: "https://first.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: "new-api",
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 31,
        username: "first-user",
        access_token: "first-token",
      },
    }) as SiteAccount
    const secondSavedSiteAccount = buildSiteAccount({
      id: "second-account-id",
      site_name: "Second Example",
      site_url: "https://second.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: "new-api",
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 32,
        username: "second-user",
        access_token: "second-token",
      },
    }) as SiteAccount

    vi.spyOn(accountStorage, "getAccountById").mockImplementation(
      async (accountId) => {
        if (accountId === "first-account-id") return firstSavedSiteAccount
        if (accountId === "second-account-id") return secondSavedSiteAccount
        return null
      },
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockImplementation(
      async (accountId) => {
        if (accountId === "first-account-id") {
          return accountStorage.convertToDisplayData(firstSavedSiteAccount)
        }
        if (accountId === "second-account-id") {
          return accountStorage.convertToDisplayData(secondSavedSiteAccount)
        }
        return null
      },
    )

    mockValidateAndSaveAccount
      .mockResolvedValueOnce({
        success: true,
        accountId: "first-account-id",
        message: "Saved successfully",
        feedbackLevel: "success",
      })
      .mockResolvedValueOnce({
        success: true,
        accountId: "second-account-id",
        message: "Saved successfully",
        feedbackLevel: "success",
      })

    const firstEnsuredToken = buildToken({ id: 301, key: "sk-first-ensured" })
    const secondEnsuredToken = buildToken({
      id: 302,
      key: "sk-second-ensured",
    })
    mockEnsureAccountTokenForPostSaveWorkflow
      .mockResolvedValueOnce({
        kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
        token: firstEnsuredToken,
        created: false,
      })
      .mockResolvedValueOnce({
        kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
        token: secondEnsuredToken,
        created: false,
      })

    let firstShouldContinue: (() => boolean) | undefined
    let firstOnCompleted: (() => void) | undefined
    mockOpenWithAccount
      .mockImplementationOnce(
        async (
          _displaySiteData: any,
          _channelId: any,
          onCompleted?: () => void,
          options?: { shouldContinue?: () => boolean },
        ) => {
          firstOnCompleted = onCompleted
          firstShouldContinue = options?.shouldContinue
          return new Promise(() => {})
        },
      )
      .mockImplementationOnce(
        async (
          _displaySiteData: any,
          _channelId: any,
          onCompleted?: () => void,
        ) => {
          onCompleted?.()
          return { opened: true }
        },
      )

    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useAccountDialog({
          mode: DIALOG_MODES.ADD,
          isOpen,
          onClose,
          onSuccess,
        }),
      {
        initialProps: { isOpen: true },
      },
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://first.example.com")
      result.current.setters.setSiteName("First Example")
      result.current.setters.setUsername("first-user")
      result.current.setters.setAccessToken("first-token")
      result.current.setters.setUserId("31")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("new-api")
    })

    await act(async () => {
      void result.current.handlers.handleAutoConfig()
    })

    await waitFor(() => {
      expect(mockOpenWithAccount).toHaveBeenCalledTimes(1)
    })

    expect(firstShouldContinue?.()).toBe(true)

    await act(async () => {
      result.current.handlers.handleClose()
    })

    expect(firstShouldContinue?.()).toBe(false)

    rerender({ isOpen: false })
    rerender({ isOpen: true })

    await waitFor(() => {
      expect(result.current.state.url).toBe("")
    })

    await act(async () => {
      result.current.setters.setUrl("https://second.example.com")
      result.current.setters.setSiteName("Second Example")
      result.current.setters.setUsername("second-user")
      result.current.setters.setAccessToken("second-token")
      result.current.setters.setUserId("32")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType("new-api")
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(mockOpenWithAccount).toHaveBeenCalledTimes(2)
    expect(mockOpenWithAccount).toHaveBeenNthCalledWith(
      2,
      accountStorage.convertToDisplayData(secondSavedSiteAccount),
      secondEnsuredToken,
      expect.any(Function),
      expect.objectContaining({
        shouldContinue: expect.any(Function),
      }),
    )
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith("second-account-id")

    await act(async () => {
      firstOnCompleted?.()
    })

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).not.toHaveBeenCalledWith("first-account-id")
  })
})
