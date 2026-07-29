import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createOpenRouterBootstrapLabel,
  OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
  OPENROUTER_BOOTSTRAP_CANCEL_TIMEOUT_MS,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
} from "~/constants/openRouterBootstrap"
import { SITE_TYPES } from "~/constants/siteType"
import { useOpenRouterAccountOnboarding } from "~/features/AccountManagement/components/AccountDialog/hooks/useOpenRouterAccountOnboarding"
import { AuthTypeEnum } from "~/types"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const {
  mockOnboardOpenRouterAccount,
  mockCancelOpenRouterAccountProvisioning,
  mockShowWarningToast,
  mockSafeRandomUUID,
  mockGetCurrentTempWindowRequestSource,
} = vi.hoisted(() => ({
  mockOnboardOpenRouterAccount: vi.fn(),
  mockCancelOpenRouterAccountProvisioning: vi.fn(),
  mockShowWarningToast: vi.fn(),
  mockSafeRandomUUID: vi.fn(),
  mockGetCurrentTempWindowRequestSource: vi.fn(),
}))

vi.mock("~/services/apiAdapters/openrouter/accountProvisioning", () => ({
  onboardOpenRouterAccount: mockOnboardOpenRouterAccount,
  cancelOpenRouterAccountProvisioning: mockCancelOpenRouterAccountProvisioning,
}))

vi.mock("~/utils/core/toastHelpers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/core/toastHelpers")>()
  return { ...actual, showWarningToast: mockShowWarningToast }
})

vi.mock("~/utils/core/identifier", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/core/identifier")>()
  return { ...actual, safeRandomUUID: mockSafeRandomUUID }
})

vi.mock("~/utils/browser/tempWindowRequestSource", () => ({
  getCurrentTempWindowRequestSource: mockGetCurrentTempWindowRequestSource,
}))

