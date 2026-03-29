import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SUB2API } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accounts/accountStorage"
import { AuthTypeEnum, SiteAccount, SiteHealthStatus } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const {
  mockValidateAndSaveAccount,
  mockOpenWithAccount,
  mockOpenSub2ApiTokenCreationDialog,
} = vi.hoisted(() => ({
  mockValidateAndSaveAccount: vi.fn(),
  mockOpenWithAccount: vi.fn(),
  mockOpenSub2ApiTokenCreationDialog: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}))

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
  }
})

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

describe("useAccountDialog save and auto-config flows", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    await accountStorage.clearAllData()
    mockValidateAndSaveAccount.mockResolvedValue({
      success: true,
      accountId: "saved-account-id",
      message: "Saved successfully",
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
