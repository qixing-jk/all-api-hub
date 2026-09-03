import { http, HttpResponse } from "msw"
import { type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import {
  OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
} from "~/constants/openRouterBootstrap"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accounts/accountStorage"
import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const {
  mockStartProductAnalyticsAction,
  mockCompleteProductAnalyticsAction,
  mockAutoDetectAccount,
  mockGenericAutoDetectAccount,
  mockCancelAccountAutoDetect,
  mockShowWarningToast,
  mockValidateAndSaveAccount,
  mockIsExtensionPopup,
  mockStartPopupCriticalFlow,
  mockCompletePopupCriticalFlow,
  mockLoggerWarn,
  mockWithProtectionBypassUserCommand,
} = vi.hoisted(() => ({
  mockStartProductAnalyticsAction: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
  mockAutoDetectAccount: vi.fn(),
  mockGenericAutoDetectAccount: vi.fn(),
  mockCancelAccountAutoDetect: vi.fn(),
  mockShowWarningToast: vi.fn(),
  mockValidateAndSaveAccount: vi.fn(),
  mockIsExtensionPopup: vi.fn(),
  mockStartPopupCriticalFlow: vi.fn(),
  mockCompletePopupCriticalFlow: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockWithProtectionBypassUserCommand: vi.fn(),
}))

const openRouterProtectionExecution = userCommandExecution(
  PROTECTION_BYPASS_USER_COMMANDS.AddAccount,
)

vi.mock("~/services/protectionBypass/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/protectionBypass/client")>()
  return {
    ...actual,
    withProtectionBypassUserCommand: mockWithProtectionBypassUserCommand,
  }
})

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: vi.fn(),
  }),
}))

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/actions")>()
  return {
    ...actual,
    startProductAnalyticsAction: mockStartProductAnalyticsAction,
  }
})

vi.mock("~/services/accounts/accountAutoDetection", () => ({
  autoDetectAccount: mockGenericAutoDetectAccount,
}))

vi.mock("~/services/accounts/accountPersistence", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/accounts/accountPersistence")
    >()
  return {
    ...actual,
    validateAndSaveAccount: (
      ...args: Parameters<typeof actual.validateAndSaveAccount>
    ) => {
      if (mockValidateAndSaveAccount.getMockImplementation()) {
        return mockValidateAndSaveAccount(...args)
      }

      return actual.validateAndSaveAccount(...args)
    },
  }
})

vi.mock("~/services/apiAdapters/openrouter/accountProvisioning", () => ({
  onboardOpenRouterAccount: mockAutoDetectAccount,
  cancelOpenRouterAccountProvisioning: mockCancelAccountAutoDetect,
}))

vi.mock("~/utils/core/toastHelpers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/core/toastHelpers")>()
  return { ...actual, showWarningToast: mockShowWarningToast }
})

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
  return { ...actual, isExtensionPopup: mockIsExtensionPopup }
})

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({
    openWithAccount: vi.fn(),
    openDefaultTokenQuickCreateDialogForAccount: vi.fn(),
  }),
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

