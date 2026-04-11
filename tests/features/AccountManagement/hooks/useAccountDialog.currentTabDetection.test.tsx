import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const originalBrowser = globalThis.browser

const {
  mockGetSiteName,
  mockGetActiveTabs,
  onTabActivatedMock,
  onTabUpdatedMock,
  mockUserPreferencesContext,
} = vi.hoisted(() => ({
  mockGetSiteName: vi.fn(),
  mockGetActiveTabs: vi.fn(),
  onTabActivatedMock: vi.fn(),
  onTabUpdatedMock: vi.fn(),
  mockUserPreferencesContext: {
    current: {
      warnOnDuplicateAccountAdd: true,
      managedSiteType: "new-api",
      autoFillCurrentSiteUrlOnAccountAdd: false,
    },
  },
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({
    openWithAccount: vi.fn(),
    openSub2ApiTokenCreationDialog: vi.fn(),
  }),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    useUserPreferencesContext: () => mockUserPreferencesContext.current,
  }
})

vi.mock("~/services/accounts/accountOperations", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/accounts/accountOperations")
    >()
  return {
    ...actual,
    getSiteName: mockGetSiteName,
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getActiveTabs: mockGetActiveTabs,
    onTabActivated: onTabActivatedMock,
    onTabUpdated: onTabUpdatedMock,
    sendRuntimeMessage: vi.fn(),
  }
})

