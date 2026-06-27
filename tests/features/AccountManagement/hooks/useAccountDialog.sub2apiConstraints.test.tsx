import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession/types"
import { accountStorage } from "~/services/accounts/accountStorage"
import { AuthTypeEnum } from "~/types"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const {
  mockOpenWithAccount,
  mockOpenDefaultTokenQuickCreateDialogForAccount,
  mockResolveAccountBrowserSession,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockOpenWithAccount: vi.fn(),
  mockOpenDefaultTokenQuickCreateDialogForAccount: vi.fn(),
  mockResolveAccountBrowserSession: vi.fn(),
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
    openDefaultTokenQuickCreateDialogForAccount:
      mockOpenDefaultTokenQuickCreateDialogForAccount,
  }),
}))

vi.mock("~/services/accountBrowserSession", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/accountBrowserSession")>()

  return {
    ...actual,
    resolveAccountBrowserSession: mockResolveAccountBrowserSession,
  }
})

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: vi.fn(() => ({
    complete: vi.fn(),
  })),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getActiveTabs: vi.fn(async () => []),
    onTabActivated: vi.fn(() => () => {}),
    onTabUpdated: vi.fn(() => () => {}),
    sendRuntimeMessage: vi.fn(),
  }
})

describe("useAccountDialog Sub2API constraints", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockResolveAccountBrowserSession.mockResolvedValue(null)
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
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
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
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
      result.current.handlers.handleSub2apiUseRefreshTokenChange(true)
      result.current.setters.setSub2apiRefreshToken("refresh-token")
      result.current.setters.setSub2apiTokenExpiresAt(123456)
    })

    await waitFor(() => {
      expect(result.current.state.siteType).toBe(SITE_TYPES.SUB2API)
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
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
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
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
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

  it("imports Sub2API session data through the browser-session reader", async () => {
    mockResolveAccountBrowserSession.mockImplementationOnce(async (options) => {
      const noRefreshSession = {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
        siteType: SITE_TYPES.SUB2API,
        userId: "41",
        user: { username: "missing-refresh-user" },
        accessToken: "jwt-without-refresh",
      }
      const blankRefreshSession = {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
        siteType: SITE_TYPES.SUB2API,
        userId: "41",
        user: { username: "blank-refresh-user" },
        accessToken: "jwt-with-blank-refresh",
        sub2apiAuth: {
          refreshToken: "   ",
        },
      }
      const usableSession = {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
        siteType: SITE_TYPES.SUB2API,
        userId: "42",
        user: { username: "tab-user" },
        accessToken: "jwt-from-reader",
        sub2apiAuth: {
          refreshToken: "refresh-from-reader",
          tokenExpiresAt: 123456,
        },
      }

      expect(options.isUsableSession(noRefreshSession)).toBe(false)
      expect(options.isUsableSession(blankRefreshSession)).toBe(false)
      expect(options.isUsableSession(usableSession)).toBe(true)

      return usableSession
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
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://sub2.example.com")
      expect(result.current.state.siteType).toBe(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleImportSub2apiSession()
    })

    expect(mockResolveAccountBrowserSession).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        useExistingTabs: true,
        useTempWindow: true,
        requestIdPrefix: "account-dialog-sub2api-import",
        isUsableSession: expect.any(Function),
      }),
    )
    expect(result.current.state.sub2apiUseRefreshToken).toBe(false)
    expect(result.current.state.sub2apiRefreshToken).toBe("refresh-from-reader")
    expect(result.current.state.sub2apiTokenExpiresAt).toBe(123456)
    expect(result.current.state.accessToken).toBe("jwt-from-reader")
    expect(result.current.state.userId).toBe("42")
    expect(result.current.state.username).toBe("tab-user")
    expect(mockToastSuccess).toHaveBeenCalled()
  })

  it("shows missing-session feedback when the browser-session reader finds no usable Sub2API session", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce(null)
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
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://sub2.example.com")
      expect(result.current.state.siteType).toBe(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleImportSub2apiSession()
    })

    expect(result.current.state.sub2apiRefreshToken).toBe("")
    expect(result.current.state.accessToken).toBe("")
    expect(result.current.state.userId).toBe("")
    expect(mockToastError).toHaveBeenCalled()
  })

  it("hydrates Sub2API session fields from the browser-session reader temp-window result", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      siteType: SITE_TYPES.SUB2API,
      accessToken: "jwt-from-background",
      userId: "7",
      user: { username: "bg-user" },
      sub2apiAuth: {
        refreshToken: "refresh-from-background",
        tokenExpiresAt: 987654,
      },
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
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleImportSub2apiSession()
    })

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
    mockResolveAccountBrowserSession.mockResolvedValueOnce({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      siteType: SITE_TYPES.SUB2API,
      accessToken: "   ",
      userId: "",
      user: { username: "   " },
      sub2apiAuth: {
        refreshToken: "refresh-from-background",
        tokenExpiresAt: Number.POSITIVE_INFINITY,
      },
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
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
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
    expect(result.current.state.username).toBe("existing-user")
    expect(mockToastSuccess).toHaveBeenCalled()
  })

  it("normalizes missing stored site types when loading edit-mode accounts with Sub2API auth", async () => {
    const getAccountByIdSpy = vi
      .spyOn(accountStorage, "getAccountById")
      .mockResolvedValueOnce({
        id: "legacy-sub2api-account",
        site_name: "Stored Sub2API Account",
        site_url: "https://sub2.example.com",
        site_type: "",
        exchange_rate: 7,
        notes: "",
        tagIds: [],
        disabled: false,
        excludeFromTotalBalance: false,
        checkIn: {
          enableDetection: false,
          autoCheckInEnabled: true,
          siteStatus: { isCheckedInToday: false },
          customCheckIn: {
            url: "",
            redeemUrl: "",
            openRedeemWithCheckIn: true,
            isCheckedInToday: false,
          },
        },
        health: { status: "healthy" },
        authType: AuthTypeEnum.AccessToken,
        sub2apiAuth: {
          refreshToken: "stored-refresh-token",
          tokenExpiresAt: 654321,
        },
        account_info: {
          id: "88",
          access_token: "stored-jwt",
          username: "stored-user",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
        last_sync_time: 0,
        created_at: 0,
        updated_at: 0,
      } as any)
    const account = { id: "legacy-sub2api-account" } as any

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://sub2.example.com")
    })

    expect(result.current.state.phase).toBe("account-form")
    expect(result.current.state.formSource).toBe("existing-account")
    expect(result.current.state.siteType).toBe(SITE_TYPES.SUB2API)
    expect(result.current.state.sub2apiUseRefreshToken).toBe(true)
    expect(result.current.state.sub2apiRefreshToken).toBe(
      "stored-refresh-token",
    )
    expect(result.current.state.sub2apiTokenExpiresAt).toBe(654321)
    expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
    getAccountByIdSpy.mockRestore()
  })

  it("normalizes invalid stored site types when loading edit-mode accounts with Sub2API auth", async () => {
    const getAccountByIdSpy = vi
      .spyOn(accountStorage, "getAccountById")
      .mockResolvedValueOnce({
        id: "invalid-site-type-sub2api-account",
        site_name: "Invalid Site Type Sub2API Account",
        site_url: "https://sub2.example.com",
        site_type: "legacy-invalid-site",
        exchange_rate: 7,
        notes: "",
        tagIds: [],
        disabled: false,
        excludeFromTotalBalance: false,
        checkIn: {
          enableDetection: true,
          autoCheckInEnabled: true,
          siteStatus: { isCheckedInToday: false },
          customCheckIn: {
            url: "",
            redeemUrl: "",
            openRedeemWithCheckIn: true,
            isCheckedInToday: false,
          },
        },
        health: { status: "healthy" },
        authType: AuthTypeEnum.AccessToken,
        sub2apiAuth: {
          refreshToken: "stored-refresh-token",
          tokenExpiresAt: 654321,
        },
        account_info: {
          id: "88",
          access_token: "stored-jwt",
          username: "stored-user",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
        last_sync_time: 0,
        created_at: 0,
        updated_at: 0,
      } as any)
    const account = { id: "invalid-site-type-sub2api-account" } as any

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://sub2.example.com")
    })

    expect(result.current.state.siteType).toBe(SITE_TYPES.SUB2API)
    expect(result.current.state.sub2apiUseRefreshToken).toBe(true)
    expect(result.current.state.sub2apiRefreshToken).toBe(
      "stored-refresh-token",
    )
    expect(result.current.state.sub2apiTokenExpiresAt).toBe(654321)
    getAccountByIdSpy.mockRestore()
  })

  it("falls back to the canonical unknown site when stored site type metadata is missing", async () => {
    const getAccountByIdSpy = vi
      .spyOn(accountStorage, "getAccountById")
      .mockResolvedValueOnce({
        id: "legacy-unknown-account",
        site_name: "Stored Unknown Account",
        site_url: "https://unknown.example.com",
        site_type: "",
        exchange_rate: 7,
        notes: "",
        tagIds: [],
        disabled: false,
        excludeFromTotalBalance: false,
        checkIn: {
          enableDetection: false,
          autoCheckInEnabled: true,
          siteStatus: { isCheckedInToday: false },
          customCheckIn: {
            url: "",
            redeemUrl: "",
            openRedeemWithCheckIn: true,
            isCheckedInToday: false,
          },
        },
        health: { status: "healthy" },
        authType: AuthTypeEnum.Cookie,
        cookieAuth: {
          sessionCookie: "session=stored",
        },
        account_info: {
          id: "89",
          access_token: "",
          username: "stored-cookie-user",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
        last_sync_time: 0,
        created_at: 0,
        updated_at: 0,
      } as any)
    const account = { id: "legacy-unknown-account" } as any

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://unknown.example.com")
    })

    expect(result.current.state.siteType).toBe(SITE_TYPES.UNKNOWN)
    expect(result.current.state.sub2apiUseRefreshToken).toBe(false)
    expect(result.current.state.sub2apiRefreshToken).toBe("")
    expect(result.current.state.sub2apiTokenExpiresAt).toBeNull()
    expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
    expect(result.current.state.cookieAuthSessionCookie).toBe("session=stored")
    getAccountByIdSpy.mockRestore()
  })

  it("imports a usable Sub2API session even when the browser-session reader handles tab enumeration failures", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      siteType: SITE_TYPES.SUB2API,
      accessToken: "jwt-from-background",
      userId: "77",
      user: { username: "bg-user" },
      sub2apiAuth: {
        refreshToken: "refresh-from-background",
        tokenExpiresAt: 222333,
      },
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
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleImportSub2apiSession()
    })

    expect(result.current.state.sub2apiRefreshToken).toBe(
      "refresh-from-background",
    )
    expect(result.current.state.sub2apiTokenExpiresAt).toBe(222333)
    expect(result.current.state.accessToken).toBe("jwt-from-background")
    expect(result.current.state.userId).toBe("77")
    expect(result.current.state.username).toBe("bg-user")
    expect(mockToastSuccess).toHaveBeenCalled()
  })

  it("shows missing-session feedback when Sub2API session import cannot find a usable session and resets the loading state", async () => {
    mockResolveAccountBrowserSession.mockResolvedValueOnce(null)
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
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleImportSub2apiSession()
    })

    expect(mockToastError).toHaveBeenCalledWith(
      "accountDialog:messages.importSub2apiSessionMissing",
    )
    expect(result.current.state.isImportingSub2apiSession).toBe(false)
    expect(result.current.state.sub2apiRefreshToken).toBe("")
  })
})
