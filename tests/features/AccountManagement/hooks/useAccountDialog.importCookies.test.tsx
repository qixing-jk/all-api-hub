import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useAccountCookieSession } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountCookieSession"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import toast from "~/lib/notify"
import { accountDataTransfer } from "~/services/accounts/accountStorage/accountDataTransfer"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS,
  PRODUCT_ANALYTICS_PERMISSION_IDS,
  PRODUCT_ANALYTICS_PERMISSION_OPERATIONS,
  PRODUCT_ANALYTICS_PERMISSION_OUTCOMES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { AuthTypeEnum } from "~/types"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

type OnTabActivated = typeof import("~/utils/browser/browserApi").onTabActivated
type OnTabUpdated = typeof import("~/utils/browser/browserApi").onTabUpdated

const { mockOpenWithAccount, mockOpenDefaultTokenQuickCreateDialogForAccount } =
  vi.hoisted(() => ({
    mockOpenWithAccount: vi.fn(),
    mockOpenDefaultTokenQuickCreateDialogForAccount: vi.fn(),
  }))

const { mockOpenSettingsTab } = vi.hoisted(() => ({
  mockOpenSettingsTab: vi.fn(),
}))

const {
  mockEnsurePermissionsDetailed,
  mockHasPermission,
  mockHasPermissions,
  mockOnOptionalPermissionsChanged,
} = vi.hoisted(() => ({
  mockEnsurePermissionsDetailed: vi.fn(),
  mockHasPermission: vi.fn(),
  mockHasPermissions: vi.fn(),
  mockOnOptionalPermissionsChanged: vi.fn<
    typeof import("~/services/permissions/permissionManager").onOptionalPermissionsChanged
  >(() => vi.fn()),
}))

const { mockOnTabActivated, mockOnTabUpdated } = vi.hoisted(() => ({
  mockOnTabActivated: vi.fn<OnTabActivated>(() => () => {}),
  mockOnTabUpdated: vi.fn<OnTabUpdated>(() => () => {}),
}))

const { mockTrackProductAnalyticsEvent } = vi.hoisted(() => ({
  mockTrackProductAnalyticsEvent: vi.fn(),
}))

vi.mock("~/lib/notify", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    custom: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({
    openWithAccount: mockOpenWithAccount,
    openDefaultTokenQuickCreateDialogForAccount:
      mockOpenDefaultTokenQuickCreateDialogForAccount,
  }),
}))

vi.mock("~/utils/navigation", () => ({
  openSettingsTab: mockOpenSettingsTab,
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: vi.fn(() => ({
    complete: vi.fn(),
  })),
}))

vi.mock("~/services/productAnalytics/dispatch", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/productAnalytics/dispatch")
    >()
  return {
    ...actual,
    trackProductAnalyticsEvent: mockTrackProductAnalyticsEvent,
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getActiveTabs: vi.fn(async () => []),
    getAllTabs: vi.fn(async () => []),
    onTabActivated: mockOnTabActivated,
    onTabUpdated: mockOnTabUpdated,
    sendRuntimeMessage: vi.fn(),
  }
})

vi.mock("~/services/permissions/permissionManager", () => ({
  ensurePermissionsDetailed: mockEnsurePermissionsDetailed,
  hasPermission: mockHasPermission,
  hasPermissions: mockHasPermissions,
  onOptionalPermissionsChanged: mockOnOptionalPermissionsChanged,
  OPTIONAL_PERMISSION_IDS: {
    Cookies: "cookies",
    declarativeNetRequestWithHostAccess: "declarativeNetRequestWithHostAccess",
    WebRequest: "webRequest",
    WebRequestBlocking: "webRequestBlocking",
  },
  OPTIONAL_PERMISSIONS: [
    "cookies",
    "declarativeNetRequestWithHostAccess",
    "webRequest",
    "webRequestBlocking",
  ],
}))

