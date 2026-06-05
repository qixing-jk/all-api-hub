import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { AuthTypeEnum } from "~/types"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const originalBrowser = globalThis.browser

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

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
    mockGetActiveTabs.mockImplementation(async () => {
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
    tabsQueryMock.mockImplementation(async (queryInfo) => {
      if (queryInfo?.currentWindow) {
        throw new Error("currentWindow unsupported")
      }

      return [
        {
          id: 2,
          url: "https://fallback.example.com/dashboard",
        },
      ]
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
        "https://fallback.example.com",
      )
      expect(result.current.state.siteName).toBe("Detected Site")
    })
  })

  it("clears stale current-tab detection when fallback active-tab lookup returns no tab", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    let activatedListener: (() => void | Promise<void>) | undefined
    onTabActivatedMock.mockImplementation((listener) => {
      activatedListener = listener
      return () => {}
    })
    tabsQueryMock.mockResolvedValueOnce([
      {
        id: 13,
        url: "https://initial.example.com/path",
      },
    ])
    tabsQueryMock.mockResolvedValueOnce([
      {
        id: 13,
        url: "https://initial.example.com/path",
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
        "https://initial.example.com",
      )
      expect(result.current.state.siteName).toBe("Detected Site")
    })

    tabsQueryMock.mockImplementation(async (queryInfo) => {
      if (queryInfo?.currentWindow) {
        throw new Error("currentWindow unsupported")
      }

      return []
    })

    await act(async () => {
      await activatedListener?.()
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBeNull()
      expect(result.current.state.siteName).toBe("")
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

  it("clears current-tab detection when the primary active-tab lookup returns no tab", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    tabsQueryMock.mockResolvedValue([])

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

  it("clears current-tab detection when the primary active-tab lookup returns a tab without a URL", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    tabsQueryMock.mockResolvedValue([{ id: 16 }])

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

  it("clears current-tab detection when active-tab lookup fails", async () => {
    mockGetActiveTabs.mockRejectedValueOnce(new Error("tabs unavailable"))

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

  it("clears current-tab detection when fallback finds a non-http tab", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    let activatedListener: (() => void | Promise<void>) | undefined
    onTabActivatedMock.mockImplementation((listener) => {
      activatedListener = listener
      return () => {}
    })
    tabsQueryMock.mockResolvedValueOnce([
      {
        id: 14,
        url: "https://initial.example.com/path",
      },
    ])
    tabsQueryMock.mockResolvedValueOnce([
      {
        id: 14,
        url: "https://initial.example.com/path",
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
        "https://initial.example.com",
      )
      expect(result.current.state.siteName).toBe("Detected Site")
    })

    tabsQueryMock.mockImplementation(async (queryInfo) => {
      if (queryInfo?.currentWindow) {
        throw new Error("currentWindow unsupported")
      }

      return [
        {
          id: 14,
          url: "chrome://extensions",
        },
      ]
    })

    await act(async () => {
      await activatedListener?.()
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBeNull()
      expect(result.current.state.siteName).toBe("")
    })
  })

  it("clears current-tab detection when fallback active-tab lookup returns a tab without a URL", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    let activatedListener: (() => void | Promise<void>) | undefined
    onTabActivatedMock.mockImplementation((listener) => {
      activatedListener = listener
      return () => {}
    })
    tabsQueryMock.mockResolvedValueOnce([
      {
        id: 15,
        url: "https://initial.example.com/path",
      },
    ])
    tabsQueryMock.mockResolvedValueOnce([
      {
        id: 15,
        url: "https://initial.example.com/path",
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
        "https://initial.example.com",
      )
      expect(result.current.state.siteName).toBe("Detected Site")
    })

    tabsQueryMock.mockImplementation(async (queryInfo) => {
      if (queryInfo?.currentWindow) {
        throw new Error("currentWindow unsupported")
      }

      return [{ id: 15 }]
    })

    await act(async () => {
      await activatedListener?.()
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBeNull()
      expect(result.current.state.siteName).toBe("")
    })
  })

  it("ignores non-http tabs and only refreshes on tab updates for the active tab", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    let activeTab = {
      id: 3,
      url: "chrome://extensions",
    }
    tabsQueryMock.mockImplementation(async () => [activeTab])

    mockGetActiveTabs.mockImplementation(async () => {
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

    await waitFor(() => {
      expect(mockGetSiteName).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 4 }),
      )
    })

    activeTab = {
      id: 4,
      url: "https://active.example.com/dashboard",
    }

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

  it("applies URL auth defaults when the user chooses the current tab", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    tabsQueryMock.mockResolvedValue([
      {
        id: 7,
        url: "https://anyrouter.top/console",
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
      expect(result.current.state.currentTabUrl).toBe("https://anyrouter.top")
    })

    await act(async () => {
      result.current.handlers.handleUseCurrentTabUrl()
    })

    expect(result.current.state.url).toBe("https://anyrouter.top")
    expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
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

  it("ignores stale current-tab title resolutions after a newer active-tab detection wins", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    let activeTab = {
      id: 20,
      url: "https://initial.example.com/path",
    }
    tabsQueryMock.mockImplementation(async () => [activeTab])

    let activatedListener: (() => void | Promise<void>) | undefined
    onTabActivatedMock.mockImplementation((listener) => {
      activatedListener = listener
      return () => {}
    })

    const slowTitle = createDeferred<string>()
    const fastTitle = createDeferred<string>()
    mockGetSiteName.mockImplementation((tab: browser.tabs.Tab) => {
      if (tab.id === 21) return slowTitle.promise
      if (tab.id === 22) return fastTitle.promise

      return Promise.resolve("Initial Site")
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
      expect(result.current.state.siteName).toBe("Initial Site")
    })

    activeTab = {
      id: 21,
      url: "https://slow.example.com/path",
    }
    act(() => {
      void activatedListener?.()
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe(
        "https://slow.example.com",
      )
    })

    activeTab = {
      id: 22,
      url: "https://fast.example.com/path",
    }
    act(() => {
      void activatedListener?.()
    })

    await act(async () => {
      fastTitle.resolve("Fast Site")
      await fastTitle.promise
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe(
        "https://fast.example.com",
      )
      expect(result.current.state.siteName).toBe("Fast Site")
    })

    await act(async () => {
      slowTitle.resolve("Slow Site")
      await slowTitle.promise
    })

    expect(result.current.state.currentTabUrl).toBe("https://fast.example.com")
    expect(result.current.state.siteName).toBe("Fast Site")

    await act(async () => {
      result.current.handlers.handleUseCurrentTabUrl()
    })

    expect(result.current.state.url).toBe("https://fast.example.com")
    expect(result.current.state.siteName).toBe("Fast Site")
  })

  it("ignores stale fallback active-tab title resolutions after a newer detection wins", async () => {
    const tabsQueryMock = globalThis.browser.tabs.query as ReturnType<
      typeof vi.fn
    >
    let activeTab = {
      id: 23,
      url: "https://fallback-initial.example.com/path",
    }
    tabsQueryMock.mockImplementation(async (queryInfo) => {
      if (queryInfo?.currentWindow) {
        throw new Error("currentWindow unsupported")
      }

      return [activeTab]
    })

    let activatedListener: (() => void | Promise<void>) | undefined
    onTabActivatedMock.mockImplementation((listener) => {
      activatedListener = listener
      return () => {}
    })

    const slowTitle = createDeferred<string>()
    const fastTitle = createDeferred<string>()
    mockGetSiteName.mockImplementation((tab: browser.tabs.Tab) => {
      if (tab.id === 24) return slowTitle.promise
      if (tab.id === 25) return fastTitle.promise

      return Promise.resolve("Fallback Initial Site")
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
        "https://fallback-initial.example.com",
      )
      expect(result.current.state.siteName).toBe("Fallback Initial Site")
    })

    activeTab = {
      id: 24,
      url: "https://fallback-slow.example.com/path",
    }
    act(() => {
      void activatedListener?.()
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe(
        "https://fallback-slow.example.com",
      )
    })

    activeTab = {
      id: 25,
      url: "https://fallback-fast.example.com/path",
    }
    act(() => {
      void activatedListener?.()
    })

    await act(async () => {
      fastTitle.resolve("Fallback Fast Site")
      await fastTitle.promise
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe(
        "https://fallback-fast.example.com",
      )
      expect(result.current.state.siteName).toBe("Fallback Fast Site")
    })

    await act(async () => {
      slowTitle.resolve("Fallback Slow Site")
      await slowTitle.promise
    })

    expect(result.current.state.currentTabUrl).toBe(
      "https://fallback-fast.example.com",
    )
    expect(result.current.state.siteName).toBe("Fallback Fast Site")

    await act(async () => {
      result.current.handlers.handleUseCurrentTabUrl()
    })

    expect(result.current.state.url).toBe("https://fallback-fast.example.com")
    expect(result.current.state.siteName).toBe("Fallback Fast Site")
  })
})