describe("useOpenRouterAccountOnboarding", () => {
  beforeEach(() => {
    mockOnboardOpenRouterAccount.mockReset()
    mockCancelOpenRouterAccountProvisioning.mockReset()
    mockShowWarningToast.mockReset()
    mockSafeRandomUUID.mockReset()
    mockGetCurrentTempWindowRequestSource.mockReset()
    mockGetCurrentTempWindowRequestSource.mockReturnValue("background")
    mockCancelOpenRouterAccountProvisioning.mockResolvedValue({
      requestId: "default-request-placeholder",
      certainty: "unknown",
      cancellationAccepted: true,
    })
  })

  const createCompletedResult = (
    requestId = "completed-request-placeholder",
    accessToken = "management-key-placeholder",
  ) => ({
    kind: "bootstrap_completed" as const,
    success: true as const,
    message: "created",
    data: {
      siteName: "OpenRouter",
      username: "Example User",
      accessToken,
      userId: "user-placeholder",
      exchangeRate: 7.2,
      authType: AuthTypeEnum.AccessToken,
      siteType: SITE_TYPES.OPENROUTER,
      checkIn: { enableDetection: false, autoCheckInEnabled: false },
    },
    provisioning: {
      requestId,
      label: `OpenRouter extension ${requestId}`,
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
    },
    attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
  })

  const createRecoveryResult = (params?: {
    requestId?: string
    mutationState?:
      | typeof OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created
      | typeof OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed
    accessToken?: string
  }) => {
    const requestId = params?.requestId ?? "recovery-request-placeholder"
    const mutationState =
      params?.mutationState ?? OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created
    const createdCredential =
      mutationState === OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created
        ? {
            createdCredential: {
              accessToken:
                params?.accessToken ?? "recovered-management-key-placeholder",
            },
          }
        : {}

    return {
      kind: "bootstrap_recovery" as const,
      success: false as const,
      status: "recovery_required" as const,
      reason:
        mutationState === OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created
          ? ("post_create_validation_failed" as const)
          : ("mutation_unconfirmed" as const),
      message: "Check the created Management Key manually",
      requestId,
      provisioning: {
        requestId,
        label: `OpenRouter extension ${requestId}`,
        mutationState,
      },
      attemptOutcome:
        mutationState === OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created
          ? OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.ValidationFailed
          : OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      ...createdCredential,
    }
  }

  const createPreDispatchFailure = (
    requestId = "pre-dispatch-request-placeholder",
  ) => ({
    kind: "bootstrap_failure" as const,
    success: false as const,
    message: "Sign in and try again",
    requestId,
    mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
    attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.LoggedOut,
  })

  const createDeferred = <T,>() => {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise
      reject = rejectPromise
    })
    return { promise, resolve, reject }
  }

  const renderController = async () => {
    const onDetected = vi.fn()
    const onManualFallback = vi.fn()
    const onCredentialCreated = vi.fn()
    const onStarted = vi.fn()
    const hook = renderHook(() => useOpenRouterAccountOnboarding())
    await waitFor(() => expect(hook.result.current).toBeTruthy())

    act(() => {
      hook.result.current.resetSession({
        url: "https://openrouter.ai",
        siteType: SITE_TYPES.UNKNOWN,
        credential: "",
      })
    })

    const start = (requestId: string) => {
      mockSafeRandomUUID.mockReturnValueOnce(requestId)
      const admission = hook.result.current.tryPrepareForStart()
      if (!admission)
        throw new Error("Expected OpenRouter onboarding admission")
      const { preparation } = admission
      return hook.result.current.startPrepared({
        preparation,
        onStarted,
        onDetected,
        onManualFallback,
        onCredentialCreated,
      })
    }

    return {
      ...hook,
      onDetected,
      onManualFallback,
      onCredentialCreated,
      onStarted,
      start,
    }
  }

  it("delivers completed detected data without exposing recovery guidance", async () => {
    mockOnboardOpenRouterAccount.mockResolvedValueOnce(createCompletedResult())
    const { result, onDetected, onManualFallback, onCredentialCreated, start } =
      await renderController()

    let outcome!: Awaited<ReturnType<typeof result.current.startPrepared>>
    await act(async () => {
      outcome = await start("completed-request-placeholder")
    })

    expect(outcome.status).toBe("completed")
    expect(onDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "management-key-placeholder",
        siteType: SITE_TYPES.OPENROUTER,
      }),
    )
    expect(onCredentialCreated).toHaveBeenCalledWith(
      "management-key-placeholder",
    )
    expect(onManualFallback).not.toHaveBeenCalled()
    expect(result.current.recovery).toBeNull()
    expect(mockSafeRandomUUID).toHaveBeenCalledWith("account-auto-detect")
    expect(mockGetCurrentTempWindowRequestSource).toHaveBeenCalledOnce()
    expect(mockOnboardOpenRouterAccount).toHaveBeenCalledWith({
      requestId: "completed-request-placeholder",
      tempWindowRequestSource: "background",
    })
  })

  it("keeps a logged-out pre-dispatch failure manual and silent", async () => {
    mockOnboardOpenRouterAccount.mockResolvedValueOnce(
      createPreDispatchFailure(),
    )
    const { result, onManualFallback, onCredentialCreated, start } =
      await renderController()

    await act(async () => {
      expect(await start("pre-dispatch-request-placeholder")).toMatchObject({
        status: "manual_fallback",
        success: false,
      })
    })

    expect(onManualFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Sign in and try again",
        showDetectionError: true,
      }),
    )
    expect(onCredentialCreated).not.toHaveBeenCalled()
    expect(result.current.recovery).toBeNull()
    expect(mockShowWarningToast).not.toHaveBeenCalled()
  })

  it("cancels a prepared start silently when its URL context changes", async () => {
    const {
      result,
      onStarted,
      onDetected,
      onManualFallback,
      onCredentialCreated,
    } = await renderController()
    const { preparation } = result.current.tryPrepareForStart()!
    act(() => {
      result.current.notifyUrlChange("https://example.invalid")
    })

    let outcome!: Awaited<ReturnType<typeof result.current.startPrepared>>
    await act(async () => {
      outcome = await result.current.startPrepared({
        preparation,
        onStarted,
        onDetected,
        onManualFallback,
        onCredentialCreated,
      })
    })

    expect(outcome).toEqual({
      status: "cancelled_before_dispatch",
      success: false,
    })
    expect(mockOnboardOpenRouterAccount).not.toHaveBeenCalled()
    expect(mockSafeRandomUUID).not.toHaveBeenCalled()
    expect(mockGetCurrentTempWindowRequestSource).not.toHaveBeenCalled()
    expect(onStarted).not.toHaveBeenCalled()
    expect(onDetected).not.toHaveBeenCalled()
    expect(onManualFallback).not.toHaveBeenCalled()
    expect(onCredentialCreated).not.toHaveBeenCalled()
    expect(mockShowWarningToast).not.toHaveBeenCalled()
  })

  it.each([
    "https://openrouter.ai/settings/management-keys",
    "https://openrouter.ai/",
    "https://openrouter.ai:443/settings/management-keys",
  ])(
    "keeps a preparation valid across canonical-equivalent URL normalization from %s",
    async (equivalentUrl) => {
      mockOnboardOpenRouterAccount.mockResolvedValueOnce(
        createPreDispatchFailure("canonical-equivalent-result-placeholder"),
      )
      const {
        result,
        onStarted,
        onDetected,
        onManualFallback,
        onCredentialCreated,
      } = await renderController()
      act(() => {
        result.current.resetSession({
          url: equivalentUrl,
          siteType: SITE_TYPES.UNKNOWN,
          credential: "",
        })
      })
      const { preparation } = result.current.tryPrepareForStart()!
      mockSafeRandomUUID.mockReturnValueOnce(
        "canonical-equivalent-request-placeholder",
      )

      let outcome!: Awaited<ReturnType<typeof result.current.startPrepared>>
      await act(async () => {
        result.current.notifyUrlChange("https://openrouter.ai")
        outcome = await result.current.startPrepared({
          preparation,
          onStarted,
          onDetected,
          onManualFallback,
          onCredentialCreated,
        })
      })

      expect(outcome.status).toBe("manual_fallback")
      expect(mockOnboardOpenRouterAccount).toHaveBeenCalledOnce()
      expect(onStarted).toHaveBeenCalledOnce()
    },
  )

  it("cancels a prepared start when the dialog closes before dispatch", async () => {
    const {
      result,
      onStarted,
      onDetected,
      onManualFallback,
      onCredentialCreated,
    } = await renderController()
    const { preparation } = result.current.tryPrepareForStart()!

    await act(async () => {
      await result.current.beforeClose()
    })
    let outcome!: Awaited<ReturnType<typeof result.current.startPrepared>>
    await act(async () => {
      outcome = await result.current.startPrepared({
        preparation,
        onStarted,
        onDetected,
        onManualFallback,
        onCredentialCreated,
      })
    })

    expect(outcome).toEqual({
      status: "cancelled_before_dispatch",
      success: false,
    })
    expect(mockSafeRandomUUID).not.toHaveBeenCalled()
    expect(mockGetCurrentTempWindowRequestSource).not.toHaveBeenCalled()
    expect(mockOnboardOpenRouterAccount).not.toHaveBeenCalled()
    expect(onStarted).not.toHaveBeenCalled()
    expect(onDetected).not.toHaveBeenCalled()
    expect(onManualFallback).not.toHaveBeenCalled()
    expect(onCredentialCreated).not.toHaveBeenCalled()
  })

  it("does not revive a closed preparation after a new session starts", async () => {
    const {
      result,
      onStarted,
      onDetected,
      onManualFallback,
      onCredentialCreated,
    } = await renderController()
    const { preparation } = result.current.tryPrepareForStart()!
    await act(async () => {
      await result.current.beforeClose()
    })
    act(() => {
      result.current.resetSession({
        url: "https://openrouter.ai",
        siteType: SITE_TYPES.UNKNOWN,
        credential: "",
      })
    })

    await act(async () => {
      expect(
        await result.current.startPrepared({
          preparation,
          onStarted,
          onDetected,
          onManualFallback,
          onCredentialCreated,
        }),
      ).toEqual({
        status: "cancelled_before_dispatch",
        success: false,
      })
    })
    expect(mockOnboardOpenRouterAccount).not.toHaveBeenCalled()
    expect(onStarted).not.toHaveBeenCalled()
  })

  it("consumes a preparation before a sequential second start", async () => {
    mockOnboardOpenRouterAccount.mockResolvedValue(
      createPreDispatchFailure("one-shot-provider-result-placeholder"),
    )
    mockSafeRandomUUID
      .mockReturnValueOnce("one-shot-first-request-placeholder")
      .mockReturnValueOnce("one-shot-second-request-placeholder")
    const {
      result,
      onStarted,
      onDetected,
      onManualFallback,
      onCredentialCreated,
    } = await renderController()
    const { preparation } = result.current.tryPrepareForStart()!
    const params = {
      preparation,
      onStarted,
      onDetected,
      onManualFallback,
      onCredentialCreated,
    }

    let first!: Awaited<ReturnType<typeof result.current.startPrepared>>
    let second!: Awaited<ReturnType<typeof result.current.startPrepared>>
    await act(async () => {
      first = await result.current.startPrepared(params)
      second = await result.current.startPrepared(params)
    })

    expect(first.status).toBe("manual_fallback")
    expect(second).toEqual({
      status: "cancelled_before_dispatch",
      success: false,
    })
    expect(mockSafeRandomUUID).toHaveBeenCalledTimes(1)
    expect(mockGetCurrentTempWindowRequestSource).toHaveBeenCalledTimes(1)
    expect(mockOnboardOpenRouterAccount).toHaveBeenCalledTimes(1)
    expect(onStarted).toHaveBeenCalledTimes(1)
  })

  it("admits one pending attempt and releases only its matching preparation", async () => {
    mockOnboardOpenRouterAccount.mockResolvedValueOnce(
      createPreDispatchFailure("replacement-result-placeholder"),
    )
    const {
      result,
      onStarted,
      onDetected,
      onManualFallback,
      onCredentialCreated,
    } = await renderController()

    const firstAdmission = result.current.tryPrepareForStart()
    expect(firstAdmission).not.toBeNull()
    expect(result.current.tryPrepareForStart()).toBeNull()

    act(() => {
      result.current.releasePreparation(firstAdmission!.preparation)
    })
    const replacementAdmission = result.current.tryPrepareForStart()
    expect(replacementAdmission).not.toBeNull()

    act(() => {
      result.current.releasePreparation(firstAdmission!.preparation)
    })
    expect(result.current.tryPrepareForStart()).toBeNull()

    await act(async () => {
      await result.current.startPrepared({
        preparation: replacementAdmission!.preparation,
        onStarted,
        onDetected,
        onManualFallback,
        onCredentialCreated,
      })
    })
    expect(mockOnboardOpenRouterAccount).toHaveBeenCalledTimes(1)
  })

  it("keeps an invalid preparation reserved until its owner consumes it", async () => {
    const {
      result,
      onStarted,
      onDetected,
      onManualFallback,
      onCredentialCreated,
    } = await renderController()
    const staleAdmission = result.current.tryPrepareForStart()!

    act(() => {
      result.current.notifyUrlChange("https://example.invalid")
      result.current.notifyUrlChange("https://openrouter.ai")
    })
    expect(result.current.tryPrepareForStart()).toBeNull()

    await act(async () => {
      await expect(
        result.current.startPrepared({
          preparation: staleAdmission.preparation,
          onStarted,
          onDetected,
          onManualFallback,
          onCredentialCreated,
        }),
      ).resolves.toEqual({
        status: "cancelled_before_dispatch",
        success: false,
      })
    })

    expect(result.current.tryPrepareForStart()).not.toBeNull()
    expect(mockOnboardOpenRouterAccount).not.toHaveBeenCalled()
  })

  it("rejects a new admission while provider work is active", async () => {
    const providerResult =
      createDeferred<ReturnType<typeof createPreDispatchFailure>>()
    mockOnboardOpenRouterAccount.mockReturnValueOnce(providerResult.promise)
    const {
      result,
      onStarted,
      onDetected,
      onManualFallback,
      onCredentialCreated,
    } = await renderController()
    const admission = result.current.tryPrepareForStart()!

    let startPromise!: ReturnType<typeof result.current.startPrepared>
    act(() => {
      startPromise = result.current.startPrepared({
        preparation: admission.preparation,
        onStarted,
        onDetected,
        onManualFallback,
        onCredentialCreated,
      })
    })

    expect(result.current.tryPrepareForStart()).toBeNull()
    providerResult.resolve(
      createPreDispatchFailure("active-result-placeholder"),
    )
    await act(async () => {
      await startPromise
    })
    expect(result.current.tryPrepareForStart()).not.toBeNull()
  })

  it("keeps an active owner reserved across a dialog session reset", async () => {
    const providerResult =
      createDeferred<ReturnType<typeof createPreDispatchFailure>>()
    mockOnboardOpenRouterAccount.mockReturnValueOnce(providerResult.promise)
    const {
      result,
      onStarted,
      onDetected,
      onManualFallback,
      onCredentialCreated,
    } = await renderController()
    const admission = result.current.tryPrepareForStart()!

    let startPromise!: ReturnType<typeof result.current.startPrepared>
    act(() => {
      startPromise = result.current.startPrepared({
        preparation: admission.preparation,
        onStarted,
        onDetected,
        onManualFallback,
        onCredentialCreated,
      })
      result.current.resetSession({
        url: "https://openrouter.ai",
        siteType: SITE_TYPES.UNKNOWN,
        credential: "",
      })
    })

    expect(result.current.tryPrepareForStart()).toBeNull()
    providerResult.resolve(createPreDispatchFailure("reset-active-placeholder"))
    await act(async () => {
      await startPromise
    })
    expect(result.current.tryPrepareForStart()).not.toBeNull()
  })

  it("releases admission when a synchronous pre-dispatch callback fails", async () => {
    const { result, onDetected, onManualFallback, onCredentialCreated } =
      await renderController()
    const admission = result.current.tryPrepareForStart()!

    await expect(
      result.current.startPrepared({
        preparation: admission.preparation,
        onStarted: () => {
          throw new Error("dialog transition failed")
        },
        onDetected,
        onManualFallback,
        onCredentialCreated,
      }),
    ).rejects.toThrow("dialog transition failed")

    expect(result.current.tryPrepareForStart()).not.toBeNull()
    expect(mockOnboardOpenRouterAccount).not.toHaveBeenCalled()
  })

  it("cancels before dispatch when the start callback changes URL context", async () => {
    const { result, onDetected, onManualFallback, onCredentialCreated } =
      await renderController()
    const admission = result.current.tryPrepareForStart()!

    await expect(
      result.current.startPrepared({
        preparation: admission.preparation,
        onStarted: () =>
          result.current.notifyUrlChange("https://example.invalid"),
        onDetected,
        onManualFallback,
        onCredentialCreated,
      }),
    ).resolves.toEqual({
      status: "cancelled_before_dispatch",
      success: false,
    })

    expect(mockOnboardOpenRouterAccount).not.toHaveBeenCalled()
  })

  it("consumes a preparation before a concurrent second start", async () => {
    const firstProviderResult =
      createDeferred<ReturnType<typeof createPreDispatchFailure>>()
    mockOnboardOpenRouterAccount
      .mockReturnValueOnce(firstProviderResult.promise)
      .mockResolvedValue(
        createPreDispatchFailure("concurrent-second-result-placeholder"),
      )
    mockSafeRandomUUID
      .mockReturnValueOnce("concurrent-first-request-placeholder")
      .mockReturnValueOnce("concurrent-second-request-placeholder")
    const {
      result,
      onStarted,
      onDetected,
      onManualFallback,
      onCredentialCreated,
    } = await renderController()
    const { preparation } = result.current.tryPrepareForStart()!
    const params = {
      preparation,
      onStarted,
      onDetected,
      onManualFallback,
      onCredentialCreated,
    }

    let firstPromise!: ReturnType<typeof result.current.startPrepared>
    let secondPromise!: ReturnType<typeof result.current.startPrepared>
    act(() => {
      firstPromise = result.current.startPrepared(params)
      secondPromise = result.current.startPrepared(params)
    })
    expect(mockOnboardOpenRouterAccount).toHaveBeenCalledTimes(1)
    firstProviderResult.resolve(
      createPreDispatchFailure("concurrent-first-result-placeholder"),
    )

    await act(async () => {
      expect(await firstPromise).toMatchObject({ status: "manual_fallback" })
      expect(await secondPromise).toEqual({
        status: "cancelled_before_dispatch",
        success: false,
      })
    })
    expect(mockSafeRandomUUID).toHaveBeenCalledTimes(1)
    expect(mockGetCurrentTempWindowRequestSource).toHaveBeenCalledTimes(1)
    expect(onStarted).toHaveBeenCalledTimes(1)
  })

  it("retains a created validation credential only for current-dialog recovery", async () => {
    mockOnboardOpenRouterAccount.mockResolvedValueOnce(createRecoveryResult())
    const { result, onManualFallback, onCredentialCreated, start } =
      await renderController()

    await act(async () => {
      await start("recovery-request-placeholder")
    })

    expect(onCredentialCreated).toHaveBeenCalledWith(
      "recovered-management-key-placeholder",
    )
    expect(onManualFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Check the created Management Key manually",
        showDetectionError: false,
      }),
    )
    expect(result.current.recovery).toEqual({
      label: "OpenRouter extension recovery-request-placeholder",
      message: "Check the created Management Key manually",
      requiresManualRecovery: true,
    })
    expect(result.current.recovery).not.toHaveProperty("createdCredential")
    expect(result.current.recovery).not.toHaveProperty("accessToken")
    expect(result.current.recovery).not.toHaveProperty("requestId")
  })

  it("keeps dispatched-unconfirmed recovery secret-free", async () => {
    mockOnboardOpenRouterAccount.mockResolvedValueOnce(
      createRecoveryResult({
        mutationState:
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      }),
    )
    const { result, onCredentialCreated, start } = await renderController()

    await act(async () => {
      await start("recovery-request-placeholder")
    })

    expect(onCredentialCreated).not.toHaveBeenCalled()
    expect(result.current.recovery).toEqual({
      label: "OpenRouter extension recovery-request-placeholder",
      message: "Check the created Management Key manually",
      requiresManualRecovery: true,
    })
  })

  it("maps an active transport rejection to manual fallback and one conservative reminder", async () => {
    mockOnboardOpenRouterAccount.mockRejectedValueOnce(
      new Error("transport failed after dispatch"),
    )
    const { onManualFallback, start } = await renderController()

    await act(async () => {
      expect(await start("transport-request-placeholder")).toMatchObject({
        status: "manual_fallback",
        success: false,
      })
    })

    expect(onManualFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: "transport failed after dispatch",
        }),
        showDetectionError: true,
      }),
    )
    expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
    expect(mockShowWarningToast).toHaveBeenCalledWith(
      expect.stringContaining(
        createOpenRouterBootstrapLabel("transport-request-placeholder"),
      ),
    )
  })

  it("ignores a transport rejection after the URL context changes", async () => {
    const deferred = createDeferred<ReturnType<typeof createCompletedResult>>()
    mockOnboardOpenRouterAccount.mockReturnValueOnce(deferred.promise)
    const { result, onManualFallback, start } = await renderController()
    let startPromise!: ReturnType<typeof start>

    act(() => {
      startPromise = start("stale-rejection-request-placeholder")
      result.current.notifyUrlChange("https://example.invalid")
    })
    await act(async () => {
      deferred.reject(new Error("late transport failure"))
      await expect(startPromise).resolves.toEqual({
        status: "ignored",
        success: false,
      })
    })

    expect(onManualFallback).not.toHaveBeenCalled()
    expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
  })

  it("isolates a completed result after the URL context changes", async () => {
    const deferred = createDeferred<ReturnType<typeof createCompletedResult>>()
    mockOnboardOpenRouterAccount.mockReturnValueOnce(deferred.promise)
    const { result, onDetected, onCredentialCreated, start } =
      await renderController()
    let startPromise!: ReturnType<typeof start>

    act(() => {
      startPromise = start("url-stale-request-placeholder")
    })
    act(() => {
      result.current.notifyUrlChange("https://example.invalid")
    })
    await act(async () => {
      deferred.resolve(createCompletedResult("url-stale-request-placeholder"))
      await startPromise
    })

    expect(onDetected).not.toHaveBeenCalled()
    expect(onCredentialCreated).not.toHaveBeenCalled()
    expect(result.current.recovery).toBeNull()
    expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
  })

  it("isolates uncertain evidence after the site context changes", async () => {
    const deferred = createDeferred<ReturnType<typeof createRecoveryResult>>()
    mockOnboardOpenRouterAccount.mockReturnValueOnce(deferred.promise)
    const { result, onManualFallback, start } = await renderController()
    let startPromise!: ReturnType<typeof start>

    act(() => {
      startPromise = start("site-stale-request-placeholder")
    })
    act(() => {
      result.current.notifySiteChange(SITE_TYPES.NEW_API)
    })
    await act(async () => {
      deferred.resolve(
        createRecoveryResult({
          requestId: "site-stale-request-placeholder",
          mutationState:
            OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
        }),
      )
      await startPromise
    })

    expect(onManualFallback).not.toHaveBeenCalled()
    expect(result.current.recovery).toBeNull()
    expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
  })

  it("isolates created recovery evidence after the site context changes", async () => {
    const deferred = createDeferred<ReturnType<typeof createRecoveryResult>>()
    mockOnboardOpenRouterAccount.mockReturnValueOnce(deferred.promise)
    const { result, onManualFallback, onCredentialCreated, start } =
      await renderController()
    let startPromise!: ReturnType<typeof start>

    act(() => {
      startPromise = start("created-stale-request-placeholder")
      result.current.notifySiteChange(SITE_TYPES.NEW_API)
    })
    await act(async () => {
      deferred.resolve(
        createRecoveryResult({
          requestId: "created-stale-request-placeholder",
          mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
        }),
      )
      await startPromise
    })

    expect(onManualFallback).not.toHaveBeenCalled()
    expect(onCredentialCreated).not.toHaveBeenCalled()
    expect(result.current.recovery).toBeNull()
    expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
  })

  it("stays silent for stale known pre-dispatch evidence", async () => {
    const deferred =
      createDeferred<ReturnType<typeof createPreDispatchFailure>>()
    mockOnboardOpenRouterAccount.mockReturnValueOnce(deferred.promise)
    const { result, onManualFallback, start } = await renderController()
    let startPromise!: ReturnType<typeof start>

    act(() => {
      startPromise = start("silent-stale-request-placeholder")
      result.current.notifyUrlChange("https://example.invalid")
    })
    await act(async () => {
      deferred.resolve(
        createPreDispatchFailure("silent-stale-request-placeholder"),
      )
      await startPromise
    })

    expect(onManualFallback).not.toHaveBeenCalled()
    expect(mockShowWarningToast).not.toHaveBeenCalled()
  })

  it("uses a created provisioning result when cancellation hangs during close", async () => {
    const deferred = createDeferred<ReturnType<typeof createCompletedResult>>()
    mockOnboardOpenRouterAccount.mockReturnValueOnce(deferred.promise)
    const { result, start } = await renderController()
    vi.useFakeTimers()
    try {
      mockCancelOpenRouterAccountProvisioning.mockReturnValueOnce(
        new Promise(() => {}),
      )
      act(() => {
        void start("close-created-request-placeholder")
      })
      let closePromise!: Promise<void>
      act(() => {
        closePromise = result.current.beforeClose()
        deferred.resolve(
          createCompletedResult("close-created-request-placeholder"),
        )
      })
      await act(async () => {
        await vi.runAllTimersAsync()
        await closePromise
      })

      expect(mockCancelOpenRouterAccountProvisioning).toHaveBeenCalledWith(
        "close-created-request-placeholder",
      )
      expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
      expect(mockShowWarningToast).toHaveBeenCalledWith(
        expect.stringContaining(
          "OpenRouter extension close-created-request-placeholder",
        ),
      )
      expect(result.current.recovery).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("closes silently when cancellation proves the mutation was not dispatched", async () => {
    const { result, start } = await renderController()
    vi.useFakeTimers()
    try {
      mockOnboardOpenRouterAccount.mockReturnValueOnce(new Promise(() => {}))
      mockCancelOpenRouterAccountProvisioning.mockResolvedValueOnce({
        requestId: "close-safe-request-placeholder",
        certainty: "known",
        cancellationAccepted: true,
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
      })
      act(() => {
        void start("close-safe-request-placeholder")
      })
      let closePromise!: Promise<void>
      act(() => {
        closePromise = result.current.beforeClose()
      })
      await act(async () => {
        await vi.runAllTimersAsync()
        await closePromise
      })

      expect(mockShowWarningToast).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("uses cancellation-created evidence when provisioning misses the close deadline", async () => {
    const { result, start } = await renderController()
    vi.useFakeTimers()
    try {
      mockOnboardOpenRouterAccount.mockReturnValueOnce(new Promise(() => {}))
      mockCancelOpenRouterAccountProvisioning.mockResolvedValueOnce({
        requestId: "close-uncertain-request-placeholder",
        certainty: "known",
        cancellationAccepted: true,
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
        label: "OpenRouter extension close-uncertain-request-placeholder",
      })
      act(() => {
        void start("close-uncertain-request-placeholder")
      })
      let closePromise!: Promise<void>
      act(() => {
        closePromise = result.current.beforeClose()
      })
      await act(async () => {
        await vi.runAllTimersAsync()
        await closePromise
      })

      expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
      expect(mockShowWarningToast).toHaveBeenCalledWith(
        expect.stringContaining(
          "OpenRouter extension close-uncertain-request-placeholder",
        ),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("uses known dispatched-unconfirmed cancellation evidence", async () => {
    const { result, start } = await renderController()
    vi.useFakeTimers()
    try {
      mockOnboardOpenRouterAccount.mockReturnValueOnce(new Promise(() => {}))
      mockCancelOpenRouterAccountProvisioning.mockResolvedValueOnce({
        requestId: "close-dispatched-request-placeholder",
        certainty: "known",
        cancellationAccepted: true,
        mutationState:
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
        label: "Recognizable dispatched placeholder",
      })
      act(() => {
        void start("close-dispatched-request-placeholder")
      })
      let closePromise!: Promise<void>
      act(() => {
        closePromise = result.current.beforeClose()
      })
      await act(async () => {
        await vi.runAllTimersAsync()
        await closePromise
      })

      expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
      expect(mockShowWarningToast).toHaveBeenCalledWith(
        expect.stringContaining("Recognizable dispatched placeholder"),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("warns conservatively when cancellation rejects before the deadline", async () => {
    const { result, start } = await renderController()
    vi.useFakeTimers()
    try {
      mockOnboardOpenRouterAccount.mockReturnValueOnce(new Promise(() => {}))
      mockCancelOpenRouterAccountProvisioning.mockRejectedValueOnce(
        new Error("cancel unavailable"),
      )
      act(() => {
        void start("close-cancel-rejected-placeholder")
      })
      let closePromise!: Promise<void>
      act(() => {
        closePromise = result.current.beforeClose()
      })
      await act(async () => {
        await vi.runAllTimersAsync()
        await closePromise
      })

      expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
      expect(mockShowWarningToast).toHaveBeenCalledWith(
        expect.stringContaining(
          createOpenRouterBootstrapLabel("close-cancel-rejected-placeholder"),
        ),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("ignores cancellation evidence that arrives after the shared close deadline", async () => {
    const { result, start } = await renderController()
    vi.useFakeTimers()
    try {
      mockOnboardOpenRouterAccount.mockReturnValueOnce(new Promise(() => {}))
      mockCancelOpenRouterAccountProvisioning.mockImplementationOnce(
        (requestId: string) =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  requestId,
                  certainty: "known",
                  cancellationAccepted: true,
                  mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
                  label: "Late cancellation label",
                }),
              OPENROUTER_BOOTSTRAP_CANCEL_TIMEOUT_MS + 1_000,
            )
          }),
      )
      act(() => {
        void start("close-late-cancel-placeholder")
      })
      let closePromise!: Promise<void>
      act(() => {
        closePromise = result.current.beforeClose()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(
          OPENROUTER_BOOTSTRAP_CANCEL_TIMEOUT_MS,
        )
        await closePromise
      })

      expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
      expect(mockShowWarningToast).toHaveBeenCalledWith(
        expect.stringContaining(
          createOpenRouterBootstrapLabel("close-late-cancel-placeholder"),
        ),
      )
      expect(mockShowWarningToast).not.toHaveBeenCalledWith(
        expect.stringContaining("Late cancellation label"),
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("releases the active run after both close settlements miss the deadline", async () => {
    const { result, start } = await renderController()
    vi.useFakeTimers()
    try {
      mockOnboardOpenRouterAccount.mockReturnValueOnce(new Promise(() => {}))
      mockCancelOpenRouterAccountProvisioning.mockReturnValueOnce(
        new Promise(() => {}),
      )
      act(() => {
        void start("close-timeout-request-placeholder")
      })

      let closePromise!: Promise<void>
      act(() => {
        closePromise = result.current.beforeClose()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(
          OPENROUTER_BOOTSTRAP_CANCEL_TIMEOUT_MS,
        )
        await closePromise
      })

      act(() => {
        result.current.resetSession({
          url: "https://openrouter.ai",
          siteType: SITE_TYPES.UNKNOWN,
          credential: "",
        })
      })
      expect(result.current.tryPrepareForStart()).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("deduplicates a context-switch, close, and late-result reminder", async () => {
    const deferred = createDeferred<ReturnType<typeof createCompletedResult>>()
    mockOnboardOpenRouterAccount.mockReturnValueOnce(deferred.promise)
    mockCancelOpenRouterAccountProvisioning.mockResolvedValueOnce({
      requestId: "dedupe-request-placeholder",
      certainty: "unknown",
      cancellationAccepted: true,
    })
    const { result, start } = await renderController()

    act(() => {
      void start("dedupe-request-placeholder")
      result.current.notifyUrlChange("https://example.invalid")
    })
    await act(async () => {
      const closePromise = result.current.beforeClose()
      deferred.resolve(createCompletedResult("dedupe-request-placeholder"))
      await closePromise
    })

    expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
  })

  it("keeps a late closed result isolated after a new dialog session starts", async () => {
    const deferred = createDeferred<ReturnType<typeof createCompletedResult>>()
    mockOnboardOpenRouterAccount.mockReturnValueOnce(deferred.promise)
    mockCancelOpenRouterAccountProvisioning.mockResolvedValueOnce({
      requestId: "old-session-request-placeholder",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
    })
    const { result, onDetected, onCredentialCreated, start } =
      await renderController()

    act(() => {
      void start("old-session-request-placeholder")
    })
    const closePromise = result.current.beforeClose()
    act(() => {
      result.current.resetSession({
        url: "https://openrouter.ai",
        siteType: SITE_TYPES.UNKNOWN,
        credential: "",
      })
    })
    await act(async () => {
      deferred.resolve(createCompletedResult("old-session-request-placeholder"))
      await closePromise
    })

    expect(onDetected).not.toHaveBeenCalled()
    expect(onCredentialCreated).not.toHaveBeenCalled()
    expect(result.current.recovery).toBeNull()
  })

  it("reminds once and drops created-secret ownership when the credential changes", async () => {
    mockOnboardOpenRouterAccount.mockResolvedValueOnce(createCompletedResult())
    const { result, start } = await renderController()
    await act(async () => {
      await start("completed-request-placeholder")
    })

    act(() => {
      result.current.notifyCredentialChange("replacement-key-placeholder")
      result.current.notifyCredentialChange("another-replacement-placeholder")
    })

    expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
    expect(result.current.recovery).toBeNull()
  })

  it("asks the dialog to clear the created credential when switching sites", async () => {
    mockOnboardOpenRouterAccount.mockResolvedValueOnce(createCompletedResult())
    const { result, start } = await renderController()
    await act(async () => {
      await start("completed-request-placeholder")
    })

    let transition!: ReturnType<typeof result.current.notifySiteChange>
    act(() => {
      transition = result.current.notifySiteChange(SITE_TYPES.NEW_API)
    })

    expect(transition).toEqual({ clearCreatedCredential: true })
    expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
  })

  it("asks the dialog to clear the created credential before re-detecting", async () => {
    mockOnboardOpenRouterAccount.mockResolvedValueOnce(createCompletedResult())
    const { result, start } = await renderController()
    await act(async () => {
      await start("completed-request-placeholder")
    })

    let admission!: NonNullable<
      ReturnType<typeof result.current.tryPrepareForStart>
    >
    act(() => {
      admission = result.current.tryPrepareForStart()!
    })

    expect(admission).toMatchObject({ clearCreatedCredential: true })
    expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
  })

  it("clears a saved identical credential without recovery guidance", async () => {
    mockOnboardOpenRouterAccount.mockResolvedValueOnce(createCompletedResult())
    const { result, start } = await renderController()
    await act(async () => {
      await start("completed-request-placeholder")
    })

    act(() => {
      result.current.confirmSavedCredential("  management-key-placeholder  ")
    })

    expect(mockShowWarningToast).not.toHaveBeenCalled()
    expect(result.current.recovery).toBeNull()
  })

  it("reminds when a different credential is saved", async () => {
    mockOnboardOpenRouterAccount.mockResolvedValueOnce(createCompletedResult())
    const { result, start } = await renderController()
    await act(async () => {
      await start("completed-request-placeholder")
    })

    act(() => {
      result.current.confirmSavedCredential("different-key-placeholder")
    })

    expect(mockShowWarningToast).toHaveBeenCalledTimes(1)
    expect(result.current.recovery).toBeNull()
  })

  it("does not carry a created secret into a reopened dialog session", async () => {
    mockOnboardOpenRouterAccount.mockResolvedValueOnce(createCompletedResult())
    const { result, start } = await renderController()
    await act(async () => {
      await start("completed-request-placeholder")
    })

    act(() => {
      result.current.resetSession({
        url: "https://openrouter.ai",
        siteType: SITE_TYPES.UNKNOWN,
        credential: "",
      })
      result.current.notifyCredentialChange("different-key-placeholder")
    })

    expect(result.current.recovery).toBeNull()
    expect(mockShowWarningToast).not.toHaveBeenCalled()
  })
})
