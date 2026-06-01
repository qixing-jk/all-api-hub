import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { ACCOUNT_DIALOG_FORM_SOURCES } from "~/features/AccountManagement/components/AccountDialog/models"
import { AuthTypeEnum } from "~/types"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const originalBrowser = globalThis.browser

const {
  mockGetActiveTabs,
  onTabActivatedMock,
  onTabUpdatedMock,
  tabActivatedCallbacks,
} = vi.hoisted(() => ({
  mockGetActiveTabs: vi.fn(),
  onTabActivatedMock: vi.fn(),
  onTabUpdatedMock: vi.fn(),
  tabActivatedCallbacks: [] as Array<
    (activeInfo: browser.tabs._OnActivatedActiveInfo) => void
  >,
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
    useUserPreferencesContext: () => ({
      warnOnDuplicateAccountAdd: true,
      managedSiteType: "new-api",
      autoFillCurrentSiteUrlOnAccountAdd: true,
      autoProvisionKeyOnAccountAdd: false,
    }),
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

describe("useAccountDialog sponsor prefill", () => {
  const renderAccountDialogHook = (
    props: Parameters<typeof useAccountDialog>[0],
  ) =>
    renderHook(() => useAccountDialog(props), {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).browser = {
      ...originalBrowser,
      tabs: {
        ...(originalBrowser?.tabs ?? {}),
        query: vi.fn(async () => [
          {
            id: 1,
            url: "https://current-tab.example.com/path",
          },
        ]),
        sendMessage: vi.fn(),
      },
    }
    mockGetActiveTabs.mockResolvedValue([])
    tabActivatedCallbacks.splice(0, tabActivatedCallbacks.length)
    onTabActivatedMock.mockImplementation((callback) => {
      tabActivatedCallbacks.push(callback)
      return () => {}
    })
    onTabUpdatedMock.mockImplementation(() => () => {})
  })

  it("keeps the current-site prompt live while binding title updates to the selected URL", async () => {
    const activeTabs = [
      {
        id: 1,
        title: "Current Provider Loading",
        url: "https://current.example.com/path",
      },
      {
        id: 2,
        title: "Current Provider Ready",
        url: "https://current.example.com/dashboard",
      },
      {
        id: 3,
        title: "Other Provider",
        url: "https://other.example.com/path",
      },
    ] as browser.tabs.Tab[]

    ;(globalThis as any).browser.tabs.query = vi.fn(async () => [activeTabs[0]])

    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await waitFor(() => {
      expect(result.current.state.currentTabUrl).toBe(
        "https://current.example.com",
      )
      expect(result.current.state.siteName).toBe("Current Provider Loading")
    })
    ;(globalThis as any).browser.tabs.query = vi.fn(async () => [activeTabs[1]])

    await act(async () => {
      tabActivatedCallbacks[0]?.({ tabId: 2, windowId: 1 })
    })

    expect(result.current.state.currentTabUrl).toBe(
      "https://current.example.com",
    )
    expect(result.current.state.siteName).toBe("Current Provider Loading")
    ;(globalThis as any).browser.tabs.query = vi.fn(async () => [activeTabs[2]])

    await act(async () => {
      tabActivatedCallbacks[0]?.({ tabId: 3, windowId: 1 })
    })

    expect(result.current.state.currentTabUrl).toBe("https://other.example.com")
    expect(result.current.state.siteName).toBe("Current Provider Loading")

    await act(async () => {
      result.current.handlers.handleUseCurrentTabUrl()
    })

    expect(result.current.state.url).toBe("https://other.example.com")
    expect(result.current.state.siteName).toBe("Other Provider")
  })

  it("initializes add mode from sponsor prefill without waiting for current-tab detection", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      prefill: {
        siteUrl: "https://anyrouter.example.com",
        siteType: SITE_TYPES.ANYROUTER,
        authType: AuthTypeEnum.Cookie,
        source: "sponsor",
        sponsorId: "anyrouter",
      },
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://anyrouter.example.com")
      expect(result.current.state.siteType).toBe(SITE_TYPES.ANYROUTER)
      expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
      expect(result.current.state.formSource).toBe(
        ACCOUNT_DIALOG_FORM_SOURCES.SPONSOR,
      )
    })
  })

  it("falls back to access-token auth when sponsor prefill contains a blank auth type", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      prefill: {
        siteUrl: "https://dev-supported.example.test",
        siteType: SITE_TYPES.NEW_API,
        authType: "" as any,
        source: "sponsor",
        sponsorId: "dev-supported-direct",
      },
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe(
        "https://dev-supported.example.test",
      )
      expect(result.current.state.siteType).toBe(SITE_TYPES.NEW_API)
      expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
      expect(result.current.state.formSource).toBe(
        ACCOUNT_DIALOG_FORM_SOURCES.SPONSOR,
      )
    })
  })

  it("ignores blank auth updates after a sponsor prefill selected cookie auth", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      prefill: {
        siteUrl: "https://dev-supported.example.test",
        siteType: SITE_TYPES.NEW_API,
        authType: AuthTypeEnum.Cookie,
        source: "sponsor",
        sponsorId: "dev-supported-direct",
      },
    })

    await waitFor(() => {
      expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
    })

    await act(async () => {
      result.current.setters.setAuthType("" as AuthTypeEnum)
    })

    expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
  })

  it("ignores invalid sponsor prefill and keeps the normal add flow", async () => {
    ;(globalThis as any).browser.tabs.query = vi.fn(async () => [])

    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      prefill: {
        siteUrl: "javascript:alert(1)",
        siteType: SITE_TYPES.AIHUBMIX,
        source: "sponsor",
        sponsorId: "aihubmix",
      },
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("")
      expect(result.current.state.formSource).toBe(
        ACCOUNT_DIALOG_FORM_SOURCES.MANUAL,
      )
    })
  })

  it("preserves manual edits after sponsor prefill is applied", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      prefill: {
        siteUrl: "https://anyrouter.example.com",
        siteType: SITE_TYPES.ANYROUTER,
        source: "sponsor",
        sponsorId: "anyrouter",
      },
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://anyrouter.example.com")
    })

    await act(async () => {
      result.current.handlers.handleUrlChange("https://manual.example.com/path")
    })

    expect(result.current.state.url).toBe("https://manual.example.com")
    expect(result.current.state.formSource).toBe(
      ACCOUNT_DIALOG_FORM_SOURCES.SPONSOR,
    )
  })
})