describe("useAccountDialog current tab detection", () => {
  const renderAccountDialogHook = (
    props: Parameters<typeof useAccountDialog>[0],
  ) =>
    renderHook(() => useAccountDialog(props), {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

  beforeEach(() => {
    vi.clearAllMocks()
    mockUserPreferencesContext.current = {
      warnOnDuplicateAccountAdd: true,
      managedSiteType: "new-api",
      autoFillCurrentSiteUrlOnAccountAdd: false,
    }

    const queryMock = vi.fn(async () => [])
    ;(globalThis as any).browser = {
      ...originalBrowser,
      tabs: {
        ...(originalBrowser?.tabs ?? {}),
        query: queryMock,
        sendMessage: vi.fn(),
      },
    }

    mockGetSiteName.mockResolvedValue("Detected Site")
    mockGetActiveTabs.mockResolvedValue([])
    onTabActivatedMock.mockImplementation(() => () => {})
    onTabUpdatedMock.mockImplementation(() => () => {})
  })

  it("loads the current tab url and derived site name for add mode", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    tabsQueryMock.mockResolvedValueOnce([
      {
        id: 1,
        url: "https://api.example.com/path?q=1",
      },
    ])
    tabsQueryMock.mockResolvedValueOnce([
      {
        id: 1,
        url: "https://api.example.com/path?q=1",
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
      expect(result.current.state.currentTabUrl).toBe("https://api.example.com")
      expect(result.current.state.siteName).toBe("Detected Site")
    })
  })

  it("falls back to active-tab queries when currentWindow lookups fail", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    tabsQueryMock
      .mockRejectedValueOnce(new Error("currentWindow unsupported"))
      .mockResolvedValueOnce([
        {
          id: 2,
          url: "https://fallback.example.com/dashboard",
        },
      ])
      .mockRejectedValueOnce(new Error("currentWindow unsupported"))
      .mockResolvedValueOnce([
        {
          id: 2,
          url: "https://fallback.example.com/dashboard",
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
        "https://fallback.example.com",
      )
      expect(result.current.state.siteName).toBe("Detected Site")
    })
  })

  it("clears current-tab detection when the active tab URL cannot be parsed", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    tabsQueryMock.mockResolvedValue([
      {
        id: 5,
        url: "not a url",
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
      expect(result.current.state.currentTabUrl).toBeNull()
      expect(result.current.state.siteName).toBe("")
    })
    expect(mockGetSiteName).not.toHaveBeenCalled()
  })

  it("ignores non-http tabs and only refreshes on tab updates for the active tab", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    tabsQueryMock
      .mockResolvedValueOnce([
        {
          id: 3,
          url: "chrome://extensions",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 3,
          url: "chrome://extensions",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 4,
          url: "https://active.example.com/dashboard",
        },
      ])

    mockGetActiveTabs
      .mockResolvedValueOnce([{ id: 999 } as any])
      .mockResolvedValueOnce([{ id: 4 } as any])

    let updatedListener: ((tabId: number) => void | Promise<void>) | undefined
    onTabUpdatedMock.mockImplementation((listener) => {
      updatedListener = listener
      return () => {}
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
      expect(result.current.state.currentTabUrl).toBeNull()
      expect(result.current.state.siteName).toBe("")
    })

    await act(async () => {
      await updatedListener?.(123)
    })

    expect(result.current.state.currentTabUrl).toBeNull()
    expect(mockGetSiteName).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 123 }),
    )

    await act(async () => {
      await updatedListener?.(4)
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe(
        "https://active.example.com",
      )
      expect(result.current.state.siteName).toBe("Detected Site")
    })
  })

  it("reuses the detected current-tab origin when the user chooses it", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    tabsQueryMock.mockResolvedValue([
      {
        id: 6,
        url: "https://picked.example.com/path?q=1",
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
        "https://picked.example.com",
      )
    })

    await act(async () => {
      result.current.handlers.handleUseCurrentTabUrl()
    })

    expect(result.current.state.url).toBe("https://picked.example.com")
  })

  it("prefills the add-account url from the current tab when the setting is enabled", async () => {
    mockUserPreferencesContext.current = {
      ...mockUserPreferencesContext.current,
      autoFillCurrentSiteUrlOnAccountAdd: true,
    }

    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    tabsQueryMock.mockResolvedValue([
      {
        id: 8,
        url: "https://prefill.example.com/dashboard?x=1",
      },
    ])

    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await waitFor(() => {
      expect(result.current).toBeTruthy()
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe(
        "https://prefill.example.com",
      )
      expect(result.current.state.url).toBe("https://prefill.example.com")
    })
  })

  it("keeps the url field empty when the setting is disabled", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    tabsQueryMock.mockResolvedValue([
      {
        id: 9,
        url: "https://manual.example.com/home",
      },
    ])

    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await waitFor(() => {
      expect(result.current).toBeTruthy()
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe(
        "https://manual.example.com",
      )
    })
    expect(result.current.state.url).toBe("")
  })

  it("does not overwrite a prefilled url after later active-tab updates", async () => {
    mockUserPreferencesContext.current = {
      ...mockUserPreferencesContext.current,
      autoFillCurrentSiteUrlOnAccountAdd: true,
    }

    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    let activeUrl = "https://first.example.com/path"
    tabsQueryMock.mockImplementation(async () => [
      {
        id: 10,
        url: activeUrl,
      },
    ])

    let activatedListener: (() => void | Promise<void>) | undefined
    onTabActivatedMock.mockImplementation((listener) => {
      activatedListener = listener
      return () => {}
    })

    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await waitFor(() => {
      expect(result.current).toBeTruthy()
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://first.example.com")
    })

    activeUrl = "https://second.example.com/path"

    await act(async () => {
      await activatedListener?.()
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe(
        "https://second.example.com",
      )
    })
    expect(result.current.state.url).toBe("https://first.example.com")
  })

  it("does not overwrite a manually edited url after current-tab detection completes", async () => {
    mockUserPreferencesContext.current = {
      ...mockUserPreferencesContext.current,
      autoFillCurrentSiteUrlOnAccountAdd: true,
    }

    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    let resolveTabs: ((value: any[]) => void) | null = null
    tabsQueryMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTabs = resolve
        }),
    )

    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await waitFor(() => {
      expect(result.current).toBeTruthy()
    })

    await act(async () => {
      result.current.handlers.handleUrlChange("https://typed.example.com/path")
    })

    expect(result.current.state.url).toBe("https://typed.example.com")

    await act(async () => {
      resolveTabs?.([
        {
          id: 11,
          url: "https://detected.example.com/path",
        },
      ])
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe(
        "https://detected.example.com",
      )
    })
    expect(result.current.state.url).toBe("https://typed.example.com")
  })

  it("does not prefill in edit mode even when the setting is enabled", async () => {
    mockUserPreferencesContext.current = {
      ...mockUserPreferencesContext.current,
      autoFillCurrentSiteUrlOnAccountAdd: true,
    }

    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    tabsQueryMock.mockResolvedValue([
      {
        id: 12,
        url: "https://edit.example.com/path",
      },
    ])

    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.EDIT,
      account: {
        id: "account-1",
      } as any,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBeNull()
    })
    expect(result.current.state.url).toBe("")
  })

  it("refreshes current-tab detection when the active tab changes", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    let activeUrl = "https://initial.example.com/path"
    tabsQueryMock.mockImplementation(async () => [
      {
        id: 7,
        url: activeUrl,
      },
    ])

    let activatedListener: (() => void | Promise<void>) | undefined
    onTabActivatedMock.mockImplementation((listener) => {
      activatedListener = listener
      return () => {}
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
      expect(result.current.state.currentTabUrl).toBe(
        "https://initial.example.com",
      )
      expect(result.current.state.siteName).toBe("Detected Site")
    })

    activeUrl = "https://activated.example.com/path"

    await act(async () => {
      await activatedListener?.()
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe(
        "https://activated.example.com",
      )
      expect(result.current.state.siteName).toBe("Detected Site")
    })
  })
})
