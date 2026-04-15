import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accounts/accountStorage"
import { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"
import { AuthTypeEnum, SiteHealthStatus, type CheckInConfig } from "~/types"
import type { TurnstilePreTrigger } from "~/types/turnstile"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const {
  mockAutoDetectAccount,
  mockOpenWithAccount,
  mockOpenSub2ApiTokenCreationDialog,
} = vi.hoisted(() => ({
  mockAutoDetectAccount: vi.fn(),
  mockOpenWithAccount: vi.fn(),
  mockOpenSub2ApiTokenCreationDialog: vi.fn(),
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

vi.mock("~/services/accounts/accountOperations", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/accounts/accountOperations")
    >()
  return {
    ...actual,
    autoDetectAccount: mockAutoDetectAccount,
  }
})

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

describe("useAccountDialog re-detect preservation", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await accountStorage.clearAllData()
  })

  it("preserves notes and custom check-in fields when re-detecting an existing account", async () => {
    const turnstilePreTrigger: TurnstilePreTrigger = {
      kind: "clickSelector",
      selector: "#check-in",
    }

    const existingCheckIn: CheckInConfig = {
      enableDetection: true,
      autoCheckInEnabled: false,
      siteStatus: {
        isCheckedInToday: true,
        lastCheckInDate: "2026-03-05",
        lastDetectedAt: 123,
      },
      customCheckIn: {
        url: "https://checkin.example.com",
        redeemUrl: "https://redeem.example.com",
        openRedeemWithCheckIn: false,
        isCheckedInToday: true,
        lastCheckInDate: "2026-03-05",
        turnstilePreTrigger,
      },
    }

    const existingNotes = "Keep this note"

    const accountId = await accountStorage.addAccount({
      site_name: "Test",
      site_url: "https://api.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: "unknown",
      exchange_rate: 7,
      account_info: {
        id: 1,
        access_token: "token",
        username: "user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: 0,
      notes: existingNotes,
      tagIds: [],
      authType: AuthTypeEnum.AccessToken,
      checkIn: existingCheckIn,
    } as any)

    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      message: "ok",
      data: {
        username: "new-user",
        accessToken: "new-token",
        userId: "1",
        exchangeRate: 7,
        siteName: "Detected",
        siteType: "unknown",
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
        } as CheckInConfig,
      },
    })

    const account = { id: accountId } as any
    const onClose = vi.fn()
    const onSuccess = vi.fn()

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )

    await waitFor(() => {
      expect(result.current.state.notes).toBe(existingNotes)
      expect(result.current.state.checkIn.customCheckIn?.url).toBe(
        existingCheckIn.customCheckIn?.url,
      )
      expect(result.current.state.checkIn.customCheckIn?.redeemUrl).toBe(
        existingCheckIn.customCheckIn?.redeemUrl,
      )
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    await waitFor(() => {
      expect(result.current.state.isDetected).toBe(true)
    })

    expect(result.current.state.notes).toBe(existingNotes)
    expect(result.current.state.checkIn.customCheckIn?.url).toBe(
      existingCheckIn.customCheckIn?.url,
    )
    expect(result.current.state.checkIn.customCheckIn?.redeemUrl).toBe(
      existingCheckIn.customCheckIn?.redeemUrl,
    )
    expect(
      result.current.state.checkIn.customCheckIn?.openRedeemWithCheckIn,
    ).toBe(existingCheckIn.customCheckIn?.openRedeemWithCheckIn)
    expect(
      result.current.state.checkIn.customCheckIn?.turnstilePreTrigger,
    ).toEqual(turnstilePreTrigger)
    expect(result.current.state.checkIn.autoCheckInEnabled).toBe(
      existingCheckIn.autoCheckInEnabled,
    )
  })

  it("shows a slow-detect hint for long-running auto-detect requests and clears it after completion", async () => {
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
      result.current.setters.setUrl("https://slow.example.com")
    })

    vi.useFakeTimers()

    try {
      let resolveDetect!: (value: any) => void
      mockAutoDetectAccount.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDetect = resolve
        }),
      )

      let detectPromise!: Promise<void>
      await act(async () => {
        detectPromise = result.current.handlers.handleAutoDetect()
        await Promise.resolve()
      })

      expect(result.current.state.isDetecting).toBe(true)
      expect(result.current.state.isDetectingSlow).toBe(false)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })

      expect(result.current.state.isDetectingSlow).toBe(true)

      resolveDetect({
        success: true,
        message: "ok",
        data: {
          username: "detected-user",
          accessToken: "detected-token",
          userId: "1",
          exchangeRate: 7,
          siteName: "Detected Site",
          siteType: "unknown",
          checkIn: {},
        },
      })

      await act(async () => {
        await detectPromise
      })

      expect(result.current.state.isDetecting).toBe(false)
      expect(result.current.state.isDetectingSlow).toBe(false)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })

      expect(result.current.state.isDetectingSlow).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("forces detected Sub2API accounts back to JWT auth, keeps refresh-token mode opt-in, and disables built-in check-in", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      message: "ok",
      data: {
        username: "sub-user",
        accessToken: "jwt-token",
        userId: "9",
        exchangeRate: 7,
        siteName: "Detected Sub2API",
        siteType: "sub2api",
        checkIn: {
          enableDetection: true,
          autoCheckInEnabled: true,
          siteStatus: { isCheckedInToday: true },
        },
        sub2apiAuth: {
          refreshToken: "refresh-token",
          tokenExpiresAt: 123456789,
        },
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
      result.current.setters.setAuthType(AuthTypeEnum.Cookie)
      result.current.setters.setCookieAuthSessionCookie("session=abc")
      result.current.setters.setCheckIn({
        enableDetection: true,
        autoCheckInEnabled: true,
        siteStatus: { isCheckedInToday: true },
      } as any)
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://sub2.example.com")
      expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
      expect(result.current.state.cookieAuthSessionCookie).toBe("session=abc")
      expect(result.current.state.checkIn.enableDetection).toBe(true)
      expect(result.current.state.checkIn.autoCheckInEnabled).toBe(true)
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    await waitFor(() => {
      expect(result.current.state.siteType).toBe("sub2api")
      expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
      expect(result.current.state.cookieAuthSessionCookie).toBe("")
      expect(result.current.state.checkIn.enableDetection).toBe(false)
      expect(result.current.state.checkIn.autoCheckInEnabled).toBe(false)
      expect(result.current.state.sub2apiUseRefreshToken).toBe(false)
      expect(result.current.state.sub2apiRefreshToken).toBe("refresh-token")
      expect(result.current.state.sub2apiTokenExpiresAt).toBe(123456789)
    })
  })

  it("stops auto-detect when the duplicate-account warning is canceled", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "Existing",
        site_url: "https://api.example.com",
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
      result.current.handlers.handleUrlChange("https://api.example.com/users")
    })

    let detectPromise!: Promise<void>
    act(() => {
      detectPromise = result.current.handlers.handleAutoDetect()
    })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning).toMatchObject({
        isOpen: true,
        siteUrl: "https://api.example.com",
      })
    })

    await act(async () => {
      result.current.handlers.handleDuplicateAccountWarningCancel()
      await detectPromise
    })

    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expect(result.current.state.duplicateAccountWarning.isOpen).toBe(false)
    expect(result.current.state.isDetecting).toBe(false)
    expect(result.current.state.isDetected).toBe(false)
    expect(result.current.state.showManualForm).toBe(false)
  })

  it("shows the manual form with the returned detailed error when auto-detect responds unsuccessfully", async () => {
    const detailedError = {
      type: AutoDetectErrorType.UNAUTHORIZED,
      message: "Login required",
      actionText: "Log in",
      helpDocUrl: "https://docs.example.com/auto-detect",
    }

    mockAutoDetectAccount.mockResolvedValueOnce({
      success: false,
      detailedError,
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
      result.current.setters.setUrl("https://failing.example.com")
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://failing.example.com")
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(result.current.state.detectionError).toEqual(detailedError)
    expect(result.current.state.showManualForm).toBe(true)
    expect(result.current.state.isDetected).toBe(false)
    expect(result.current.state.isDetecting).toBe(false)
  })

  it("auto-imports cookie auth headers after a successful cookie-based auto-detect", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: " session=abc123 ",
    })
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      message: "ok",
      data: {
        username: "cookie-user",
        accessToken: "detected-token",
        userId: "12",
        siteName: "Detected Cookie Site",
        siteType: "new-api",
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
      result.current.setters.setUrl("https://cookie.example.com")
      result.current.setters.setAuthType(AuthTypeEnum.Cookie)
      result.current.setters.setExchangeRate("7")
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://cookie.example.com")
      expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
      expect(result.current.state.exchangeRate).toBe("7")
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://cookie.example.com",
      }),
    )
    expect(result.current.state.cookieAuthSessionCookie).toBe("session=abc123")
    expect(result.current.state.showCookiePermissionWarning).toBe(false)
    expect(result.current.state.exchangeRate).toBe("")
    expect(result.current.state.isDetected).toBe(true)
  })

  it("keeps detection successful but shows the permission warning when cookie auto-import is denied", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      errorCode: COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied,
    })
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      message: "ok",
      data: {
        username: "cookie-user",
        accessToken: "detected-token",
        userId: "18",
        siteName: "Detected Cookie Site",
        siteType: "new-api",
        exchangeRate: 7,
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
      result.current.setters.setUrl("https://cookie.example.com")
      result.current.setters.setAuthType(AuthTypeEnum.Cookie)
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://cookie.example.com")
      expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(result.current.state.isDetected).toBe(true)
    expect(result.current.state.cookieAuthSessionCookie).toBe("")
    expect(result.current.state.showCookiePermissionWarning).toBe(true)
    expect(toast.error).toHaveBeenCalledWith(
      "accountDialog:messages.importCookiesPermissionDenied",
    )
  })
})
