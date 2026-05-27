import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { AuthTypeEnum } from "~/types"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({
    openWithAccount: vi.fn(),
    openSub2ApiTokenCreationDialog: vi.fn(),
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: vi.fn(() => ({
    complete: vi.fn(),
  })),
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
    getActiveTabs: vi.fn(async () => []),
    getAllTabs: vi.fn(async () => []),
    onTabActivated: vi.fn(() => () => {}),
    onTabUpdated: vi.fn(() => () => {}),
    sendRuntimeMessage: vi.fn(),
  }
})

describe("useAccountDialog auth defaults", () => {
  const renderAccountDialogHook = (
    props: Parameters<typeof useAccountDialog>[0],
  ) =>
    renderHook(() => useAccountDialog(props), {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses access-token auth when a sponsor prefill omits auth type and URL has no known default", async () => {
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
      expect(result.current.state.siteType).toBe(SITE_TYPES.ANYROUTER)
      expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
    })
  })

  it("lets sponsor auth prefill override the local AnyRouter default", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      prefill: {
        siteUrl: "https://anyrouter.example.com",
        siteType: SITE_TYPES.ANYROUTER,
        authType: AuthTypeEnum.AccessToken,
        source: "sponsor",
        sponsorId: "anyrouter",
      },
    })

    await waitFor(() => {
      expect(result.current.state.siteType).toBe(SITE_TYPES.ANYROUTER)
      expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
    })
  })

  it("does not change auth when only site type changes before detection", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.ANYROUTER)
    })

    await waitFor(() => {
      expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
    })
  })

  it("does not overwrite an explicit user auth selection when site type changes", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await act(async () => {
      result.current.setters.setAuthType(AuthTypeEnum.AccessToken)
      result.current.setters.setSiteType(SITE_TYPES.ANYROUTER)
    })

    expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
  })

  it("uses Cookie auth when an AnyRouter URL is entered before site type is known", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await act(async () => {
      result.current.handlers.handleUrlChange("https://anyrouter.top/console")
    })

    expect(result.current.state.url).toBe("https://anyrouter.top")
    expect(result.current.state.siteType).toBe(SITE_TYPES.UNKNOWN)
    expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
  })

  it("does not overwrite explicit auth when an AnyRouter URL is entered", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await act(async () => {
      result.current.setters.setAuthType(AuthTypeEnum.AccessToken)
      result.current.handlers.handleUrlChange("https://anyrouter.top/console")
    })

    expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
  })
})
