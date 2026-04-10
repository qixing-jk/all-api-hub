import type { FormEvent, ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { NEW_API, SUB2API } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accounts/accountStorage"
import { AuthTypeEnum, SiteAccount, SiteHealthStatus } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const {
  mockToast,
  mockValidateAndSaveAccount,
  mockValidateAndUpdateAccount,
  mockOpenWithAccount,
  mockOpenSub2ApiTokenCreationDialog,
  mockGetManagedSiteConfig,
  mockOpenSettingsTab,
} = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockValidateAndSaveAccount: vi.fn(),
  mockValidateAndUpdateAccount: vi.fn(),
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
  "~/services/managedSites/managedSiteService",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/managedSites/managedSiteService")
      >()

    return {
      ...actual,
      getManagedSiteServiceForType: vi.fn(() => ({
        siteType: NEW_API,
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
      result.current.setters.setSiteType(SUB2API)
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
      SUB2API,
      AuthTypeEnum.AccessToken,
      "",
      "",
      false,
      {
        refreshToken: "refresh-token",
        tokenExpiresAt: 123456789,
      },
    )
    expect(mockOpenSub2ApiTokenCreationDialog).toHaveBeenCalledWith(
      savedDisplayData,
    )
    expect(toast.success).toHaveBeenCalledWith("Saved successfully")
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
    expect(toast.success).not.toHaveBeenCalledWith(
      "Account saved, but latest metrics are placeholders.",
    )
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
    expect(toast.success).not.toHaveBeenCalledWith(
      "Account settings saved, but latest metrics are still stale.",
    )
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
      result.current.setters.setSiteType(SUB2API)
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
    )
    expect(onSuccess).toHaveBeenCalledWith(existingAccount)
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
      null,
      expect.any(Function),
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
      site_type: SUB2API,
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
      result.current.setters.setSiteType(SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(mockOpenWithAccount).toHaveBeenCalledWith(
      savedDisplayData,
      null,
      expect.any(Function),
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
})
