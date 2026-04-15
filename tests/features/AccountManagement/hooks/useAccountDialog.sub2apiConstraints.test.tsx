import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SUB2API } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accounts/accountStorage"
import { AuthTypeEnum } from "~/types"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const {
  mockOpenWithAccount,
  mockOpenSub2ApiTokenCreationDialog,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockOpenWithAccount: vi.fn(),
  mockOpenSub2ApiTokenCreationDialog: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: mockToastSuccess,
    error: mockToastError,
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

describe("useAccountDialog Sub2API constraints", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await accountStorage.clearAllData()
    ;(globalThis.browser.tabs.sendMessage as any) = vi.fn()
  })

  it("forces Sub2API dialogs back to JWT auth, clears cookie sessions, and disables built-in check-in", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setAuthType(AuthTypeEnum.Cookie)
      result.current.setters.setCookieAuthSessionCookie("session=abc")
      result.current.setters.setCheckIn({
        enableDetection: true,
        autoCheckInEnabled: true,
        siteStatus: { isCheckedInToday: true },
      } as any)
      result.current.setters.setSiteType(SUB2API)
    })

    await waitFor(() => {
      expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
      expect(result.current.state.cookieAuthSessionCookie).toBe("")
      expect(result.current.state.checkIn.enableDetection).toBe(false)
      expect(result.current.state.checkIn.autoCheckInEnabled).toBe(false)
    })
  })

  it("clears stored refresh-token mode when the dialog leaves Sub2API", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setSiteType(SUB2API)
      result.current.handlers.handleSub2apiUseRefreshTokenChange(true)
      result.current.setters.setSub2apiRefreshToken("refresh-token")
      result.current.setters.setSub2apiTokenExpiresAt(123456)
    })

    await waitFor(() => {
      expect(result.current.state.siteType).toBe(SUB2API)
      expect(result.current.state.sub2apiUseRefreshToken).toBe(true)
      expect(result.current.state.sub2apiRefreshToken).toBe("refresh-token")
      expect(result.current.state.sub2apiTokenExpiresAt).toBe(123456)
    })

    await act(async () => {
      result.current.setters.setSiteType("one-api")
    })

    await waitFor(() => {
      expect(result.current.state.sub2apiUseRefreshToken).toBe(false)
      expect(result.current.state.sub2apiRefreshToken).toBe("")
      expect(result.current.state.sub2apiTokenExpiresAt).toBeNull()
    })
  })

  it("explicitly disabling refresh-token mode clears captured Sub2API credentials", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setSiteType(SUB2API)
      result.current.setters.setSub2apiRefreshToken("refresh-token")
      result.current.setters.setSub2apiTokenExpiresAt(654321)
    })

    await act(async () => {
      result.current.handlers.handleSub2apiUseRefreshTokenChange(false)
    })

    expect(result.current.state.sub2apiUseRefreshToken).toBe(false)
    expect(result.current.state.sub2apiRefreshToken).toBe("")
    expect(result.current.state.sub2apiTokenExpiresAt).toBeNull()
  })

  it("requires a refresh token before the form becomes valid in Sub2API refresh-token mode", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setSiteType(SUB2API)
      result.current.setters.setSiteName("Sub2API")
      result.current.setters.setUsername("user")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setAccessToken("jwt-token")
    })

    await act(async () => {
      result.current.handlers.handleSub2apiUseRefreshTokenChange(true)
    })

    expect(result.current.state.isFormValid).toBe(false)

    await act(async () => {
      result.current.setters.setSub2apiRefreshToken("refresh-token")
    })

    await waitFor(() => {
      expect(result.current.state.isFormValid).toBe(true)
    })
  })

  it("prefers importing Sub2API session data from an existing matching tab before falling back to background auto-detect", async () => {
    const { getAllTabs, sendRuntimeMessage } = await import(
      "~/utils/browser/browserApi"
    )
    vi.mocked(getAllTabs).mockResolvedValue([
      { id: 10, url: "https://other.example.com", active: false } as any,
      {
        id: 11,
        url: "https://sub2.example.com/dashboard",
        active: false,
      } as any,
      { id: 12, url: "https://sub2.example.com/settings", active: true } as any,
    ])
    vi.mocked(globalThis.browser.tabs.sendMessage).mockImplementation(
      async (tabId: number, message: { action: string; url: string }) => {
        expect(message.action).toBe(
          RuntimeActionIds.ContentGetUserFromLocalStorage,
        )
        expect(message.url).toBe("https://sub2.example.com")

        if (tabId === 12) {
          return {
            success: true,
            data: {
              accessToken: "jwt-from-tab",
              userId: 42,
              user: { username: "tab-user" },
              sub2apiAuth: {
                refreshToken: "refresh-from-tab",
                tokenExpiresAt: 123456,
              },
            },
          }
        }

        throw new Error("unexpected tab")
      },
    )

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteType(SUB2API)
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://sub2.example.com")
      expect(result.current.state.siteType).toBe(SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleImportSub2apiSession()
    })

    expect(result.current.state.sub2apiUseRefreshToken).toBe(false)
    expect(result.current.state.sub2apiRefreshToken).toBe("refresh-from-tab")
    expect(result.current.state.sub2apiTokenExpiresAt).toBe(123456)
    expect(result.current.state.accessToken).toBe("jwt-from-tab")
    expect(result.current.state.userId).toBe("42")
    expect(result.current.state.username).toBe("tab-user")
    expect(mockToastSuccess).toHaveBeenCalled()
    expect(sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("falls back to background auto-detect when no matching tab yields a Sub2API refresh token", async () => {
    const { getAllTabs, sendRuntimeMessage } = await import(
      "~/utils/browser/browserApi"
    )
    vi.mocked(getAllTabs).mockResolvedValue([
      {
        id: 21,
        url: "https://sub2.example.com/dashboard",
        active: true,
      } as any,
    ])
    vi.mocked(globalThis.browser.tabs.sendMessage).mockRejectedValue(
      new Error("content script unavailable"),
    )
    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      data: {
        accessToken: "jwt-from-background",
        userId: 7,
        user: { username: "bg-user" },
        sub2apiAuth: {
          refreshToken: "   ",
        },
      },
    } as any)

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteType(SUB2API)
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://sub2.example.com")
      expect(result.current.state.siteType).toBe(SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleImportSub2apiSession()
    })

    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoDetectSite,
        url: "https://sub2.example.com",
      }),
    )
    expect(result.current.state.sub2apiRefreshToken).toBe("")
    expect(result.current.state.accessToken).toBe("")
    expect(result.current.state.userId).toBe("")
    expect(mockToastError).toHaveBeenCalled()
  })

  it("hydrates Sub2API session fields from the background fallback when tab import cannot provide them", async () => {
    const { getAllTabs, sendRuntimeMessage } = await import(
      "~/utils/browser/browserApi"
    )
    vi.mocked(getAllTabs).mockResolvedValue([
      {
        id: 41,
        url: "https://sub2.example.com/dashboard",
        active: true,
      } as any,
    ])
    vi.mocked(globalThis.browser.tabs.sendMessage).mockRejectedValue(
      new Error("content script unavailable"),
    )
    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      data: {
        accessToken: "jwt-from-background",
        userId: 7,
        user: { username: "bg-user" },
        sub2apiAuth: {
          refreshToken: "refresh-from-background",
          tokenExpiresAt: 987654,
        },
      },
    } as any)

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteType(SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleImportSub2apiSession()
    })

    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoDetectSite,
        url: "https://sub2.example.com",
      }),
    )
    expect(result.current.state.sub2apiUseRefreshToken).toBe(false)
    expect(result.current.state.sub2apiRefreshToken).toBe(
      "refresh-from-background",
    )
    expect(result.current.state.sub2apiTokenExpiresAt).toBe(987654)
    expect(result.current.state.accessToken).toBe("jwt-from-background")
    expect(result.current.state.userId).toBe("7")
    expect(result.current.state.username).toBe("bg-user")
    expect(mockToastSuccess).toHaveBeenCalled()
  })

  it("keeps existing JWT fields when the imported optional Sub2API values are malformed", async () => {
    const { getAllTabs, sendRuntimeMessage } = await import(
      "~/utils/browser/browserApi"
    )
    vi.mocked(getAllTabs).mockResolvedValue([
      {
        id: 51,
        url: "https://sub2.example.com/dashboard",
        active: true,
      } as any,
    ])
    vi.mocked(globalThis.browser.tabs.sendMessage).mockRejectedValue(
      new Error("content script unavailable"),
    )
    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      data: {
        accessToken: "   ",
        userId: Number.NaN,
        user: { username: "   " },
        sub2apiAuth: {
          refreshToken: "refresh-from-background",
          tokenExpiresAt: Number.POSITIVE_INFINITY,
        },
      },
    } as any)

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteType(SUB2API)
      result.current.setters.setAccessToken("existing-jwt")
      result.current.setters.setUserId("99")
      result.current.setters.setUsername("existing-user")
    })

    await act(async () => {
      await result.current.handlers.handleImportSub2apiSession()
    })

    expect(result.current.state.sub2apiRefreshToken).toBe(
      "refresh-from-background",
    )
    expect(result.current.state.sub2apiTokenExpiresAt).toBeNull()
    expect(result.current.state.accessToken).toBe("existing-jwt")
    expect(result.current.state.userId).toBe("99")
    expect(result.current.state.username).toBe("")
    expect(mockToastSuccess).toHaveBeenCalled()
  })

  it("falls back to background auto-detect when enumerating tabs fails entirely", async () => {
    const { getAllTabs, sendRuntimeMessage } = await import(
      "~/utils/browser/browserApi"
    )
    vi.mocked(getAllTabs).mockRejectedValue(
      new Error("tab enumeration unavailable"),
    )
    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      data: {
        accessToken: "jwt-from-background",
        userId: 77,
        user: { username: "bg-user" },
        sub2apiAuth: {
          refreshToken: "refresh-from-background",
          tokenExpiresAt: 222333,
        },
      },
    } as any)

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteType(SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleImportSub2apiSession()
    })

    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoDetectSite,
        url: "https://sub2.example.com",
      }),
    )
    expect(result.current.state.sub2apiRefreshToken).toBe(
      "refresh-from-background",
    )
    expect(result.current.state.sub2apiTokenExpiresAt).toBe(222333)
    expect(result.current.state.accessToken).toBe("jwt-from-background")
    expect(result.current.state.userId).toBe("77")
    expect(result.current.state.username).toBe("bg-user")
    expect(mockToastSuccess).toHaveBeenCalled()
  })

  it("surfaces background fallback failures during Sub2API session import and resets the loading state", async () => {
    const { getAllTabs, sendRuntimeMessage } = await import(
      "~/utils/browser/browserApi"
    )
    vi.mocked(getAllTabs).mockResolvedValue([
      {
        id: 31,
        url: "https://sub2.example.com/dashboard",
        active: true,
      } as any,
    ])
    vi.mocked(globalThis.browser.tabs.sendMessage).mockRejectedValue(
      new Error("content script unavailable"),
    )
    vi.mocked(sendRuntimeMessage).mockRejectedValue(
      new Error("background auto-detect failed"),
    )

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteType(SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleImportSub2apiSession()
    })

    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoDetectSite,
        url: "https://sub2.example.com",
      }),
    )
    expect(mockToastError).toHaveBeenCalledWith(
      "accountDialog:messages.operationFailed",
    )
    expect(result.current.state.isImportingSub2apiSession).toBe(false)
    expect(result.current.state.sub2apiRefreshToken).toBe("")
  })
})
