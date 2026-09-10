import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  ACCOUNT_DIALOG_PHASES,
  createEmptyAccountDialogDraft,
} from "~/features/AccountManagement/components/AccountDialog/models"
import { BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE } from "~/features/AccountManagement/sponsors/types"
import { AuthTypeEnum } from "~/types"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { testI18n } from "~~/tests/test-utils/i18n"
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
    openDefaultTokenQuickCreateDialogForAccount: vi.fn(),
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
    tabActivatedCallbacks.splice(0, tabActivatedCallbacks.length)
    onTabActivatedMock.mockImplementation((callback) => {
      tabActivatedCallbacks.push(callback)
      return () => {}
    })
    onTabUpdatedMock.mockImplementation(() => () => {})
  })

  it.each([DIALOG_MODES.ADD, DIALOG_MODES.EDIT])(
    "resumes %s token recovery without replacing the carried form with the active tab",
    async (mode) => {
      const account =
        mode === DIALOG_MODES.EDIT
          ? buildDisplaySiteData({
              id: "recovered-account",
              siteType: SITE_TYPES.NEW_API,
            })
          : undefined
      const recoveryState = {
        url: "https://original-site.example.com",
        ...(account ? { accountId: account.id } : {}),
        draft: {
          ...createEmptyAccountDialogDraft(SITE_TYPES.NEW_API),
          username: "retained-user",
          userId: "42",
          siteName: "My original site",
          notes: "Notes entered in the popup",
          tagIds: ["personal"],
          accessToken: "manually-entered-token",
          exchangeRate: "7.2",
        },
        checkInSelectionChanged: false,
        checkInDiscoveryBaseSelection: null,
      }
      const { result } = renderAccountDialogHook({
        mode,
        account,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        recoveryState,
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe(
          ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM,
        )
        expect(result.current.state.url).toBe(recoveryState.url)
        expect(result.current.state.draft).toEqual(recoveryState.draft)
        expect(result.current.state.detectionError?.type).toBe(
          "access_token_verification_required",
        )
      })
      expect(result.current.state.showAccessToken).toBe(false)
      expect(result.current.state.formSource).toBe(
        account
          ? ACCOUNT_DIALOG_FORM_SOURCES.EXISTING_ACCOUNT
          : ACCOUNT_DIALOG_FORM_SOURCES.MANUAL,
      )
      expect(result.current.state.tokenRecoveryState).toEqual(recoveryState)
    },
  )

  it("keeps edits made after token recovery when the language changes", async () => {
    const originalLanguage = testI18n.language
    testI18n.addResourceBundle(
      "zh-CN",
      "accountDialog",
      (await import("~/locales/zh-CN/accountDialog.json")).default,
    )
    const recoveryState = {
      url: "https://original-site.example.com",
      draft: createEmptyAccountDialogDraft(SITE_TYPES.NEW_API),
      checkInSelectionChanged: false,
      checkInDiscoveryBaseSelection: null,
    }
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      recoveryState,
    })

    act(() => {
      result.current.setters.setAccessToken("copied-access-token")
      result.current.setters.setNotes("Updated after recovery")
    })

    try {
      await act(async () => {
        await testI18n.changeLanguage("zh-CN")
      })

      expect(result.current.state.draft).toEqual({
        ...recoveryState.draft,
        accessToken: "copied-access-token",
        notes: "Updated after recovery",
      })
      expect(result.current.state.url).toBe(recoveryState.url)
      expect(result.current.state.detectionError?.message).toBe(
        testI18n.t("accountDialog:accessTokenVerification.description"),
      )
    } finally {
      await act(async () => {
        await testI18n.changeLanguage(originalLanguage)
      })
      testI18n.removeResourceBundle("zh-CN", "accountDialog")
    }
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

  it("initializes add mode from bookmark import prefill with a normalized origin", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      prefill: {
        source: BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
        siteUrl: "https://prefill.example.invalid/path?token=private",
      },
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://prefill.example.invalid")
      expect(result.current.state.siteType).toBe(SITE_TYPES.UNKNOWN)
      expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
      expect(result.current.state.formSource).toBe(
        ACCOUNT_DIALOG_FORM_SOURCES.BOOKMARK_IMPORT,
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

  it("fills omitted sponsor prefill auth type from profile defaults", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      prefill: {
        siteUrl: "https://anyrouter.top",
        siteType: SITE_TYPES.ANYROUTER,
        source: "sponsor",
        sponsorId: "anyrouter",
      },
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://anyrouter.top")
      expect(result.current.state.siteType).toBe(SITE_TYPES.ANYROUTER)
      expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
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
