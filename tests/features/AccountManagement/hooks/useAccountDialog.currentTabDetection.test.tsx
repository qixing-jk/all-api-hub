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
} = vi.hoisted(() => ({
  mockGetSiteName: vi.fn(),
  mockGetActiveTabs: vi.fn(),
  onTabActivatedMock: vi.fn(),
  onTabUpdatedMock: vi.fn(),
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({
    openWithAccount: vi.fn(),
    openSub2ApiTokenCreationDialog: vi.fn(),
  }),
}))

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
  beforeEach(() => {
    vi.clearAllMocks()

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
})
