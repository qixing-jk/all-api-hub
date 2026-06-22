import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_FETCH_CONTEXT_KINDS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  AUTO_DETECT_FAILURE_REASONS,
  AutoDetectErrorType,
} from "~/services/accounts/utils/autoDetectUtils"
import { POPUP_CRITICAL_FLOWS } from "~/services/popupInterruptionHint"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { AuthTypeEnum } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const {
  mockAutoDetectAccount,
  mockOpenWithAccount,
  mockOpenDefaultTokenQuickCreateDialogForAccount,
  mockToastError,
  mockToastSuccess,
  mockStartProductAnalyticsAction,
  mockCompleteProductAnalyticsAction,
  mockResolveProductAnalyticsErrorCategoryFromError,
  mockIsExtensionPopup,
  mockStartPopupCriticalFlow,
  mockCompletePopupCriticalFlow,
} = vi.hoisted(() => ({
  mockAutoDetectAccount: vi.fn(),
  mockOpenWithAccount: vi.fn(),
  mockOpenDefaultTokenQuickCreateDialogForAccount: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockStartProductAnalyticsAction: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
  mockResolveProductAnalyticsErrorCategoryFromError: vi.fn(),
  mockIsExtensionPopup: vi.fn(),
  mockStartPopupCriticalFlow: vi.fn(),
  mockCompletePopupCriticalFlow: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: mockToastSuccess,
    error: mockToastError,
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

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: mockStartProductAnalyticsAction,
  resolveProductAnalyticsErrorCategoryFromError:
    mockResolveProductAnalyticsErrorCategoryFromError,
}))

vi.mock("~/services/popupInterruptionHint", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/popupInterruptionHint")>()

  return {
    ...actual,
    startPopupCriticalFlow: mockStartPopupCriticalFlow,
    completePopupCriticalFlow: mockCompletePopupCriticalFlow,
  }
})