describe("useAccountDialog cookie import feedback", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockHasPermission.mockResolvedValue(true)
    mockHasPermissions.mockResolvedValue(true)
    mockEnsurePermissionsDetailed.mockResolvedValue({
      success: true,
      results: [],
      requestedResults: [],
    })
    mockOnOptionalPermissionsChanged.mockReturnValue(vi.fn())
    mockOnTabActivated.mockReturnValue(vi.fn())
    mockOnTabUpdated.mockReturnValue(vi.fn())
    const { getActiveTabs } = await import("~/utils/browser/browserApi")
    vi.mocked(getActiveTabs).mockImplementation(async () => {
      const query = (globalThis as any).browser?.tabs?.query
      if (typeof query !== "function") {
        return []
      }

      try {
        const tabs = await query({ active: true, currentWindow: true })
        if (tabs?.length) {
          return tabs
        }
      } catch {
        // Mirror getActiveTabs fallback behavior for tests that model Firefox Android.
      }

      try {
        return (await query({ active: true })) ?? []
      } catch {
        return []
      }
    })
    await accountDataTransfer.clearAllData()
  })

  it("leaves automatic detection free to continue when cookie reading rejects", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockRejectedValueOnce(
      new Error("cookie read failed"),
    )
    const applyCookie = vi.fn()
    const { result } = renderHook(() =>
      useAccountCookieSession({
        isOpen: true,
        mode: DIALOG_MODES.ADD,
        url: "https://new-api.example.com",
        authType: AuthTypeEnum.Cookie,
        getContext: () => ({}),
        applyCookie,
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    let shouldContinue: boolean | undefined
    await act(async () => {
      shouldContinue = await result.current.importAutomatically(() => true)
    })
    expect(shouldContinue).toBe(true)
    expect(applyCookie).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(result.current.state.isImportingCookies).toBe(false)
  })

  it("refreshes cookie permission feedback after optional permissions change", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.setters.setAuthType(AuthTypeEnum.Cookie))
    await waitFor(() =>
      expect(result.current.state.cookieAuthPermissionsGranted).toBe(true),
    )
    mockHasPermissions.mockResolvedValue(false)
    const changed = mockOnOptionalPermissionsChanged.mock.calls.at(-1)![0]
    await act(async () => {
      changed()
    })
    await waitFor(() =>
      expect(result.current.state.cookieAuthPermissionsGranted).toBe(false),
    )
  })

  it("requires a URL before dispatching a manual cookie import", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })
    expect(sendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
      }),
    )
    expect(toast.error).toHaveBeenCalledWith(
      "accountDialog:messages.urlRequired",
    )
  })

  it.each([
    { success: true, data: "" },
    { success: false, errorCode: COOKIE_IMPORT_FAILURE_REASONS.ReadFailed },
  ])(
    "reports empty or unreadable cookie results without replacing the draft: %j",
    async (response) => {
      const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
      vi.mocked(sendRuntimeMessage).mockResolvedValueOnce(response)
      const { result } = renderHook(() =>
        useAccountDialog({
          mode: DIALOG_MODES.ADD,
          isOpen: true,
          onClose: vi.fn(),
        }),
      )
      await waitFor(() => expect(result.current).toBeTruthy())
      await act(async () => {
        result.current.setters.setUrl("https://new-api.example.com")
        result.current.setters.setCookieAuthSessionCookie("session=existing")
      })
      await act(async () => {
        await result.current.handlers.handleImportCookieAuthSessionCookie()
      })
      expect(result.current.state.cookieAuthSessionCookie).toBe(
        "session=existing",
      )
      expect(toast.error).toHaveBeenCalledWith(
        response.success
          ? "accountDialog:messages.importCookiesEmpty"
          : "accountDialog:messages.importCookiesFailedUnknown",
      )
      expect(result.current.state.isImportingCookies).toBe(false)
    },
  )

  it.each([
    "url",
    "close",
    "site",
    "auth",
    "cookie",
    "url-round-trip",
  ] as const)("ignores a cookie import after changing %s", async (change) => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    let resolveImport!: (response: { success: boolean; data: string }) => void
    const pending = new Promise<{ success: boolean; data: string }>(
      (resolve) => {
        resolveImport = resolve
      },
    )
    vi.mocked(sendRuntimeMessage).mockReturnValueOnce(pending)
    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        useAccountDialog({ mode: DIALOG_MODES.ADD, isOpen, onClose: vi.fn() }),
      { initialProps: { isOpen: true } },
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      result.current.setters.setUrl("https://first.example.com")
    })
    let importing!: Promise<void>
    act(() => {
      importing = result.current.handlers.handleImportCookieAuthSessionCookie()
    })
    if (change === "close") rerender({ isOpen: false })
    else
      act(() => {
        if (change === "url" || change === "url-round-trip")
          result.current.setters.setUrl("https://second.example.com")
        if (change === "url-round-trip")
          result.current.setters.setUrl("https://first.example.com")
        if (change === "site") result.current.setters.setSiteType("new-api")
        if (change === "auth")
          result.current.setters.setAuthType(AuthTypeEnum.None)
        if (change === "cookie")
          result.current.setters.setCookieAuthSessionCookie("session=manual")
      })
    vi.mocked(toast.success).mockClear()
    await act(async () => {
      resolveImport({ success: true, data: "session=old" })
      await importing
    })
    expect(result.current.state.cookieAuthSessionCookie).toBe(
      change === "cookie" ? "session=manual" : "",
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("keeps the newer cookie import loading when the older request completes", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    let resolveOld!: (response: { success: boolean; data: string }) => void
    let resolveNew!: (response: { success: boolean; data: string }) => void
    vi.mocked(sendRuntimeMessage)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNew = resolve
        }),
      )
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      result.current.setters.setUrl("https://first.example.com")
    })
    let oldImport!: Promise<void>
    let newImport!: Promise<void>
    act(() => {
      oldImport = result.current.handlers.handleImportCookieAuthSessionCookie()
    })
    await act(async () => {
      result.current.setters.setUrl("https://second.example.com")
    })
    act(() => {
      newImport = result.current.handlers.handleImportCookieAuthSessionCookie()
    })
    await act(async () => {
      resolveOld({ success: true, data: "session=old" })
      await oldImport
    })
    expect(result.current.state.isImportingCookies).toBe(true)
    expect(result.current.state.cookieAuthSessionCookie).toBe("")
    await act(async () => {
      resolveNew({ success: true, data: "session=new" })
      await newImport
    })
    expect(result.current.state.isImportingCookies).toBe(false)
    expect(result.current.state.cookieAuthSessionCookie).toBe("session=new")
  })

  it("does not report a cookie import failure after the dialog closes", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    let rejectImport!: (error: unknown) => void
    vi.mocked(sendRuntimeMessage).mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectImport = reject
      }),
    )
    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        useAccountDialog({ mode: DIALOG_MODES.ADD, isOpen, onClose: vi.fn() }),
      { initialProps: { isOpen: true } },
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      result.current.setters.setUrl("https://first.example.com")
    })
    let importing!: Promise<void>
    act(() => {
      importing = result.current.handlers.handleImportCookieAuthSessionCookie()
    })
    rerender({ isOpen: false })
    vi.mocked(toast.error).mockClear()
    await act(async () => {
      rejectImport(new Error("old import failed"))
      await importing
    })
    expect(toast.error).not.toHaveBeenCalled()
    expect(result.current.state.isImportingCookies).toBe(false)
  })

  it.each(["external", "command"] as const)(
    "does not report permission success after %s close",
    async (close) => {
      let resolvePermission!: (response: {
        success: boolean
        results: never[]
        requestedResults: never[]
      }) => void
      mockEnsurePermissionsDetailed.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePermission = resolve
        }),
      )
      const { result, rerender } = renderHook(
        ({ isOpen }) =>
          useAccountDialog({
            mode: DIALOG_MODES.ADD,
            isOpen,
            onClose: vi.fn(),
          }),
        { initialProps: { isOpen: true } },
      )
      await waitFor(() => expect(result.current).toBeTruthy())
      let request!: Promise<void>
      act(() => {
        request = result.current.handlers.handleRequestCookieAuthPermissions()
      })
      if (close === "external") rerender({ isOpen: false })
      else
        await act(async () => {
          await result.current.handlers.handleClose()
        })
      vi.mocked(toast.success).mockClear()
      await act(async () => {
        resolvePermission({ success: true, results: [], requestedResults: [] })
        await request
      })
      expect(toast.success).not.toHaveBeenCalled()
      expect(result.current.state.isRequestingCookieAuthPermissions).toBe(false)
    },
  )

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

  it("sends the current incognito tab context when importing cookies manually", async () => {
    vi.mocked(toast.success).mockClear()
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: "session=incognito",
    })
    ;(globalThis as any).browser.tabs.query = vi.fn(async () => [
      {
        id: 42,
        incognito: true,
        url: "https://example.com/dashboard",
      },
    ])

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe("https://example.com")
    })

    await act(async () => {
      result.current.setters.setUrl("https://example.com")
    })

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: "https://example.com",
        sourceTabId: 42,
        sourceTabIncognito: true,
      }),
    )
    expect(result.current.state.cookieAuthSessionCookie).toBe(
      "session=incognito",
    )
    expect(toast.success).toHaveBeenCalledWith(
      "accountDialog:messages.importCookiesSuccess",
    )
  })

  it("trims and sends the current tab cookie store when importing from a matching origin", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: "session=container",
    })
    ;(globalThis as any).browser.tabs.query = vi.fn(async () => [
      {
        id: 43,
        cookieStoreId: " firefox-container-1 ",
        incognito: false,
        url: "https://example.com/dashboard",
      },
    ])

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe("https://example.com")
    })

    await act(async () => {
      result.current.setters.setUrl("https://example.com")
    })

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: "https://example.com",
        cookieStoreId: "firefox-container-1",
        sourceTabId: 43,
      }),
    )
    expect(sendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        sourceTabIncognito: true,
      }),
    )
  })

  it("skips current-tab context when importing cookies for a different origin", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: "session=other",
    })
    ;(globalThis as any).browser.tabs.query = vi.fn(async () => [
      {
        id: 44,
        cookieStoreId: "firefox-container-2",
        incognito: true,
        url: "https://current.example.com/dashboard",
      },
    ])

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe(
        "https://current.example.com",
      )
    })

    await act(async () => {
      result.current.setters.setUrl("https://other.example.com")
    })

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
      url: "https://other.example.com",
    })
  })

  it("sends matching current-tab context without a source tab id when the tab id is unavailable", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: "session=no-tab-id",
    })
    ;(globalThis as any).browser.tabs.query = vi.fn(async () => [
      {
        cookieStoreId: "firefox-container-3",
        url: "https://example.com/dashboard",
      },
    ])

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe("https://example.com")
    })

    await act(async () => {
      result.current.setters.setUrl("https://example.com")
    })

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: "https://example.com",
        cookieStoreId: "firefox-container-3",
      }),
    )
    expect(sendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        sourceTabId: expect.any(Number),
      }),
    )
  })

  it("drops stale current-tab import context when current-tab queries fail", async () => {
    vi.mocked(toast.success).mockClear()
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: "session=regular",
    })
    let onActivated: Parameters<OnTabActivated>[0] | undefined
    mockOnTabActivated.mockImplementation((listener) => {
      onActivated = listener
      return vi.fn()
    })
    ;(globalThis as any).browser.tabs.query = vi.fn().mockResolvedValue([
      {
        id: 42,
        incognito: true,
        url: "https://example.com/dashboard",
      },
    ])

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe("https://example.com")
    })

    vi.mocked(globalThis.browser.tabs.query).mockRejectedValue(
      new Error("tab query failed"),
    )

    await act(async () => {
      await onActivated?.({ tabId: 42, windowId: 1 })
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBeNull()
    })

    await act(async () => {
      result.current.setters.setUrl("https://example.com")
    })

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
      url: "https://example.com",
    })
    expect(toast.success).toHaveBeenCalledWith(
      "accountDialog:messages.importCookiesSuccess",
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
    expect(toast.custom).not.toHaveBeenCalled()

    await act(async () => {
      result.current.handlers.handleOpenCookiePermissionSettings()
    })

    expect(onClose).not.toHaveBeenCalled()
    expect(mockOpenSettingsTab).toHaveBeenCalledWith("permissions")
  })

  it("clears the permission warning when a later import fails for a non-permission reason", async () => {
    vi.mocked(toast.error).mockClear()
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage)
      .mockResolvedValueOnce({
        success: false,
        errorCode: COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied,
        error: "Missing host permission for the tab",
      })
      .mockResolvedValueOnce({
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

    expect(result.current.state.showCookiePermissionWarning).toBe(true)

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expect(result.current.state.showCookiePermissionWarning).toBe(false)
    expect(toast.error).toHaveBeenLastCalledWith(
      "accountDialog:messages.importCookiesEmpty",
    )
  })

  it("shows a generic import failure toast when the response has an error without an error code", async () => {
    vi.mocked(toast.error).mockClear()
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      error: "storage backend failed",
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
      "accountDialog:messages.importCookiesFailed",
    )
  })

  it("recommends and requests the full cookie-auth optional permission set", async () => {
    vi.mocked(toast.success).mockClear()
    mockHasPermission.mockResolvedValue(false)
    mockHasPermissions.mockResolvedValue(false)

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
    })

    await waitFor(() => {
      expect(result.current.state.cookieAuthPermissionsGranted).toBe(false)
    })

    await act(async () => {
      await result.current.handlers.handleRequestCookieAuthPermissions()
    })

    expect(mockEnsurePermissionsDetailed).toHaveBeenCalledWith([
      "cookies",
      "declarativeNetRequestWithHostAccess",
      "webRequest",
      "webRequestBlocking",
    ])
    expect(mockEnsurePermissionsDetailed).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(
      "accountDialog:messages.cookiePermissionGranted",
    )
  })

  it("tracks cookie-auth permission request outcomes for requested permissions only", async () => {
    vi.mocked(toast.error).mockClear()
    mockHasPermission.mockResolvedValue(false)
    mockHasPermissions.mockResolvedValue(false)
    mockEnsurePermissionsDetailed.mockResolvedValueOnce({
      success: false,
      results: [
        {
          id: "cookies",
          requested: false,
          success: true,
          wasGrantedBefore: true,
          wasGrantedAfter: true,
        },
        {
          id: "webRequest",
          requested: true,
          success: false,
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
        {
          id: "webRequestBlocking",
          requested: true,
          success: false,
          failureReason: "api_exception",
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
      ],
      requestedResults: [
        {
          id: "webRequest",
          requested: true,
          success: false,
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
        {
          id: "webRequestBlocking",
          requested: true,
          success: false,
          failureReason: "api_exception",
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
      ],
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
      result.current.setters.setAuthType(AuthTypeEnum.Cookie)
    })

    await act(async () => {
      await result.current.handlers.handleRequestCookieAuthPermissions()
    })

    expect(mockTrackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.WebRequest,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.Denied,
        failure_reason: PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.UserDenied,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(mockTrackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.WebRequestBlocking,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError,
        failure_reason:
          PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(mockTrackProductAnalyticsEvent).not.toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      expect.objectContaining({
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.Cookies,
      }),
    )
    expect(toast.error).toHaveBeenCalledWith(
      "accountDialog:messages.cookiePermissionGrantFailed",
    )
  })

  it("keeps the cookie permission action pending until the permission request settles", async () => {
    vi.mocked(toast.success).mockClear()
    mockHasPermission.mockResolvedValue(false)
    mockHasPermissions.mockResolvedValue(false)
    let resolveEnsurePermissions: (value: {
      success: boolean
      results: unknown[]
      requestedResults: unknown[]
    }) => void = () => {}
    mockEnsurePermissionsDetailed.mockReturnValue(
      new Promise<{
        success: boolean
        results: unknown[]
        requestedResults: unknown[]
      }>((resolve) => {
        resolveEnsurePermissions = resolve
      }),
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
      result.current.setters.setAuthType(AuthTypeEnum.Cookie)
    })

    let requestPromise: Promise<void>
    await act(async () => {
      requestPromise =
        result.current.handlers.handleRequestCookieAuthPermissions()
    })

    expect(result.current.state.isRequestingCookieAuthPermissions).toBe(true)
    expect(mockEnsurePermissionsDetailed).toHaveBeenCalledWith([
      "cookies",
      "declarativeNetRequestWithHostAccess",
      "webRequest",
      "webRequestBlocking",
    ])

    await act(async () => {
      resolveEnsurePermissions({
        success: true,
        results: [],
        requestedResults: [],
      })
      await requestPromise
    })

    expect(result.current.state.isRequestingCookieAuthPermissions).toBe(false)
    expect(toast.success).toHaveBeenCalledWith(
      "accountDialog:messages.cookiePermissionGranted",
    )
  })

  it("marks cookie permissions unavailable when refresh fails and removes the listener on close", async () => {
    const unsubscribe = vi.fn()
    mockHasPermissions.mockRejectedValue(new Error("permission probe failed"))
    mockOnOptionalPermissionsChanged.mockReturnValue(unsubscribe)

    const { result, unmount } = renderHook(() =>
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
    })

    await waitFor(() => {
      expect(result.current.state.cookieAuthPermissionsGranted).toBe(false)
    })

    expect(mockHasPermissions).toHaveBeenCalledWith([
      "cookies",
      "declarativeNetRequestWithHostAccess",
      "webRequest",
      "webRequestBlocking",
    ])
    expect(mockOnOptionalPermissionsChanged).toHaveBeenCalledTimes(1)

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it("shows an error toast when the cookie permission request is rejected", async () => {
    vi.mocked(toast.error).mockClear()
    mockHasPermission.mockResolvedValue(false)
    mockHasPermissions.mockResolvedValue(false)
    mockEnsurePermissionsDetailed.mockRejectedValueOnce(
      new Error("permission request failed"),
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
      result.current.setters.setAuthType(AuthTypeEnum.Cookie)
    })

    await act(async () => {
      await result.current.handlers.handleRequestCookieAuthPermissions()
    })

    expect(result.current.state.isRequestingCookieAuthPermissions).toBe(false)
    expect(toast.error).toHaveBeenCalledWith(
      "accountDialog:messages.cookiePermissionGrantFailed",
    )
  })

  it("tracks every cookie-auth permission as an API error when the permission request rejects", async () => {
    vi.mocked(toast.error).mockClear()
    mockHasPermission.mockResolvedValue(false)
    mockHasPermissions.mockResolvedValue(false)
    mockEnsurePermissionsDetailed.mockRejectedValueOnce(
      new Error("permission request failed"),
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
      result.current.setters.setAuthType(AuthTypeEnum.Cookie)
    })

    await act(async () => {
      await result.current.handlers.handleRequestCookieAuthPermissions()
    })

    expect(mockTrackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.Cookies,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError,
        failure_reason:
          PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(mockTrackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id:
          PRODUCT_ANALYTICS_PERMISSION_IDS.DeclarativeNetRequestWithHostAccess,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError,
        failure_reason:
          PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(mockTrackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.WebRequest,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError,
        failure_reason:
          PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(mockTrackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.WebRequestBlocking,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError,
        failure_reason:
          PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(toast.error).toHaveBeenCalledWith(
      "accountDialog:messages.cookiePermissionGrantFailed",
    )
  })
})