describe("useAccountDialog OpenRouter behavior", () => {
  const getLatestValidateAndSaveAccountCall = () => {
    const args = mockValidateAndSaveAccount.mock.calls.at(-1)
    if (!args) throw new Error("Expected validateAndSaveAccount to be called")
    const [
      url,
      siteName,
      username,
      accessToken,
      userId,
      exchangeRate,
      notes,
      tagIds,
      checkInConfig,
      siteType,
      authType,
      cookieAuthSessionCookie,
    ] = args
    return {
      url,
      siteName,
      username,
      accessToken,
      userId,
      exchangeRate,
      notes,
      tagIds,
      checkInConfig,
      siteType,
      authType,
      cookieAuthSessionCookie,
    }
  }

  beforeEach(async () => {
    vi.restoreAllMocks()
    mockStartProductAnalyticsAction.mockReset()
    mockCompleteProductAnalyticsAction.mockReset()
    mockAutoDetectAccount.mockReset()
    mockGenericAutoDetectAccount.mockReset()
    mockCancelAccountAutoDetect.mockReset()
    mockShowWarningToast.mockReset()
    mockValidateAndSaveAccount.mockReset()
    mockIsExtensionPopup.mockReset()
    mockStartPopupCriticalFlow.mockReset()
    mockCompletePopupCriticalFlow.mockReset()
    mockLoggerWarn.mockReset()
    mockWithProtectionBypassUserCommand.mockReset()
    mockWithProtectionBypassUserCommand.mockImplementation(
      async (_command, _surface, work) => work(openRouterProtectionExecution),
    )
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
    mockCancelAccountAutoDetect.mockResolvedValue({
      requestId: "request-default",
      certainty: "unknown",
      cancellationAccepted: true,
    })
    mockIsExtensionPopup.mockReturnValue(false)
    mockStartPopupCriticalFlow.mockResolvedValue(undefined)
    mockCompletePopupCriticalFlow.mockResolvedValue(undefined)
    server.resetHandlers()
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({ data: { total_credits: 1, total_usage: 0 } }),
      ),
    )
    await accountStorage.clearAllData()
    vi.spyOn(accountStorage, "refreshAccount").mockResolvedValue({
      account: buildSiteAccount({ id: "saved-openrouter" }),
      refreshed: true,
    })
  })

  const createCompletedBootstrapResult = (params?: {
    requestId?: string
    username?: string
    userId?: string
    accessToken?: string
  }) => {
    const requestId = params?.requestId ?? "identity-request-placeholder"

    return {
      kind: "bootstrap_completed" as const,
      success: true as const,
      message: "created",
      data: {
        siteName: "OpenRouter",
        username: params?.username ?? "Example User",
        accessToken: params?.accessToken ?? "management-key-placeholder",
        userId: params?.userId ?? "user-bootstrap-placeholder",
        exchangeRate: 7.2,
        authType: AuthTypeEnum.AccessToken,
        siteType: SITE_TYPES.OPENROUTER,
        checkIn: buildCheckInConfig(),
      },
      provisioning: {
        requestId,
        label: `OpenRouter extension ${requestId}`,
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      },
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
    }
  }

  const createGenericAutoDetectResult = () => ({
    success: true as const,
    data: {
      siteName: "Example API",
      username: "Example User",
      accessToken: "example-access-token-placeholder",
      userId: "example-user-placeholder",
      exchangeRate: 7,
      siteType: SITE_TYPES.NEW_API,
      checkIn: buildCheckInConfig(),
    },
  })

  const renderOpenRouterAddHook = async () => {
    const hook = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(hook.result.current).toBeTruthy())
    await act(async () => {
      hook.result.current.setters.setSiteType(SITE_TYPES.OPENROUTER)
    })

    return hook
  }

  const renderCanonicalOpenRouterUrlHook = async () => {
    const hook = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(hook.result.current).toBeTruthy())
    expect(hook.result.current.state.siteType).toBe(SITE_TYPES.UNKNOWN)
    await act(async () => {
      hook.result.current.handlers.handleUrlChange("https://openrouter.ai")
    })

    return hook
  }

  const mockSuccessfulSave = () => {
    mockValidateAndSaveAccount.mockResolvedValueOnce({
      success: true,
      message: "Saved",
      feedbackLevel: "success",
    })
  }

  const createDeferred = <T,>() => {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise
      reject = rejectPromise
    })
    return { promise, resolve, reject }
  }

  it("binds a canonical URL bootstrap failure to the OpenRouter manual policy", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      kind: "bootstrap_failure",
      success: false,
      message: "Sign in to OpenRouter and try again",
      requestId: "canonical-logged-out-request",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.LoggedOut,
    })
    const { result } = await renderCanonicalOpenRouterUrlHook()

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(result.current.state.showManualForm).toBe(true)
    expect(result.current.state.siteType).toBe(SITE_TYPES.OPENROUTER)
    expect(result.current.state.url).toBe("https://openrouter.ai")
    expect(result.current.state.siteName).toBe("OpenRouter")
    expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
    expect(result.current.state.detectionError).toMatchObject({
      message: "Sign in to OpenRouter and try again",
    })
  })

  it("dispatches once from a canonical OpenRouter management-keys subpath", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce(
      createCompletedBootstrapResult({
        requestId: "canonical-subpath-request-placeholder",
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
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      result.current.setters.setUrl(
        "https://openrouter.ai/settings/management-keys",
      )
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(mockAutoDetectAccount).toHaveBeenCalledOnce()
    expect(mockAutoDetectAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        protectionBypassExecution: openRouterProtectionExecution,
      }),
    )
    expect(mockGenericAutoDetectAccount).not.toHaveBeenCalled()
    expect(result.current.state.url).toBe("https://openrouter.ai")
    expect(result.current.state.siteType).toBe(SITE_TYPES.OPENROUTER)
    expect(result.current.state.accessToken).toBe("management-key-placeholder")
  })

  it("keeps a created validation recovery on the OpenRouter save path", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      kind: "bootstrap_recovery",
      success: false,
      status: "recovery_required",
      mode: "bootstrap",
      reason: "post_create_validation_failed",
      requestId: "canonical-validation-recovery-request",
      message: "Review the created key",
      provisioning: {
        requestId: "canonical-validation-recovery-request",
        label: "OpenRouter extension canonical-validation-recovery-request",
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      },
      createdCredential: {
        accessToken: "canonical-recovery-secret-placeholder",
      },
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.ValidationFailed,
    })
    const { result } = await renderCanonicalOpenRouterUrlHook()

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(result.current.state.siteType).toBe(SITE_TYPES.OPENROUTER)
    expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
    expect(result.current.state.accessToken).toBe(
      "canonical-recovery-secret-placeholder",
    )
    expect(result.current.state.openRouterBootstrapRecovery).toMatchObject({
      label: "OpenRouter extension canonical-validation-recovery-request",
      requiresManualRecovery: true,
    })

    mockSuccessfulSave()
    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(getLatestValidateAndSaveAccountCall()).toMatchObject({
      siteType: SITE_TYPES.OPENROUTER,
      authType: AuthTypeEnum.AccessToken,
    })
  })

  it("fills editable bootstrap identity and saves explicit edits", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce(
      createCompletedBootstrapResult(),
    )
    const { result } = await renderOpenRouterAddHook()

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(mockAutoDetectAccount).toHaveBeenCalledOnce()
    expect(mockGenericAutoDetectAccount).not.toHaveBeenCalled()
    expect(result.current.state.username).toBe("Example User")
    expect(result.current.state.userId).toBe("user-bootstrap-placeholder")

    await act(async () => {
      result.current.setters.setUsername("Edited User")
      result.current.setters.setUserId("user-edited-placeholder")
    })
    mockSuccessfulSave()
    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(getLatestValidateAndSaveAccountCall()).toMatchObject({
      username: "Edited User",
      accessToken: "management-key-placeholder",
      userId: "user-edited-placeholder",
    })
  })

  it("saves the exact completed credential without recovery guidance", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce(
      createCompletedBootstrapResult({
        requestId: "successful-bootstrap-request-placeholder",
      }),
    )
    const { result } = await renderOpenRouterAddHook()

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(result.current.state.accessToken).toBe("management-key-placeholder")
    expect(result.current.state.openRouterBootstrapRecovery).toBeNull()

    mockSuccessfulSave()
    await act(async () => {
      await result.current.handlers.handleSaveAccount()
      await result.current.handlers.handleClose()
    })

    expect(mockShowWarningToast).not.toHaveBeenCalled()
  })

  it("does not dispatch a canonical bootstrap after duplicate confirmation changes context", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_url: "https://openrouter.ai",
        site_type: SITE_TYPES.OPENROUTER,
      }),
    )
    const { result } = await renderCanonicalOpenRouterUrlHook()

    let autoDetectPromise!: Promise<void>
    act(() => {
      autoDetectPromise = result.current.handlers.handleAutoDetect()
    })
    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning.isOpen).toBe(true)
    })

    await act(async () => {
      result.current.handlers.handleUrlChange("https://example.invalid")
      result.current.setters.setSiteType(SITE_TYPES.NEW_API)
      result.current.handlers.handleDuplicateAccountWarningContinue()
      await autoDetectPromise
    })

    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expect(result.current.state.url).toBe("https://example.invalid")
    expect(result.current.state.siteType).toBe(SITE_TYPES.NEW_API)
    expect(result.current.state.accessToken).toBe("")
    expect(mockShowWarningToast).not.toHaveBeenCalled()
  })

  it("does not dispatch a canonical bootstrap after popup setup changes context", async () => {
    const popupSetup = createDeferred<void>()
    mockIsExtensionPopup.mockReturnValue(true)
    mockStartPopupCriticalFlow.mockReturnValueOnce(popupSetup.promise)
    const { result } = await renderCanonicalOpenRouterUrlHook()

    let autoDetectPromise!: Promise<void>
    act(() => {
      autoDetectPromise = result.current.handlers.handleAutoDetect()
    })
    await waitFor(() => {
      expect(mockStartPopupCriticalFlow).toHaveBeenCalledOnce()
    })

    await act(async () => {
      result.current.handlers.handleUrlChange("https://example.invalid")
      result.current.setters.setSiteType(SITE_TYPES.NEW_API)
      popupSetup.resolve()
      await autoDetectPromise
    })

    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expect(result.current.state.url).toBe("https://example.invalid")
    expect(result.current.state.siteType).toBe(SITE_TYPES.NEW_API)
    expect(result.current.state.accessToken).toBe("")
    expect(mockShowWarningToast).not.toHaveBeenCalled()
  })

  it("does not dispatch a prepared popup bootstrap after the dialog closes", async () => {
    const popupSetup = createDeferred<void>()
    mockIsExtensionPopup.mockReturnValue(true)
    mockStartPopupCriticalFlow.mockReturnValueOnce(popupSetup.promise)
    const { result } = await renderCanonicalOpenRouterUrlHook()

    let autoDetectPromise!: Promise<void>
    act(() => {
      autoDetectPromise = result.current.handlers.handleAutoDetect()
    })
    await waitFor(() => {
      expect(mockStartPopupCriticalFlow).toHaveBeenCalledOnce()
    })

    await act(async () => {
      await result.current.handlers.handleClose()
      popupSetup.resolve()
      await autoDetectPromise
    })

    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expect(result.current.state.siteType).toBe(SITE_TYPES.UNKNOWN)
    expect(result.current.state.accessToken).toBe("")
    expect(mockShowWarningToast).not.toHaveBeenCalled()
  })

  it("admits only one real auto-detect attempt through duplicate and popup preflight", async () => {
    const duplicateLookup =
      createDeferred<
        Awaited<ReturnType<typeof accountStorage.getAllAccountsOrThrow>>
      >()
    const provisioning =
      createDeferred<ReturnType<typeof createCompletedBootstrapResult>>()
    const duplicateLookupSpy = vi
      .spyOn(accountStorage, "getAllAccountsOrThrow")
      .mockReturnValue(duplicateLookup.promise)
    mockIsExtensionPopup.mockReturnValue(true)
    mockAutoDetectAccount.mockReturnValue(provisioning.promise)
    const { result } = await renderCanonicalOpenRouterUrlHook()

    let firstAttempt!: Promise<void>
    let secondAttempt!: Promise<void>
    act(() => {
      firstAttempt = result.current.handlers.handleAutoDetect()
      secondAttempt = result.current.handlers.handleAutoDetect()
    })

    expect(duplicateLookupSpy).toHaveBeenCalledTimes(1)
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledTimes(1)
    expect(mockStartPopupCriticalFlow).not.toHaveBeenCalled()
    expect(result.current.state.isDetecting).toBe(false)

    await act(async () => {
      duplicateLookup.resolve([])
    })
    await waitFor(() => expect(mockAutoDetectAccount).toHaveBeenCalledOnce())
    expect(mockStartPopupCriticalFlow).toHaveBeenCalledOnce()
    expect(mockCompletePopupCriticalFlow).not.toHaveBeenCalled()
    expect(result.current.state.isDetecting).toBe(true)

    let thirdAttempt!: Promise<void>
    act(() => {
      thirdAttempt = result.current.handlers.handleAutoDetect()
    })
    await thirdAttempt
    expect(duplicateLookupSpy).toHaveBeenCalledTimes(1)
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledTimes(1)
    expect(mockStartPopupCriticalFlow).toHaveBeenCalledTimes(1)
    expect(mockAutoDetectAccount).toHaveBeenCalledTimes(1)
    expect(mockCompletePopupCriticalFlow).not.toHaveBeenCalled()
    expect(result.current.state.isDetecting).toBe(true)

    await act(async () => {
      provisioning.resolve(
        createCompletedBootstrapResult({
          requestId: "single-admitted-request-placeholder",
        }),
      )
      await Promise.all([firstAttempt, secondAttempt])
    })

    expect(mockAutoDetectAccount).toHaveBeenCalledTimes(1)
    expect(mockStartPopupCriticalFlow).toHaveBeenCalledTimes(1)
    expect(mockCompletePopupCriticalFlow).toHaveBeenCalledTimes(1)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledTimes(1)
    expect(result.current.state.isDetecting).toBe(false)
    expect(result.current.state.accessToken).toBe("management-key-placeholder")
  })

  it("keeps a stale OpenRouter duplicate-preflight owner ahead of an ordinary click", async () => {
    const duplicateLookup =
      createDeferred<
        Awaited<ReturnType<typeof accountStorage.getAllAccountsOrThrow>>
      >()
    const duplicateLookupSpy = vi
      .spyOn(accountStorage, "getAllAccountsOrThrow")
      .mockReturnValue(duplicateLookup.promise)
    mockGenericAutoDetectAccount.mockResolvedValue(
      createGenericAutoDetectResult(),
    )
    const { result } = await renderCanonicalOpenRouterUrlHook()

    let staleAttempt!: Promise<void>
    act(() => {
      staleAttempt = result.current.handlers.handleAutoDetect()
    })
    await waitFor(() => expect(duplicateLookupSpy).toHaveBeenCalledOnce())

    let competingAttempt!: Promise<void>
    act(() => {
      result.current.handlers.handleUrlChange("https://example.invalid")
    })
    await waitFor(() => {
      expect(result.current.state.url).toBe("https://example.invalid")
    })
    act(() => {
      competingAttempt = result.current.handlers.handleAutoDetect()
    })
    const duplicateLookupsBeforeOwnerExit = duplicateLookupSpy.mock.calls.length
    const analyticsStartsBeforeOwnerExit =
      mockStartProductAnalyticsAction.mock.calls.length

    await act(async () => {
      duplicateLookup.resolve([])
      await Promise.all([staleAttempt, competingAttempt])
    })

    expect(duplicateLookupsBeforeOwnerExit).toBe(1)
    expect(analyticsStartsBeforeOwnerExit).toBe(1)
    expect(mockStartPopupCriticalFlow).not.toHaveBeenCalled()
    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expect(mockGenericAutoDetectAccount).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })
    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expect(mockGenericAutoDetectAccount).toHaveBeenCalledOnce()
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledTimes(2)
    expect(result.current.state.accessToken).toBe(
      "example-access-token-placeholder",
    )
  })

  it("keeps an ordinary popup owner ahead of a reopened dialog click", async () => {
    const popupSetup = createDeferred<void>()
    mockIsExtensionPopup.mockReturnValue(true)
    mockStartPopupCriticalFlow
      .mockReturnValueOnce(popupSetup.promise)
      .mockResolvedValue(undefined)
    mockGenericAutoDetectAccount.mockResolvedValue(
      createGenericAutoDetectResult(),
    )
    const onClose = vi.fn()
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useAccountDialog({
          mode: DIALOG_MODES.ADD,
          isOpen,
          onClose,
          onSuccess: vi.fn(),
        }),
      { initialProps: { isOpen: true } },
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      result.current.handlers.handleUrlChange("https://example.invalid")
    })

    let staleAttempt!: Promise<void>
    act(() => {
      staleAttempt = result.current.handlers.handleAutoDetect()
    })
    await waitFor(() =>
      expect(mockStartPopupCriticalFlow).toHaveBeenCalledOnce(),
    )

    await act(async () => {
      await result.current.handlers.handleClose()
    })
    rerender({ isOpen: false })
    rerender({ isOpen: true })
    await act(async () => {
      result.current.handlers.handleUrlChange("https://example.invalid")
    })
    await waitFor(() => {
      expect(result.current.state.url).toBe("https://example.invalid")
    })
    let competingAttempt!: Promise<void>
    act(() => {
      competingAttempt = result.current.handlers.handleAutoDetect()
    })
    const analyticsStartsBeforeOwnerExit =
      mockStartProductAnalyticsAction.mock.calls.length
    const popupStartsBeforeOwnerExit =
      mockStartPopupCriticalFlow.mock.calls.length
    const providerCallsBeforeOwnerExit =
      mockGenericAutoDetectAccount.mock.calls.length
    const isDetectingBeforeOwnerExit = result.current.state.isDetecting

    await act(async () => {
      popupSetup.resolve()
      await Promise.all([staleAttempt, competingAttempt])
    })

    expect(analyticsStartsBeforeOwnerExit).toBe(1)
    expect(popupStartsBeforeOwnerExit).toBe(1)
    expect(providerCallsBeforeOwnerExit).toBe(0)
    expect(isDetectingBeforeOwnerExit).toBe(true)
    expect(mockGenericAutoDetectAccount).toHaveBeenCalledOnce()
    expect(mockCompletePopupCriticalFlow).toHaveBeenCalledOnce()

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })
    expect(mockGenericAutoDetectAccount).toHaveBeenCalledTimes(2)
    expect(mockStartPopupCriticalFlow).toHaveBeenCalledTimes(2)
    expect(mockCompletePopupCriticalFlow).toHaveBeenCalledTimes(2)
    expect(result.current.state.accessToken).toBe(
      "example-access-token-placeholder",
    )
  })

  it("keeps an invalidated OpenRouter popup owner ahead of an ordinary click", async () => {
    const popupSetup = createDeferred<void>()
    mockIsExtensionPopup.mockReturnValue(true)
    mockStartPopupCriticalFlow
      .mockReturnValueOnce(popupSetup.promise)
      .mockResolvedValue(undefined)
    mockGenericAutoDetectAccount.mockResolvedValue(
      createGenericAutoDetectResult(),
    )
    const { result } = await renderCanonicalOpenRouterUrlHook()

    let staleAttempt!: Promise<void>
    act(() => {
      staleAttempt = result.current.handlers.handleAutoDetect()
    })
    await waitFor(() =>
      expect(mockStartPopupCriticalFlow).toHaveBeenCalledOnce(),
    )

    let competingAttempt!: Promise<void>
    act(() => {
      result.current.handlers.handleUrlChange("https://example.invalid")
    })
    await waitFor(() => {
      expect(result.current.state.url).toBe("https://example.invalid")
    })
    act(() => {
      competingAttempt = result.current.handlers.handleAutoDetect()
    })
    await act(async () => {
      await competingAttempt
    })
    const popupStartsBeforeOwnerExit =
      mockStartPopupCriticalFlow.mock.calls.length
    const popupCompletionsBeforeOwnerExit =
      mockCompletePopupCriticalFlow.mock.calls.length
    const providerCallsBeforeOwnerExit =
      mockGenericAutoDetectAccount.mock.calls.length
    const isDetectingBeforeOwnerExit = result.current.state.isDetecting

    await act(async () => {
      popupSetup.resolve()
      await staleAttempt
    })

    expect(popupStartsBeforeOwnerExit).toBe(1)
    expect(popupCompletionsBeforeOwnerExit).toBe(0)
    expect(providerCallsBeforeOwnerExit).toBe(0)
    expect(isDetectingBeforeOwnerExit).toBe(true)
    expect(mockCompletePopupCriticalFlow).toHaveBeenCalledTimes(1)
    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expect(mockGenericAutoDetectAccount).not.toHaveBeenCalled()
    expect(result.current.state.isDetecting).toBe(false)

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })
    expect(mockStartPopupCriticalFlow).toHaveBeenCalledTimes(2)
    expect(mockCompletePopupCriticalFlow).toHaveBeenCalledTimes(2)
    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expect(mockGenericAutoDetectAccount).toHaveBeenCalledOnce()
    expect(result.current.state.accessToken).toBe(
      "example-access-token-placeholder",
    )
  })

  it("keeps an active ordinary owner ahead of an OpenRouter click", async () => {
    const ordinaryDetection =
      createDeferred<ReturnType<typeof createGenericAutoDetectResult>>()
    mockIsExtensionPopup.mockReturnValue(true)
    mockGenericAutoDetectAccount.mockReturnValue(ordinaryDetection.promise)
    mockAutoDetectAccount.mockResolvedValue(
      createCompletedBootstrapResult({
        requestId: "retry-after-ordinary-owner-placeholder",
      }),
    )
    const { result } = await renderCanonicalOpenRouterUrlHook()
    await act(async () => {
      result.current.handlers.handleUrlChange("https://example.invalid")
    })
    await waitFor(() => {
      expect(result.current.state.url).toBe("https://example.invalid")
    })

    let ordinaryAttempt!: Promise<void>
    act(() => {
      ordinaryAttempt = result.current.handlers.handleAutoDetect()
    })
    await waitFor(() => {
      expect(mockGenericAutoDetectAccount).toHaveBeenCalledOnce()
    })

    await act(async () => {
      result.current.handlers.handleUrlChange("https://openrouter.ai")
    })
    await waitFor(() => {
      expect(result.current.state.url).toBe("https://openrouter.ai")
    })
    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })
    const analyticsStartsBeforeOwnerExit =
      mockStartProductAnalyticsAction.mock.calls.length
    const popupStartsBeforeOwnerExit =
      mockStartPopupCriticalFlow.mock.calls.length
    const popupCompletionsBeforeOwnerExit =
      mockCompletePopupCriticalFlow.mock.calls.length
    const openRouterCallsBeforeOwnerExit =
      mockAutoDetectAccount.mock.calls.length
    const isDetectingBeforeOwnerExit = result.current.state.isDetecting

    await act(async () => {
      ordinaryDetection.resolve(createGenericAutoDetectResult())
      await ordinaryAttempt
    })

    expect(analyticsStartsBeforeOwnerExit).toBe(1)
    expect(popupStartsBeforeOwnerExit).toBe(1)
    expect(popupCompletionsBeforeOwnerExit).toBe(0)
    expect(openRouterCallsBeforeOwnerExit).toBe(0)
    expect(isDetectingBeforeOwnerExit).toBe(true)

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })
    expect(mockGenericAutoDetectAccount).toHaveBeenCalledOnce()
    expect(mockAutoDetectAccount).toHaveBeenCalledOnce()
    expect(mockStartPopupCriticalFlow).toHaveBeenCalledTimes(2)
    expect(mockCompletePopupCriticalFlow).toHaveBeenCalledTimes(2)
    expect(result.current.state.accessToken).toBe("management-key-placeholder")
  })

  it("admits one ordinary auto-detect invocation across rapid repeated clicks", async () => {
    const ordinaryDetection =
      createDeferred<ReturnType<typeof createGenericAutoDetectResult>>()
    mockIsExtensionPopup.mockReturnValue(true)
    mockGenericAutoDetectAccount.mockReturnValue(ordinaryDetection.promise)
    const { result } = await renderCanonicalOpenRouterUrlHook()
    await act(async () => {
      result.current.handlers.handleUrlChange("https://example.invalid")
    })
    await waitFor(() => {
      expect(result.current.state.url).toBe("https://example.invalid")
    })

    let firstAttempt!: Promise<void>
    let secondAttempt!: Promise<void>
    act(() => {
      firstAttempt = result.current.handlers.handleAutoDetect()
      secondAttempt = result.current.handlers.handleAutoDetect()
    })
    await waitFor(() => {
      expect(mockGenericAutoDetectAccount).toHaveBeenCalled()
    })

    let thirdAttempt!: Promise<void>
    act(() => {
      thirdAttempt = result.current.handlers.handleAutoDetect()
    })
    const analyticsStartsBeforeSettlement =
      mockStartProductAnalyticsAction.mock.calls.length

    await act(async () => {
      ordinaryDetection.resolve(createGenericAutoDetectResult())
      await Promise.all([firstAttempt, secondAttempt, thirdAttempt])
    })

    expect(analyticsStartsBeforeSettlement).toBe(1)
    expect(mockGenericAutoDetectAccount).toHaveBeenCalledOnce()
    expect(mockStartPopupCriticalFlow).toHaveBeenCalledOnce()
    expect(mockCompletePopupCriticalFlow).toHaveBeenCalledOnce()
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledOnce()
    expect(result.current.state.isDetecting).toBe(false)
  })

  it("releases the ordinary invocation lease after an empty URL", async () => {
    mockGenericAutoDetectAccount.mockResolvedValueOnce(
      createGenericAutoDetectResult(),
    )
    const hook = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(hook.result.current).toBeTruthy())

    await act(async () => {
      await hook.result.current.handlers.handleAutoDetect()
      hook.result.current.handlers.handleUrlChange("https://example.invalid")
    })
    await waitFor(() => {
      expect(hook.result.current.state.url).toBe("https://example.invalid")
    })
    await act(async () => {
      await hook.result.current.handlers.handleAutoDetect()
    })

    expect(mockStartProductAnalyticsAction).toHaveBeenCalledTimes(2)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledTimes(2)
    expect(mockGenericAutoDetectAccount).toHaveBeenCalledOnce()
  })

  it("releases the ordinary invocation lease after duplicate cancellation", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({ site_url: "https://example.invalid" }),
    )
    mockGenericAutoDetectAccount.mockResolvedValueOnce(
      createGenericAutoDetectResult(),
    )
    const hook = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(hook.result.current).toBeTruthy())
    await act(async () => {
      hook.result.current.handlers.handleUrlChange("https://example.invalid")
    })

    let cancelledAttempt!: Promise<void>
    act(() => {
      cancelledAttempt = hook.result.current.handlers.handleAutoDetect()
    })
    await waitFor(() => {
      expect(hook.result.current.state.duplicateAccountWarning.isOpen).toBe(
        true,
      )
    })
    await act(async () => {
      hook.result.current.handlers.handleDuplicateAccountWarningCancel()
      await cancelledAttempt
      await accountStorage.clearAllData()
      await hook.result.current.handlers.handleAutoDetect()
    })

    expect(mockStartProductAnalyticsAction).toHaveBeenCalledTimes(2)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledTimes(2)
    expect(mockGenericAutoDetectAccount).toHaveBeenCalledOnce()
  })

  it("releases the ordinary invocation lease after popup preflight rejects", async () => {
    mockIsExtensionPopup.mockReturnValue(true)
    mockStartPopupCriticalFlow
      .mockRejectedValueOnce(new Error("popup marker unavailable"))
      .mockResolvedValueOnce(undefined)
    mockGenericAutoDetectAccount.mockResolvedValueOnce(
      createGenericAutoDetectResult(),
    )
    const { result } = await renderCanonicalOpenRouterUrlHook()
    await act(async () => {
      result.current.handlers.handleUrlChange("https://example.invalid")
    })
    await waitFor(() => {
      expect(result.current.state.url).toBe("https://example.invalid")
    })

    await act(async () => {
      await expect(result.current.handlers.handleAutoDetect()).rejects.toThrow(
        "popup marker unavailable",
      )
    })
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledOnce()

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledTimes(2)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledTimes(2)
    expect(mockStartPopupCriticalFlow).toHaveBeenCalledTimes(2)
    expect(mockCompletePopupCriticalFlow).toHaveBeenCalledOnce()
    expect(mockGenericAutoDetectAccount).toHaveBeenCalledOnce()
    expect(result.current.state.isDetecting).toBe(false)
  })

  it("releases admission after duplicate confirmation is cancelled", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_url: "https://openrouter.ai",
        site_type: SITE_TYPES.OPENROUTER,
      }),
    )
    mockAutoDetectAccount.mockResolvedValueOnce(
      createCompletedBootstrapResult({
        requestId: "retry-after-cancel-request-placeholder",
      }),
    )
    const { result } = await renderCanonicalOpenRouterUrlHook()

    let cancelledAttempt!: Promise<void>
    act(() => {
      cancelledAttempt = result.current.handlers.handleAutoDetect()
    })
    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning.isOpen).toBe(true)
    })
    await act(async () => {
      result.current.handlers.handleDuplicateAccountWarningCancel()
      await cancelledAttempt
      await accountStorage.clearAllData()
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(mockAutoDetectAccount).toHaveBeenCalledOnce()
    expect(result.current.state.accessToken).toBe("management-key-placeholder")
  })

  it("releases admission when popup preflight fails before dispatch", async () => {
    mockIsExtensionPopup.mockReturnValue(true)
    mockStartPopupCriticalFlow
      .mockRejectedValueOnce(new Error("popup marker unavailable"))
      .mockResolvedValueOnce(undefined)
    mockAutoDetectAccount.mockResolvedValueOnce(
      createCompletedBootstrapResult({
        requestId: "retry-after-popup-failure-placeholder",
      }),
    )
    const { result } = await renderCanonicalOpenRouterUrlHook()

    await act(async () => {
      await expect(
        result.current.handlers.handleAutoDetect(),
      ).resolves.toBeUndefined()
    })
    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expect(result.current.state.isDetecting).toBe(false)

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(mockStartPopupCriticalFlow).toHaveBeenCalledTimes(2)
    expect(mockCompletePopupCriticalFlow).toHaveBeenCalledTimes(1)
    expect(mockAutoDetectAccount).toHaveBeenCalledOnce()
    expect(result.current.state.accessToken).toBe("management-key-placeholder")
  })

  it("clears identity from an earlier bootstrap when its replacement has none", async () => {
    mockAutoDetectAccount
      .mockResolvedValueOnce(
        createCompletedBootstrapResult({
          requestId: "identity-request-a",
          userId: "user-stale-placeholder",
        }),
      )
      .mockResolvedValueOnce(
        createCompletedBootstrapResult({
          requestId: "identity-request-b",
          userId: "   ",
          accessToken: "replacement-key-placeholder",
        }),
      )
    const { result } = await renderOpenRouterAddHook()

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
      await result.current.handlers.handleAutoDetect()
    })

    expect(result.current.state.accessToken).toBe("replacement-key-placeholder")
    expect(result.current.state.userId.trim()).toBe("")
    mockSuccessfulSave()
    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })
    expect(getLatestValidateAndSaveAccountCall().userId).toBe("")
  })

  it("selects the canonical URL and default name while preserving an edited name", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current?.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.OPENROUTER)
    })

    expect(result.current.state.siteType).toBe(SITE_TYPES.OPENROUTER)
    expect(result.current.state.url).toBe("https://openrouter.ai")
    expect(result.current.state.siteName).toBe("OpenRouter")

    await act(async () => {
      result.current.setters.setSiteName("Team gateway")
      result.current.setters.setSiteType(SITE_TYPES.UNKNOWN)
      result.current.setters.setSiteType(SITE_TYPES.OPENROUTER)
    })

    expect(result.current.state.siteName).toBe("Team gateway")
    expect(result.current.state.url).toBe("https://openrouter.ai")
  })

  it("normalizes cookie auth when switching to OpenRouter", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current?.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.SHAREDCHAT)
      result.current.setters.setAuthType(AuthTypeEnum.Cookie)
    })

    expect(result.current.state.siteType).toBe(SITE_TYPES.SHAREDCHAT)
    expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.OPENROUTER)
    })

    await waitFor(() => {
      expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
    })
    expect(result.current.state.url).toBe("https://openrouter.ai")
    expect(result.current.state.siteName).toBe("OpenRouter")
  })

  it("clears and restores the OpenRouter default name across site changes", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current?.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.OPENROUTER)
    })
    expect(result.current.state.siteName).toBe("OpenRouter")

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.SHAREDCHAT)
    })
    expect(result.current.state.siteName).toBe("")

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.OPENROUTER)
    })
    expect(result.current.state.siteName).toBe("OpenRouter")
  })

  it("clears OpenRouter identity metadata when switching to another site", async () => {
    const storedId = await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "OpenRouter",
        site_url: "https://openrouter.ai",
        site_type: SITE_TYPES.OPENROUTER,
        authType: AuthTypeEnum.AccessToken,
        account_info: {
          ...buildSiteAccount().account_info,
          id: "openrouter:local-identity",
          username: "",
          access_token: "management-key",
        },
      }),
    )
    const stored = await accountStorage.getAccountById(storedId)
    if (!stored) throw new Error("fixture account was not persisted")
    const displayAccount = accountStorage.convertToDisplayData(stored)

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account: displayAccount,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state.userId).toBe("openrouter:local-identity")
    })

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.NEW_API)
    })

    expect(result.current.state.siteType).toBe(SITE_TYPES.NEW_API)
    expect(result.current.state.userId).toBe("")
  })

  it("keeps an unchanged management key edit offline", async () => {
    const stored = buildSiteAccount({
      id: "openrouter-edit",
      site_name: "OpenRouter",
      site_url: "https://openrouter.ai",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: {
        ...buildSiteAccount().account_info,
        id: "",
        username: "",
        access_token: "management-key-placeholder",
      },
    })
    const storedId = await accountStorage.addAccount(stored)
    const persisted = await accountStorage.getAccountById(storedId)
    if (!persisted) throw new Error("fixture account was not persisted")
    const displayAccount = accountStorage.convertToDisplayData(persisted)

    let keyValidationRequests = 0
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/key`, () => {
        keyValidationRequests += 1
        return HttpResponse.json({ data: { is_management_key: true } })
      }),
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({ data: { total_credits: 1, total_usage: 0 } }),
      ),
    )

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account: displayAccount,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state.siteType).toBe(SITE_TYPES.OPENROUTER)
      expect(result.current.state.accessToken).toBe(
        "management-key-placeholder",
      )
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(keyValidationRequests).toBe(0)
    await expect(
      accountStorage.getAccountById(storedId),
    ).resolves.toMatchObject({
      id: storedId,
      account_info: { access_token: "management-key-placeholder" },
    })
  })

  it("skips exact duplicate confirmation for unchanged edits even with another matching record", async () => {
    const current = buildSiteAccount({
      site_name: "Current",
      site_url: "https://openrouter.ai",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: {
        ...buildSiteAccount().account_info,
        id: "",
        username: "",
        access_token: "same-management-key",
      },
    })
    const duplicate = buildSiteAccount({
      site_name: "Duplicate",
      site_url: "https://openrouter.ai",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: {
        ...buildSiteAccount().account_info,
        id: "",
        username: "",
        access_token: "same-management-key",
      },
    })
    const currentId = await accountStorage.addAccount(current)
    await accountStorage.addAccount(duplicate)
    const persisted = await accountStorage.getAccountById(currentId)
    if (!persisted) throw new Error("fixture account was not persisted")
    const displayAccount = accountStorage.convertToDisplayData(persisted)

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account: displayAccount,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state.accessToken).toBe("same-management-key")
    })
    await act(() => {
      result.current.setters.setSiteName("Renamed")
    })
    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(result.current.state.duplicateAccountWarning.isOpen).toBe(false)
    await expect(
      accountStorage.getAccountById(currentId),
    ).resolves.toMatchObject({
      site_name: "Renamed",
      account_info: { access_token: "same-management-key" },
    })
  })

  it("confirms an exact duplicate when adding an OpenRouter management key", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_type: SITE_TYPES.OPENROUTER,
        site_url: "https://openrouter.ai",
        account_info: {
          ...buildSiteAccount().account_info,
          id: "",
          username: "",
          access_token: "same-management-key",
        },
      }),
    )
    let keyValidationRequests = 0
    const onPostSaveAccountRefresh = vi.fn().mockResolvedValue(undefined)
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/key`, () => {
        keyValidationRequests += 1
        return HttpResponse.json({ data: { is_management_key: true } })
      }),
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({ data: { total_credits: 1, total_usage: 0 } }),
      ),
    )

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        onPostSaveAccountRefresh,
      }),
    )
    await waitFor(() => {
      expect(result.current).toBeTruthy()
    })
    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.OPENROUTER)
    })
    await waitFor(() => {
      expect(result.current.state.siteName).toBe("OpenRouter")
    })
    await act(async () => {
      result.current.setters.setAccessToken("same-management-key")
      result.current.setters.setExchangeRate("7")
    })

    let savePromise!: Promise<unknown>
    act(() => {
      savePromise = result.current.handlers.handleSaveAccount()
    })
    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning.isOpen).toBe(true)
    })
    expect(keyValidationRequests).toBe(0)

    await act(async () => {
      result.current.handlers.handleDuplicateAccountWarningContinue()
      await savePromise
    })

    expect(keyValidationRequests).toBe(1)
    await waitFor(() => {
      expect(onPostSaveAccountRefresh).toHaveBeenCalled()
    })
  })

  it("bypasses exact duplicate confirmation for a distinct OpenRouter management key", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_type: SITE_TYPES.OPENROUTER,
        site_url: "https://openrouter.ai",
        account_info: {
          ...buildSiteAccount().account_info,
          id: "",
          username: "",
          access_token: "existing-management-key",
        },
      }),
    )
    let keyValidationRequests = 0
    const onPostSaveAccountRefresh = vi.fn().mockResolvedValue(undefined)
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/key`, () => {
        keyValidationRequests += 1
        return HttpResponse.json({ data: { is_management_key: true } })
      }),
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({ data: { total_credits: 1, total_usage: 0 } }),
      ),
    )

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        onPostSaveAccountRefresh,
      }),
    )
    await waitFor(() => {
      expect(result.current).toBeTruthy()
    })
    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.OPENROUTER)
    })
    await waitFor(() => {
      expect(result.current.state.siteName).toBe("OpenRouter")
    })
    await act(async () => {
      result.current.setters.setAccessToken("distinct-management-key")
      result.current.setters.setExchangeRate("7")
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(result.current.state.duplicateAccountWarning.isOpen).toBe(false)
    expect(keyValidationRequests).toBe(1)
    await waitFor(() => {
      expect(onPostSaveAccountRefresh).toHaveBeenCalled()
    })
  })

  it("still closes when OpenRouter close reconciliation rejects", async () => {
    const secretSentinel = "sk-or-close-secret-sentinel"
    mockAutoDetectAccount.mockReturnValue(new Promise(() => {}))
    const onClose = vi.fn()
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose,
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      result.current.handlers.handleUrlChange("https://openrouter.ai")
    })
    act(() => {
      void result.current.handlers.handleAutoDetect()
    })
    await waitFor(() => expect(mockAutoDetectAccount).toHaveBeenCalledOnce())
    mockCancelAccountAutoDetect.mockImplementationOnce(() => {
      throw new Error(`close reconciliation unavailable: ${secretSentinel}`)
    })

    await act(async () => {
      await result.current.handlers.handleClose()
    })

    expect(onClose).toHaveBeenCalledOnce()
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "OpenRouter onboarding close handling failed",
      {
        siteType: SITE_TYPES.OPENROUTER,
        status: "reconciliation_failed",
        category: "onboarding_close",
      },
    )
    expect(
      JSON.stringify(mockLoggerWarn.mock.calls, (_key, value) =>
        value instanceof Error
          ? { message: value.message, stack: value.stack }
          : value,
      ),
    ).not.toContain(secretSentinel)
  })

  it("continues saving when exact-credential duplicate storage lookup fails", async () => {
    const secretSentinel = "sk-or-storage-secret-sentinel"
    vi.spyOn(accountStorage, "getAllAccountsOrThrow").mockRejectedValueOnce(
      new Error(`temporary storage read failure: ${secretSentinel}`),
    )
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/key`, () =>
        HttpResponse.json({ data: { is_management_key: true } }),
      ),
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({ data: { total_credits: 1, total_usage: 0 } }),
      ),
    )
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.OPENROUTER)
      result.current.setters.setAccessToken("new-management-key")
      result.current.setters.setExchangeRate("7")
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(result.current.state.duplicateAccountWarning.isOpen).toBe(false)
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "Exact-credential duplicate lookup failed; continuing without warning",
      {
        siteType: SITE_TYPES.OPENROUTER,
        status: "storage_lookup_failed",
        category: "duplicate_check",
      },
    )
    expect(
      JSON.stringify(mockLoggerWarn.mock.calls, (_key, value) =>
        value instanceof Error
          ? { message: value.message, stack: value.stack }
          : value,
      ),
    ).not.toContain(secretSentinel)
    await expect(accountStorage.getAllAccounts()).resolves.toEqual([
      expect.objectContaining({
        site_type: SITE_TYPES.OPENROUTER,
        account_info: expect.objectContaining({
          access_token: "new-management-key",
        }),
      }),
    ])
  })

  it("validates and directly saves a changed management key", async () => {
    const stored = buildSiteAccount({
      site_name: "OpenRouter",
      site_url: "https://openrouter.ai",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: {
        ...buildSiteAccount().account_info,
        id: "",
        username: "",
        access_token: "old-management-key",
      },
    })
    const storedId = await accountStorage.addAccount(stored)
    const persisted = await accountStorage.getAccountById(storedId)
    if (!persisted) throw new Error("fixture account was not persisted")
    const displayAccount = accountStorage.convertToDisplayData(persisted)
    let keyValidationRequests = 0
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/key`, () => {
        keyValidationRequests += 1
        return HttpResponse.json({ data: { is_management_key: true } })
      }),
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({ data: { total_credits: 1, total_usage: 0 } }),
      ),
    )

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account: displayAccount,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state.accessToken).toBe("old-management-key")
    })
    await act(async () => {
      result.current.setters.setAccessToken("new-management-key")
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    expect(keyValidationRequests).toBe(1)
    await expect(
      accountStorage.getAccountById(storedId),
    ).resolves.toMatchObject({
      account_info: { access_token: "new-management-key" },
    })
  })

  it("uses the generic exact-duplicate confirmation when an edited key matches", async () => {
    const current = buildSiteAccount({
      site_name: "Current",
      site_url: "https://openrouter.ai",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: {
        ...buildSiteAccount().account_info,
        id: "",
        username: "",
        access_token: "old-management-key",
      },
    })
    const duplicate = buildSiteAccount({
      site_name: "Duplicate",
      site_url: "https://openrouter.ai",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: {
        ...buildSiteAccount().account_info,
        id: "",
        username: "",
        access_token: "new-management-key",
      },
    })
    const currentId = await accountStorage.addAccount(current)
    await accountStorage.addAccount(duplicate)
    const persisted = await accountStorage.getAccountById(currentId)
    if (!persisted) throw new Error("fixture account was not persisted")
    const displayAccount = accountStorage.convertToDisplayData(persisted)

    let keyValidationRequests = 0
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/key`, () => {
        keyValidationRequests += 1
        return HttpResponse.json({ data: { is_management_key: true } })
      }),
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({ data: { total_credits: 1, total_usage: 0 } }),
      ),
    )

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account: displayAccount,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => {
      expect(result.current.state.accessToken).toBe("old-management-key")
    })
    await act(async () => {
      result.current.setters.setAccessToken("new-management-key")
    })

    let savePromise!: Promise<unknown>
    act(() => {
      savePromise = result.current.handlers.handleSaveAccount()
    })
    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning.isOpen).toBe(true)
    })
    expect(keyValidationRequests).toBe(0)

    await act(async () => {
      result.current.handlers.handleDuplicateAccountWarningContinue()
      await savePromise
    })

    expect(keyValidationRequests).toBe(1)
    await expect(
      accountStorage.getAccountById(currentId),
    ).resolves.toMatchObject({
      account_info: { access_token: "new-management-key" },
    })
  })
})