vi.mock("~/utils/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser")>()

  return {
    ...actual,
    isExtensionPopup: mockIsExtensionPopup,
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

describe("useAccountDialog analytics", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockAutoDetectAccount.mockReset()
    await accountStorage.clearAllData()
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
    mockResolveProductAnalyticsErrorCategoryFromError.mockReturnValue(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    )
    mockIsExtensionPopup.mockReturnValue(false)
    mockStartPopupCriticalFlow.mockResolvedValue(undefined)
    mockCompletePopupCriticalFlow.mockResolvedValue(undefined)
    ;(globalThis.browser.tabs.sendMessage as any) = vi.fn()
  })

  const renderAddHook = () =>
    renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

  const expectStartedAction = (
    actionId:
      | typeof PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect
      | typeof PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountCookies
      | typeof PRODUCT_ANALYTICS_ACTION_IDS.ImportSub2apiSession,
  ) => {
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  }

  const expectNoSensitiveAnalyticsFields = () => {
    expect(mockStartProductAnalyticsAction).not.toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.anything(),
        token: expect.anything(),
        accessToken: expect.anything(),
        cookie: expect.anything(),
        sessionCookie: expect.anything(),
        username: expect.anything(),
        error: expect.anything(),
        message: expect.anything(),
      }),
    )
    expect(mockCompleteProductAnalyticsAction).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        url: expect.anything(),
        token: expect.anything(),
        accessToken: expect.anything(),
        cookie: expect.anything(),
        sessionCookie: expect.anything(),
        username: expect.anything(),
        error: expect.anything(),
        message: expect.anything(),
      }),
    )
  }

  const setUrlAndWait = async (
    result: ReturnType<typeof renderAddHook>["result"],
    url: string,
  ) => {
    await act(async () => {
      result.current.setters.setUrl(url)
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe(url)
    })
  }

  it("tracks successful account auto-detect with safe context and without sensitive fields", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      data: {
        username: "private-user",
        accessToken: "private-token",
        userId: "123",
        exchangeRate: 7,
        siteName: "Detected Site",
        siteType: SITE_TYPES.NEW_API,
        autoDetectContext: {
          strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
          fetchContextKind: AUTO_DETECT_FETCH_CONTEXT_KINDS.CurrentTab,
          incognitoContextUsed: true,
          currentTabMatched: true,
        },
      },
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          requestedAuthMode: AuthTypeEnum.AccessToken,
          autoDetectStrategy: AUTO_DETECT_STRATEGIES.CurrentTab,
          siteType: SITE_TYPES.NEW_API,
          fetchContextKind: AUTO_DETECT_FETCH_CONTEXT_KINDS.CurrentTab,
          incognitoContextUsed: true,
          currentTabMatched: true,
        },
      },
    )
    expect(
      mockCompleteProductAnalyticsAction.mock.calls[0]?.[1]?.insights,
    ).toEqual({
      requestedAuthMode: AuthTypeEnum.AccessToken,
      autoDetectStrategy: AUTO_DETECT_STRATEGIES.CurrentTab,
      siteType: SITE_TYPES.NEW_API,
      fetchContextKind: AUTO_DETECT_FETCH_CONTEXT_KINDS.CurrentTab,
      incognitoContextUsed: true,
      currentTabMatched: true,
    })
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks popup auto-detect as a critical flow until it completes", async () => {
    mockIsExtensionPopup.mockReturnValue(true)
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      data: {
        username: "private-user",
        accessToken: "private-token",
        userId: "123",
        exchangeRate: 7,
        siteName: "Detected Site",
        siteType: SITE_TYPES.NEW_API,
      },
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(mockStartPopupCriticalFlow).toHaveBeenCalledWith(
      POPUP_CRITICAL_FLOWS.AccountAutoDetect,
    )
    expect(mockCompletePopupCriticalFlow).toHaveBeenCalledWith(
      POPUP_CRITICAL_FLOWS.AccountAutoDetect,
    )
  })

  it("does not track sidepanel or options auto-detect as a popup critical flow", async () => {
    mockIsExtensionPopup.mockReturnValue(false)
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      data: {
        username: "private-user",
        accessToken: "private-token",
        userId: "123",
        exchangeRate: 7,
        siteName: "Detected Site",
        siteType: SITE_TYPES.NEW_API,
      },
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(mockStartPopupCriticalFlow).not.toHaveBeenCalled()
    expect(mockCompletePopupCriticalFlow).not.toHaveBeenCalled()
  })

  it("tracks failed account auto-detect with safe context and a safe error category", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: false,
      message: "backend leaked private host",
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.UserDataMissing,
      autoDetectContext: {
        strategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
        siteType: SITE_TYPES.NEW_API,
        fetchContextKind: AUTO_DETECT_FETCH_CONTEXT_KINDS.BrowserContext,
        incognitoContextUsed: false,
        currentTabMatched: false,
      },
      detailedError: {
        type: AutoDetectErrorType.UNAUTHORIZED,
        message: "private backend text",
      },
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        diagnostics: {
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
            accountAutoDetectFailureReason:
              AUTO_DETECT_FAILURE_REASONS.UserDataMissing,
          },
        },
        insights: {
          accountAutoDetectFailureReason:
            AUTO_DETECT_FAILURE_REASONS.UserDataMissing,
          requestedAuthMode: AuthTypeEnum.AccessToken,
          autoDetectStrategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
          siteType: SITE_TYPES.NEW_API,
          fetchContextKind: AUTO_DETECT_FETCH_CONTEXT_KINDS.BrowserContext,
          incognitoContextUsed: false,
          currentTabMatched: false,
        },
      },
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks completion failures with the final hinted site type", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: false,
      message: "local validation failed",
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
      autoDetectContext: {
        strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
        siteType: SITE_TYPES.VELOERA,
        fetchContextKind: AUTO_DETECT_FETCH_CONTEXT_KINDS.CurrentTab,
        incognitoContextUsed: false,
        currentTabMatched: true,
      },
      detailedError: {
        type: AutoDetectErrorType.INVALID_RESPONSE,
        message: "private local detail",
      },
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        diagnostics: {
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
            accountAutoDetectFailureReason:
              AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
          },
        },
        insights: {
          accountAutoDetectFailureReason:
            AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
          requestedAuthMode: AuthTypeEnum.AccessToken,
          autoDetectStrategy: AUTO_DETECT_STRATEGIES.CurrentTab,
          siteType: SITE_TYPES.VELOERA,
          fetchContextKind: AUTO_DETECT_FETCH_CONTEXT_KINDS.CurrentTab,
          incognitoContextUsed: false,
          currentTabMatched: true,
        },
      },
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks account auto-detect token-fetch failures with a safe reason", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: false,
      message: "local token guidance",
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      detailedError: {
        type: AutoDetectErrorType.UNKNOWN,
        message: "private backend text",
      },
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        diagnostics: {
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
            accountAutoDetectFailureReason:
              AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
          },
        },
        insights: {
          requestedAuthMode: AuthTypeEnum.AccessToken,
          accountAutoDetectFailureReason:
            AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        },
      },
    )
    expectNoSensitiveAnalyticsFields()
  })

  it.each([
    [
      AutoDetectErrorType.NOT_FOUND,
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
    ],
    [
      AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED,
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
    ],
    [
      AutoDetectErrorType.SERVER_ERROR,
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
    ],
  ])(
    "tracks %s account auto-detect failures with a specific safe error category",
    async (errorType, errorCategory) => {
      mockAutoDetectAccount.mockResolvedValueOnce({
        success: false,
        message: "backend leaked private host",
        detailedError: {
          type: errorType,
          message: "private backend text",
        },
      })

      const { result } = renderAddHook()

      await waitFor(() => {
        expect(result.current.state).toBeTruthy()
      })

      await setUrlAndWait(result, "https://private.example.com")

      await act(async () => {
        await result.current.handlers.handleAutoDetect()
      })

      expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect)
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          diagnostics: {
            failure: {
              category: errorCategory,
              stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
              reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
            },
          },
          insights: {
            requestedAuthMode: AuthTypeEnum.AccessToken,
          },
        },
      )
      expectNoSensitiveAnalyticsFields()
    },
  )

  it("tracks local account auto-detect data-shape failures as validation", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: false,
      message: "local validation failed",
      detailedError: {
        type: AutoDetectErrorType.INVALID_RESPONSE,
        message: "private local detail",
      },
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        diagnostics: {
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
          },
        },
        insights: {
          requestedAuthMode: AuthTypeEnum.AccessToken,
        },
      },
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks duplicate-warning cancellation during account auto-detect as cancelled", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_url: "https://private.example.com",
      }),
    )

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://private.example.com")
    })

    let autoDetectPromise!: Promise<void>
    act(() => {
      autoDetectPromise = result.current.handlers.handleAutoDetect()
    })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning.isOpen).toBe(true)
    })

    await act(async () => {
      result.current.handlers.handleDuplicateAccountWarningCancel()
      await autoDetectPromise
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      {
        insights: {
          requestedAuthMode: AuthTypeEnum.AccessToken,
        },
      },
    )
    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks empty account auto-detect URL as skipped", async () => {
    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      {
        insights: {
          requestedAuthMode: AuthTypeEnum.AccessToken,
        },
      },
    )
    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks duplicate-check persistence errors with requested auth mode", async () => {
    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    const storageGetSpy = vi
      .spyOn(accountStorage, "getAllAccountsOrThrow")
      .mockResolvedValueOnce({
        get filter() {
          throw new Error("private duplicate check failure")
        },
      } as any)

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        diagnostics: {
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
          },
        },
        insights: {
          requestedAuthMode: AuthTypeEnum.AccessToken,
        },
      },
    )
    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expectNoSensitiveAnalyticsFields()

    storageGetSpy.mockRestore()
  })

  it("does not treat advisory duplicate-check errors as auto-detect failures", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      data: {
        username: "private-user",
        accessToken: "private-token",
        userId: "123",
        exchangeRate: 7,
        siteName: "Detected Site",
        siteType: SITE_TYPES.NEW_API,
      },
    })
    const storageGetSpy = vi
      .spyOn((accountStorage as any).storage, "get")
      .mockRejectedValueOnce(new Error("private storage failure"))

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(mockAutoDetectAccount).toHaveBeenCalled()
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          requestedAuthMode: AuthTypeEnum.AccessToken,
          siteType: SITE_TYPES.NEW_API,
        },
      },
    )
    expectNoSensitiveAnalyticsFields()

    storageGetSpy.mockRestore()
  })

  it("tracks thrown account auto-detect errors with a detection failure stage", async () => {
    mockAutoDetectAccount.mockRejectedValueOnce(
      new Error("private detect failure"),
    )

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        diagnostics: {
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
          },
        },
        insights: {
          requestedAuthMode: AuthTypeEnum.AccessToken,
        },
      },
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks thrown account auto-detect structured errors with the shared safe category", async () => {
    const structuredError = { statusCode: 429, message: "private rate limit" }
    mockAutoDetectAccount.mockRejectedValueOnce(structuredError)
    mockResolveProductAnalyticsErrorCategoryFromError.mockReturnValueOnce(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit,
    )

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(
      mockResolveProductAnalyticsErrorCategoryFromError,
    ).toHaveBeenCalledWith(structuredError)
    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        diagnostics: {
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.RateLimited,
          },
        },
        insights: {
          requestedAuthMode: AuthTypeEnum.AccessToken,
        },
      },
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks successful cookie import without sensitive fields", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: "session=private-cookie",
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountCookies)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks cookie permission denial as a permission failure", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      errorCode: COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied,
      error: "private permission message",
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountCookies)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        diagnostics: {
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Permission,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionDenied,
          },
        },
      },
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks cookie import responses without a failure code as invalid responses", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      error: "private backend message",
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountCookies)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        diagnostics: {
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Response,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape,
          },
        },
      },
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks cookie read failures with request diagnostics", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      errorCode: COOKIE_IMPORT_FAILURE_REASONS.ReadFailed,
      error: "private read failure",
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountCookies)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        diagnostics: {
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
          },
        },
      },
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks thrown cookie import errors with sanitized diagnostics", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockRejectedValueOnce(
      Object.assign(new Error("private cookie failure"), { statusCode: 403 }),
    )

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountCookies)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        diagnostics: {
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid,
          },
        },
      },
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks empty cookie imports as skipped", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      errorCode: COOKIE_IMPORT_FAILURE_REASONS.NoCookiesFound,
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await setUrlAndWait(result, "https://private.example.com")

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountCookies)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks successful Sub2API session import without sensitive fields", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: {
        accessToken: "private-jwt",
        userId: "42",
        user: { username: "private-user" },
        sub2apiAuth: {
          refreshToken: "private-refresh-token",
        },
      },
    })

    const { result } = renderAddHook()

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

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.ImportSub2apiSession)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks Sub2API import with missing session as skipped", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: {
        accessToken: "private-jwt",
        userId: "42",
        user: { username: "private-user" },
        sub2apiAuth: {
          refreshToken: " ",
        },
      },
    })

    const { result } = renderAddHook()

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

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.ImportSub2apiSession)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks Sub2API import runtime errors as failures without raw error text", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockRejectedValueOnce(
      Object.assign(new Error("private backend error"), { statusCode: 401 }),
    )

    const { result } = renderAddHook()

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

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.ImportSub2apiSession)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        diagnostics: {
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid,
          },
        },
      },
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks empty Sub2API import URL as skipped", async () => {
    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
      await result.current.handlers.handleImportSub2apiSession()
    })

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.ImportSub2apiSession)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      },
    )
    expectNoSensitiveAnalyticsFields()
  })
})
