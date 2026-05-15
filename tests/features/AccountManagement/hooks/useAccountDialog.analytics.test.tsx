import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accounts/accountStorage"
import { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const {
  mockAutoDetectAccount,
  mockOpenWithAccount,
  mockOpenSub2ApiTokenCreationDialog,
  mockToastError,
  mockToastSuccess,
  mockStartProductAnalyticsAction,
  mockCompleteProductAnalyticsAction,
} = vi.hoisted(() => ({
  mockAutoDetectAccount: vi.fn(),
  mockOpenWithAccount: vi.fn(),
  mockOpenSub2ApiTokenCreationDialog: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockStartProductAnalyticsAction: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
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

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: mockStartProductAnalyticsAction,
}))

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
    await accountStorage.clearAllData()
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
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

  it("tracks successful account auto-detect without sensitive fields", async () => {
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

    expectStartedAction(PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
    expectNoSensitiveAnalyticsFields()
  })

  it("tracks failed account auto-detect with a safe error category", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: false,
      message: "backend leaked private host",
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
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
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
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      },
    )
    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
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
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
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
        userId: 42,
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
        userId: 42,
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
      new Error("private backend error"),
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
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
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
