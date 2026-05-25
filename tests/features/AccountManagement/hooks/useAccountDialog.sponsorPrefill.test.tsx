import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { ACCOUNT_DIALOG_FORM_SOURCES } from "~/features/AccountManagement/components/AccountDialog/models"
import { AuthTypeEnum } from "~/types"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const originalBrowser = globalThis.browser

const { mockGetActiveTabs, onTabActivatedMock, onTabUpdatedMock } = vi.hoisted(
  () => ({
    mockGetActiveTabs: vi.fn(),
    onTabActivatedMock: vi.fn(),
    onTabUpdatedMock: vi.fn(),
  }),
)

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
    onTabActivatedMock.mockImplementation(() => () => {})
    onTabUpdatedMock.mockImplementation(() => () => {})
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
