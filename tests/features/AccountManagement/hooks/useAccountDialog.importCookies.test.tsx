import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accounts/accountStorage"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const { mockOpenWithAccount, mockOpenSub2ApiTokenCreationDialog } = vi.hoisted(
  () => ({
    mockOpenWithAccount: vi.fn(),
    mockOpenSub2ApiTokenCreationDialog: vi.fn(),
  }),
)

const { mockOpenSettingsTab } = vi.hoisted(() => ({
  mockOpenSettingsTab: vi.fn(),
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

vi.mock("~/utils/navigation", () => ({
  openSettingsTab: mockOpenSettingsTab,
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

describe("useAccountDialog cookie import feedback", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await accountStorage.clearAllData()
  })

  it("shows the empty-cookie message when no cookies are available", async () => {
    vi.mocked(toast.error).mockClear()
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      errorCode: COOKIE_IMPORT_FAILURE_REASONS.NoCookiesFound,
    })

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
      result.current.setters.setUrl("https://example.com")
    })

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expect(result.current.state.showCookiePermissionWarning).toBe(false)
    expect(toast.error).toHaveBeenCalledWith(
      "accountDialog:messages.importCookiesEmpty",
    )
  })

  it("shows a standard permission-denied error toast when cookie access is denied", async () => {
    vi.mocked(toast.error).mockClear()
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    const onClose = vi.fn()
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      errorCode: COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied,
      error: "Missing host permission for the tab",
    })

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose,
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://example.com")
    })

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expect(result.current.state.showCookiePermissionWarning).toBe(true)
    expect(toast.error).toHaveBeenCalledWith(
      "accountDialog:messages.importCookiesPermissionDenied",
    )

    await act(async () => {
      result.current.handlers.handleOpenCookiePermissionSettings()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockOpenSettingsTab).toHaveBeenCalledWith("permissions")
  })
})
