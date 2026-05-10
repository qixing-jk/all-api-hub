import { http, HttpResponse } from "msw"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accounts/accountStorage"
import { userPreferences } from "~/services/preferences/userPreferences"
import { server } from "~~/tests/msw/server"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const { mockOpenWithAccount, mockOpenSub2ApiTokenCreationDialog } = vi.hoisted(
  () => ({
    mockOpenWithAccount: vi.fn(),
    mockOpenSub2ApiTokenCreationDialog: vi.fn(),
  }),
)

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

describe("useAccountDialog duplicate account warning", () => {
  const defaultAccountInfo = buildSiteAccount().account_info

  beforeEach(async () => {
    server.resetHandlers()
    await accountStorage.clearAllData()
    await userPreferences.resetToDefaults()
  })

  /**
   * Render the account dialog hook with defaults tuned for duplicate-warning tests.
   */
  async function renderDuplicateWarningHook(
    options: {
      mode?: (typeof DIALOG_MODES)[keyof typeof DIALOG_MODES]
      account?: Parameters<typeof useAccountDialog>[0]["account"]
    } = {},
  ) {
    const onClose = vi.fn()
    const onSuccess = vi.fn()

    const hook = renderHook(() =>
      useAccountDialog({
        mode: options.mode ?? DIALOG_MODES.ADD,
        isOpen: true,
        onClose,
        onSuccess,
        account: options.account ?? null,
      }),
    )

    await waitFor(() => {
      expect(hook.result.current.state).toBeTruthy()
    })

    return {
      ...hook,
      onClose,
      onSuccess,
    }
  }

  it("warns when entering manual add flow if duplicate site exists (default enabled)", async () => {
    server.use(
      http.get("https://api.example.com/api/log/self", () =>
        HttpResponse.json(
          { success: false, message: "fetch failed" },
          { status: 500 },
        ),
      ),
      http.get("https://api.example.com/api/user/self", () =>
        HttpResponse.json(
          { success: false, message: "fetch failed" },
          { status: 500 },
        ),
      ),
    )

    await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "Existing",
        site_url: "https://api.example.com/v1/",
      }),
    )

    const onClose = vi.fn()
    const onSuccess = vi.fn()

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
    })

    let manualAddPromise!: Promise<void>
    act(() => {
      manualAddPromise = result.current.handlers.handleShowManualForm()
    })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning.isOpen).toBe(true)
    })

    const beforeAccounts = await accountStorage.getAllAccounts()
    expect(beforeAccounts).toHaveLength(1)

    await act(async () => {
      result.current.handlers.handleDuplicateAccountWarningContinue()
      await manualAddPromise
    })

    await act(async () => {
      result.current.setters.setSiteName("Test")
      result.current.setters.setUsername("user")
      result.current.setters.setAccessToken("token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    const afterAccounts = await accountStorage.getAllAccounts()
    expect(afterAccounts).toHaveLength(2)
  })

  it("skips warning when preference is disabled", async () => {
    server.use(
      http.get("https://api.example.com/api/log/self", () =>
        HttpResponse.json(
          { success: false, message: "fetch failed" },
          { status: 500 },
        ),
      ),
      http.get("https://api.example.com/api/user/self", () =>
        HttpResponse.json(
          { success: false, message: "fetch failed" },
          { status: 500 },
        ),
      ),
    )

    await userPreferences.updateWarnOnDuplicateAccountAdd(false)

    await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "Existing",
        site_url: "https://api.example.com",
      }),
    )

    const onClose = vi.fn()
    const onSuccess = vi.fn()

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
      await result.current.handlers.handleShowManualForm()
    })

    expect(result.current.state.duplicateAccountWarning.isOpen).toBe(false)

    await act(async () => {
      result.current.setters.setSiteName("Test")
      result.current.setters.setUsername("user")
      result.current.setters.setAccessToken("token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    const afterAccounts = await accountStorage.getAllAccounts()
    expect(afterAccounts).toHaveLength(2)
  })

  it("skips duplicate warning when the target URL is empty", async () => {
    const { result } = await renderDuplicateWarningHook()

    await act(async () => {
      await result.current.handlers.handleShowManualForm()
    })

    expect(result.current.state.duplicateAccountWarning.isOpen).toBe(false)
    expect(result.current.state.showManualForm).toBe(true)
  })

  it("warns for AIHubMix duplicates across main and console hostnames", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "AIHubMix Existing",
        site_url: "https://aihubmix.com",
        site_type: SITE_TYPES.AIHUBMIX,
        account_info: {
          ...defaultAccountInfo,
          id: 11,
          username: "aihubmix-user",
        },
      }),
    )

    const { result } = await renderDuplicateWarningHook()

    await act(async () => {
      result.current.setters.setUrl(
        "https://console.aihubmix.com/statistics?tab=detail",
      )
      result.current.setters.setSiteType(SITE_TYPES.AIHUBMIX)
      result.current.setters.setUserId("11")
    })

    act(() => {
      void result.current.handlers.handleShowManualForm()
    })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning.isOpen).toBe(true)
    })
    expect(result.current.state.duplicateAccountWarning.siteUrl).toBe(
      "https://console.aihubmix.com",
    )
    expect(result.current.state.duplicateAccountWarning.existingUserId).toBe(11)
  })

  it("skips duplicate warning in edit mode", async () => {
    const existingAccount = buildSiteAccount({
      id: "existing-edit-account",
      site_name: "Existing",
      site_url: "https://api.example.com",
      account_info: {
        ...defaultAccountInfo,
        id: 9,
        username: "existing-user",
        access_token: "existing-token",
      },
    })

    await accountStorage.addAccount(existingAccount)

    const { result } = await renderDuplicateWarningHook({
      mode: DIALOG_MODES.EDIT,
      account: accountStorage.convertToDisplayData(existingAccount),
    })

    await act(async () => {
      await result.current.handlers.handleShowManualForm()
    })

    expect(result.current.state.duplicateAccountWarning.isOpen).toBe(false)
  })

  it("keeps the manual add flow blocked when duplicate warning is canceled", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "Existing",
        site_url: "https://api.example.com",
      }),
    )

    const { result } = await renderDuplicateWarningHook()

    await act(async () => {
      result.current.handlers.handleUrlChange(
        "https://API.EXAMPLE.com/path?q=1",
      )
    })

    let manualAddPromise!: Promise<void>
    act(() => {
      manualAddPromise = result.current.handlers.handleShowManualForm()
    })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning).toMatchObject({
        isOpen: true,
        siteUrl: "https://api.example.com",
      })
    })

    await act(async () => {
      result.current.handlers.handleDuplicateAccountWarningCancel()
      await manualAddPromise
    })

    expect(result.current.state.duplicateAccountWarning.isOpen).toBe(false)
    expect(result.current.state.showManualForm).toBe(false)
  })

  it("cancels a pending duplicate warning and closes the dialog cleanly", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "Existing",
        site_url: "https://api.example.com",
      }),
    )

    const { result, onClose } = await renderDuplicateWarningHook()

    await act(async () => {
      result.current.handlers.handleUrlChange("https://api.example.com")
    })

    let manualAddPromise!: Promise<void>
    act(() => {
      manualAddPromise = result.current.handlers.handleShowManualForm()
    })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning.isOpen).toBe(true)
    })

    await act(async () => {
      result.current.handlers.handleClose()
      await manualAddPromise
    })

    expect(result.current.state.duplicateAccountWarning.isOpen).toBe(false)
    expect(result.current.state.showManualForm).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("closes an open duplicate warning when the parent closes the dialog", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "Existing",
        site_url: "https://api.example.com",
      }),
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
      result.current.handlers.handleUrlChange("https://api.example.com")
    })

    let manualAddPromise!: Promise<void>
    act(() => {
      manualAddPromise = result.current.handlers.handleShowManualForm()
    })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning.isOpen).toBe(true)
    })

    rerender({ isOpen: false })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning.isOpen).toBe(false)
    })

    await act(async () => {
      await manualAddPromise
    })
  })

  it("suppresses repeated duplicate prompts for the same normalized URL until the URL changes", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "Existing",
        site_url: "https://api.example.com/v1/",
      }),
    )

    const { result } = await renderDuplicateWarningHook()

    await act(async () => {
      result.current.handlers.handleUrlChange(
        "https://API.EXAMPLE.com/v1/users?x=1",
      )
    })

    let firstManualAddPromise!: Promise<void>
    act(() => {
      firstManualAddPromise = result.current.handlers.handleShowManualForm()
    })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning).toMatchObject({
        isOpen: true,
        siteUrl: "https://api.example.com",
      })
    })

    await act(async () => {
      result.current.handlers.handleDuplicateAccountWarningContinue()
      await firstManualAddPromise
    })

    expect(result.current.state.showManualForm).toBe(true)

    await act(async () => {
      result.current.setters.setShowManualForm(false)
    })

    await act(async () => {
      await result.current.handlers.handleShowManualForm()
    })

    expect(result.current.state.duplicateAccountWarning.isOpen).toBe(false)
    expect(result.current.state.showManualForm).toBe(true)

    await act(async () => {
      result.current.setters.setShowManualForm(false)
      result.current.handlers.handleUrlChange("https://other.example.com")
      result.current.handlers.handleUrlChange("https://api.example.com")
    })

    let secondManualAddPromise!: Promise<void>
    act(() => {
      secondManualAddPromise = result.current.handlers.handleShowManualForm()
    })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning.isOpen).toBe(true)
    })

    await act(async () => {
      result.current.handlers.handleDuplicateAccountWarningCancel()
      await secondManualAddPromise
    })
  })

  it("preserves invalid manual URL input and clears the site name when the URL becomes blank", async () => {
    const { result } = await renderDuplicateWarningHook()

    await act(async () => {
      result.current.setters.setSiteName("Detected Site")
      result.current.handlers.handleUrlChange("not a valid url")
    })

    expect(result.current.state.url).toBe("not a valid url")
    expect(result.current.state.siteName).toBe("Detected Site")

    await act(async () => {
      result.current.handlers.handleUrlChange("   ")
    })

    expect(result.current.state.url).toBe("")
    expect(result.current.state.siteName).toBe("")
  })

  it("shows exact duplicate metadata only when the user id matches an existing account", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "Existing A",
        site_url: "https://api.example.com",
        account_info: {
          ...defaultAccountInfo,
          id: 42,
          username: "matching-user",
          access_token: "matching-token",
        },
      }),
    )
    await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "Existing B",
        site_url: "https://api.example.com",
        account_info: {
          ...defaultAccountInfo,
          id: 84,
          username: "other-user",
          access_token: "other-token",
        },
      }),
    )

    const { result } = await renderDuplicateWarningHook()

    await act(async () => {
      result.current.handlers.handleUrlChange("https://api.example.com")
      result.current.setters.setUserId("42")
    })

    let manualAddPromise!: Promise<void>
    act(() => {
      manualAddPromise = result.current.handlers.handleShowManualForm()
    })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning).toMatchObject({
        isOpen: true,
        existingAccountsCount: 2,
        existingUserId: 42,
        existingUsername: "matching-user",
      })
    })

    await act(async () => {
      result.current.handlers.handleDuplicateAccountWarningCancel()
      await manualAddPromise
    })
  })

  it("falls back to generic duplicate context when no exact user id match exists", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "Existing A",
        site_url: "https://api.example.com",
        account_info: {
          ...defaultAccountInfo,
          id: 42,
          username: "matching-user",
          access_token: "matching-token",
        },
      }),
    )
    await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "Existing B",
        site_url: "https://api.example.com",
        account_info: {
          ...defaultAccountInfo,
          id: 84,
          username: "other-user",
          access_token: "other-token",
        },
      }),
    )

    const { result } = await renderDuplicateWarningHook()

    await act(async () => {
      result.current.handlers.handleUrlChange("https://api.example.com")
      result.current.setters.setUserId("999")
    })

    let manualAddPromise!: Promise<void>
    act(() => {
      manualAddPromise = result.current.handlers.handleShowManualForm()
    })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning).toMatchObject({
        isOpen: true,
        existingAccountsCount: 2,
        existingUserId: null,
        existingUsername: null,
      })
    })

    await act(async () => {
      result.current.handlers.handleDuplicateAccountWarningCancel()
      await manualAddPromise
    })
  })

  it("opens the Sub2API key creation dialog after saving a Sub2API account", async () => {
    server.use(
      http.get("https://sub2.example.com/api/v1/auth/me", () =>
        HttpResponse.json({
          code: 0,
          message: "ok",
          data: {
            id: 1,
            username: "",
            email: "sub2@example.com",
            balance: 0,
          },
        }),
      ),
    )

    const onClose = vi.fn()
    const onSuccess = vi.fn()

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteType("sub2api")
      result.current.setters.setSiteName("Sub2")
      result.current.setters.setUsername("")
      result.current.setters.setAccessToken("jwt-token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(mockOpenSub2ApiTokenCreationDialog).toHaveBeenCalledTimes(1)
    expect(mockOpenSub2ApiTokenCreationDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        siteType: "sub2api",
        baseUrl: "https://sub2.example.com",
      }),
    )
  })

  it("keeps the save successful when the Sub2API follow-up dialog throws", async () => {
    server.use(
      http.get("https://sub2.example.com/api/v1/auth/me", () =>
        HttpResponse.json({
          code: 0,
          message: "ok",
          data: {
            id: 1,
            username: "",
            email: "sub2@example.com",
            balance: 0,
          },
        }),
      ),
    )
    mockOpenSub2ApiTokenCreationDialog.mockRejectedValueOnce(
      new Error("dialog failed"),
    )

    const onClose = vi.fn()
    const onSuccess = vi.fn()

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteType("sub2api")
      result.current.setters.setSiteName("Sub2")
      result.current.setters.setUsername("")
      result.current.setters.setAccessToken("jwt-token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
    })

    let saveResult:
      | Awaited<
          ReturnType<(typeof result.current.handlers)["handleSaveAccount"]>
        >
      | undefined
    await act(async () => {
      saveResult = await result.current.handlers.handleSaveAccount()
    })

    expect(saveResult).toMatchObject({ success: true })
    expect(mockOpenSub2ApiTokenCreationDialog).toHaveBeenCalledTimes(1)

    const savedAccounts = await accountStorage.getAllAccounts()
    expect(savedAccounts).toHaveLength(1)
    expect(savedAccounts[0]).toMatchObject({
      site_name: "Sub2",
      site_type: "sub2api",
      site_url: "https://sub2.example.com",
    })
  })
})
