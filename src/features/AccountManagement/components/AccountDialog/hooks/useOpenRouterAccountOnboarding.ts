import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  createOpenRouterBootstrapLabel,
  OPENROUTER_BOOTSTRAP_CANCEL_TIMEOUT_MS,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
  type OpenRouterBootstrapAttemptOutcome,
} from "~/constants/openRouterBootstrap"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { AutoDetectCompletionData } from "~/services/accounts/autoDetectCompletion/types"
import {
  isCanonicalOpenRouterUrl,
  OPENROUTER_WEB_ORIGIN,
} from "~/services/accountSiteDefinitions/identifiers"
import {
  cancelOpenRouterAccountProvisioning,
  onboardOpenRouterAccount,
} from "~/services/apiAdapters/openrouter/accountProvisioning"
import type { TempWindowOpenRouterManagementKeyCancelResult } from "~/services/apiAdapters/openrouter/managementKeyPageContract"
import type {
  OpenRouterAccountOnboardingResult,
  OpenRouterProvisioningMetadata,
} from "~/services/apiAdapters/openrouter/types"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { safeRandomUUID } from "~/utils/core/identifier"
import { showWarningToast } from "~/utils/core/toastHelpers"

type DeadlineSettlement<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected" }
  | { status: "timed_out" }

type OpenRouterRecoveryState = {
  provisioning: OpenRouterProvisioningMetadata
  createdAccessToken?: string
  requiresManualRecovery: boolean
  message?: string
}

type OpenRouterContext = {
  url: string
  siteType: AccountSiteType
  credential: string
}

type ActiveOnboarding = {
  requestId: string
  promise: Promise<OpenRouterAccountOnboardingResult>
  contextVersion: number
  sessionId: number
}

type OpenRouterOnboardingPreparation = {
  id: number
  contextVersion: number
  sessionId: number
}

type OpenRouterOnboardingReservation = {
  preparation: OpenRouterOnboardingPreparation
  phase: "prepared" | "starting"
  valid: boolean
}

type OpenRouterOnboardingRecoveryPresentation = {
  label?: string
  message?: string
  requiresManualRecovery: boolean
}

type OpenRouterOnboardingRunResult = {
  status:
    | "completed"
    | "manual_fallback"
    | "cancelled_before_dispatch"
    | "ignored"
  success: boolean
  attemptOutcome?: OpenRouterBootstrapAttemptOutcome
  siteType?: AccountSiteType
}

type OpenRouterOnboardingStartParams = {
  preparation: OpenRouterOnboardingPreparation
  onStarted: () => void
  onDetected: (data: AutoDetectCompletionData) => void | Promise<void>
  onManualFallback: (failure: {
    message?: string
    error?: unknown
    showDetectionError: boolean
  }) => void
  onCredentialCreated: (credential: string) => void
}

const hasSameNormalizedCredential = (left: string, right: string) =>
  left.trim() === right.trim()

const createUrlContextKey = (value: string) => {
  const normalized = value.trim()
  return isCanonicalOpenRouterUrl(normalized)
    ? OPENROUTER_WEB_ORIGIN
    : normalized
}

/** Waits only within the remaining portion of one caller-owned deadline. */
async function settleWithinDeadline<T>(
  promise: Promise<T>,
  deadline: number,
): Promise<DeadlineSettlement<T>> {
  const remainingMs = Math.max(0, deadline - Date.now())
  if (remainingMs === 0) return { status: "timed_out" }

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise.then<DeadlineSettlement<T>, DeadlineSettlement<T>>(
        (value) => ({ status: "fulfilled", value }),
        () => ({ status: "rejected" }),
      ),
      new Promise<DeadlineSettlement<T>>((resolve) => {
        timeoutId = setTimeout(
          () => resolve({ status: "timed_out" }),
          remainingMs,
        )
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

const createRecoveryFromResult = (
  result: OpenRouterAccountOnboardingResult,
): OpenRouterRecoveryState | null => {
  if (result.kind === "bootstrap_completed") {
    return {
      provisioning: result.provisioning,
      createdAccessToken: result.data.accessToken,
      requiresManualRecovery: false,
    }
  }

  if (result.kind !== "bootstrap_recovery") return null

  const createdAccessToken =
    result.provisioning.mutationState ===
      OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created &&
    "createdCredential" in result
      ? result.createdCredential.accessToken
      : undefined
  return {
    provisioning: result.provisioning,
    ...(createdAccessToken ? { createdAccessToken } : {}),
    requiresManualRecovery: true,
    message: result.message,
  }
}

const createRecoveryFromCancellation = (
  result: TempWindowOpenRouterManagementKeyCancelResult,
): OpenRouterRecoveryState | null => {
  if (
    result.certainty !== "known" ||
    result.mutationState === OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched
  ) {
    return null
  }

  return {
    provisioning: {
      requestId: result.requestId,
      mutationState: result.mutationState,
      label: result.label ?? createOpenRouterBootstrapLabel(result.requestId),
    },
    requiresManualRecovery: true,
  }
}

const getStaleReminderLabel = (
  result: OpenRouterAccountOnboardingResult,
): string | null => {
  if (result.kind === "bootstrap_completed") {
    return result.provisioning.label ?? null
  }
  if (
    result.kind === "bootstrap_recovery" &&
    (result.provisioning.mutationState ===
      OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed ||
      result.provisioning.mutationState ===
        OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created)
  ) {
    return result.provisioning.label ?? null
  }
  return null
}

const toPresentation = (
  recovery: OpenRouterRecoveryState | null,
): OpenRouterOnboardingRecoveryPresentation | null => {
  if (!recovery?.requiresManualRecovery) return null
  return {
    ...(recovery.provisioning.label
      ? { label: recovery.provisioning.label }
      : {}),
    ...(recovery.message ? { message: recovery.message } : {}),
    requiresManualRecovery: true,
  }
}

/** Owns the OpenRouter-only dialog onboarding lifecycle and one-time secret. */
export function useOpenRouterAccountOnboarding() {
  const { t } = useTranslation("accountDialog")
  const [recovery, setRecovery] =
    useState<OpenRouterOnboardingRecoveryPresentation | null>(null)
  const recoveryRef = useRef<OpenRouterRecoveryState | null>(null)
  const shownRequestIdsRef = useRef(new Set<string>())
  const closedRequestIdsRef = useRef(new Set<string>())
  const activeRef = useRef<ActiveOnboarding | null>(null)
  const closeRequestedRef = useRef(false)
  const sessionIdRef = useRef(0)
  const contextVersionRef = useRef(0)
  const preparationIdRef = useRef(0)
  const reservationRef = useRef<OpenRouterOnboardingReservation | null>(null)
  const contextRef = useRef<OpenRouterContext>({
    url: "",
    siteType: SITE_TYPES.UNKNOWN,
    credential: "",
  })

  const invalidatePreparation = useCallback(() => {
    if (reservationRef.current) {
      reservationRef.current.valid = false
    }
  }, [])

  const releasePreparation = useCallback(
    (preparation: OpenRouterOnboardingPreparation) => {
      if (reservationRef.current?.preparation.id === preparation.id) {
        reservationRef.current = null
      }
    },
    [],
  )

  const consumePreparation = useCallback(
    (preparation: OpenRouterOnboardingPreparation) => {
      const reservation = reservationRef.current
      if (
        reservation?.preparation.id !== preparation.id ||
        reservation.phase !== "prepared"
      ) {
        return false
      }

      reservation.phase = "starting"
      if (
        !reservation.valid ||
        contextVersionRef.current !== preparation.contextVersion ||
        sessionIdRef.current !== preparation.sessionId ||
        !isCanonicalOpenRouterUrl(contextRef.current.url)
      ) {
        reservationRef.current = null
        return false
      }
      return true
    },
    [],
  )

  const setRecoveryState = useCallback(
    (next: OpenRouterRecoveryState | null) => {
      recoveryRef.current = next
      setRecovery(toPresentation(next))
    },
    [],
  )

  const showRecoveryWarningOnce = useCallback(
    (requestId: string, label?: string) => {
      if (shownRequestIdsRef.current.has(requestId)) return
      shownRequestIdsRef.current.add(requestId)
      const parts = [t("openrouterBootstrapRecovery.manualReview")]
      if (label) {
        const translatedLabel = t("openrouterBootstrapRecovery.label", {
          label,
        })
        parts.push(
          translatedLabel.includes(label)
            ? translatedLabel
            : `${translatedLabel}: ${label}`,
        )
      }
      parts.push(t("openrouterBootstrapRecovery.manualRevocation"))
      showWarningToast(parts.join(" "))
    },
    [t],
  )

  const consumeRecoveryReminder = useCallback(
    (candidate: OpenRouterRecoveryState | null) => {
      if (!candidate) return
      const { mutationState, requestId, label } = candidate.provisioning
      if (
        mutationState !==
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed &&
        mutationState !== OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created
      ) {
        return
      }
      if (!candidate.requiresManualRecovery && !candidate.createdAccessToken) {
        return
      }
      showRecoveryWarningOnce(requestId, label)
    },
    [showRecoveryWarningOnce],
  )

  const abandonRecovery = useCallback(() => {
    const current = recoveryRef.current
    const clearCreatedCredential = Boolean(
      current?.createdAccessToken &&
        hasSameNormalizedCredential(
          contextRef.current.credential,
          current.createdAccessToken,
        ),
    )
    consumeRecoveryReminder(current)
    setRecoveryState(null)
    if (clearCreatedCredential) contextRef.current.credential = ""
    return { clearCreatedCredential }
  }, [consumeRecoveryReminder, setRecoveryState])

  const resetSession = useCallback(
    (context: OpenRouterContext) => {
      invalidatePreparation()
      sessionIdRef.current += 1
      contextVersionRef.current += 1
      contextRef.current = {
        ...context,
        url: createUrlContextKey(context.url),
      }
      closeRequestedRef.current = false
      shownRequestIdsRef.current.clear()
      setRecoveryState(null)
    },
    [invalidatePreparation, setRecoveryState],
  )

  const notifyUrlChange = useCallback(
    (url: string) => {
      const nextUrlContextKey = createUrlContextKey(url)
      if (contextRef.current.url !== nextUrlContextKey) {
        invalidatePreparation()
        contextVersionRef.current += 1
      }
      contextRef.current.url = nextUrlContextKey
    },
    [invalidatePreparation],
  )

  const notifySiteChange = useCallback(
    (siteType: AccountSiteType) => {
      const previousSiteType = contextRef.current.siteType
      if (previousSiteType !== siteType) {
        invalidatePreparation()
        contextVersionRef.current += 1
      }
      contextRef.current.siteType = siteType
      if (
        previousSiteType === SITE_TYPES.OPENROUTER &&
        siteType !== SITE_TYPES.OPENROUTER
      ) {
        return abandonRecovery()
      }
      return { clearCreatedCredential: false }
    },
    [abandonRecovery, invalidatePreparation],
  )

  const notifyCredentialChange = useCallback(
    (credential: string) => {
      if (contextRef.current.credential !== credential) {
        invalidatePreparation()
        contextVersionRef.current += 1
      }
      const current = recoveryRef.current
      if (
        current?.createdAccessToken &&
        !hasSameNormalizedCredential(credential, current.createdAccessToken)
      ) {
        consumeRecoveryReminder(current)
        setRecoveryState(null)
      }
      contextRef.current.credential = credential
    },
    [consumeRecoveryReminder, invalidatePreparation, setRecoveryState],
  )

  const tryPrepareForStart = useCallback(() => {
    if (reservationRef.current || activeRef.current) return null

    const recoveryTransition = abandonRecovery()
    const preparation = {
      id: ++preparationIdRef.current,
      contextVersion: contextVersionRef.current,
      sessionId: sessionIdRef.current,
    }
    reservationRef.current = { preparation, phase: "prepared", valid: true }
    return { ...recoveryTransition, preparation }
  }, [abandonRecovery])

  const abandonForOtherAutoDetect = useCallback(
    () => abandonRecovery(),
    [abandonRecovery],
  )

  const confirmSavedCredential = useCallback(
    (credential: string) => {
      const current = recoveryRef.current
      if (
        current &&
        (!current.createdAccessToken ||
          !hasSameNormalizedCredential(credential, current.createdAccessToken))
      ) {
        consumeRecoveryReminder(current)
      }
      setRecoveryState(null)
      contextRef.current.credential = credential
    },
    [consumeRecoveryReminder, setRecoveryState],
  )

  const startPrepared = useCallback(
    async ({
      preparation,
      onStarted,
      onDetected,
      onManualFallback,
      onCredentialCreated,
    }: OpenRouterOnboardingStartParams): Promise<OpenRouterOnboardingRunResult> => {
      const isPreparedContextCurrent = () =>
        contextVersionRef.current === preparation.contextVersion &&
        sessionIdRef.current === preparation.sessionId &&
        isCanonicalOpenRouterUrl(contextRef.current.url)

      // Consume synchronously before callbacks, ID generation, or provider work
      // so concurrent calls cannot dispatch the same preparation twice.
      if (!consumePreparation(preparation)) {
        return { status: "cancelled_before_dispatch", success: false }
      }

      let requestId: string
      let promise: Promise<OpenRouterAccountOnboardingResult>
      let contextVersion: number
      let sessionId: number
      try {
        // Adopt the intended site before the synchronous dialog callback so its
        // corresponding notification does not invalidate this preparation.
        contextRef.current.siteType = SITE_TYPES.OPENROUTER
        onStarted()
        if (!isPreparedContextCurrent()) {
          releasePreparation(preparation)
          return { status: "cancelled_before_dispatch", success: false }
        }

        requestId = safeRandomUUID("account-auto-detect")
        const tempWindowRequestSource = getCurrentTempWindowRequestSource()
        contextVersion = contextVersionRef.current
        sessionId = sessionIdRef.current
        closeRequestedRef.current = false
        promise = onboardOpenRouterAccount({
          requestId,
          tempWindowRequestSource,
        })
        activeRef.current = { requestId, promise, contextVersion, sessionId }
        releasePreparation(preparation)
      } catch (error) {
        releasePreparation(preparation)
        throw error
      }
      const isCurrentContext = () =>
        activeRef.current?.requestId === requestId &&
        contextVersionRef.current === contextVersion &&
        sessionIdRef.current === sessionId

      try {
        const result = await promise
        const summary = {
          success: result.success,
          attemptOutcome: result.attemptOutcome,
          ...(result.data?.siteType ? { siteType: result.data.siteType } : {}),
        }

        if (closedRequestIdsRef.current.has(requestId)) {
          closedRequestIdsRef.current.delete(requestId)
          return { status: "ignored", ...summary }
        }
        if (closeRequestedRef.current) return { status: "ignored", ...summary }
        if (!isCurrentContext()) {
          const label = getStaleReminderLabel(result)
          if (label) showRecoveryWarningOnce(requestId, label)
          return { status: "ignored", ...summary }
        }

        const nextRecovery = createRecoveryFromResult(result)
        if (result.kind === "bootstrap_recovery") {
          if (nextRecovery?.createdAccessToken) {
            contextRef.current.credential = nextRecovery.createdAccessToken
            onCredentialCreated(nextRecovery.createdAccessToken)
          }
          setRecoveryState(nextRecovery)
          onManualFallback({
            message: result.message,
            showDetectionError: false,
          })
          return { status: "manual_fallback", ...summary }
        }

        if (result.kind === "bootstrap_failure") {
          onManualFallback({
            message: result.message,
            showDetectionError: true,
          })
          return { status: "manual_fallback", ...summary }
        }

        setRecoveryState(nextRecovery)
        contextRef.current.credential = result.data.accessToken
        onCredentialCreated(result.data.accessToken)
        await onDetected(result.data)
        return { status: "completed", ...summary }
      } catch (error) {
        const wasClosed = closedRequestIdsRef.current.delete(requestId)
        if (!wasClosed && !closeRequestedRef.current) {
          showRecoveryWarningOnce(
            requestId,
            createOpenRouterBootstrapLabel(requestId),
          )
        }
        if (wasClosed || closeRequestedRef.current || !isCurrentContext()) {
          return { status: "ignored", success: false }
        }
        onManualFallback({ error, showDetectionError: true })
        return { status: "manual_fallback", success: false }
      } finally {
        if (activeRef.current?.requestId === requestId) {
          activeRef.current = null
          closeRequestedRef.current = false
        }
      }
    },
    [
      consumePreparation,
      releasePreparation,
      setRecoveryState,
      showRecoveryWarningOnce,
    ],
  )

  const beforeClose = useCallback(async () => {
    invalidatePreparation()
    const active = activeRef.current
    let reconciledRecovery: OpenRouterRecoveryState | null = null
    let hasKnownNotDispatchedEvidence = false

    if (active) {
      const deadline = Date.now() + OPENROUTER_BOOTSTRAP_CANCEL_TIMEOUT_MS
      closedRequestIdsRef.current.add(active.requestId)
      closeRequestedRef.current = true
      const provisioningSettlement = settleWithinDeadline(
        active.promise,
        deadline,
      )
      const cancellationSettlement = settleWithinDeadline(
        cancelOpenRouterAccountProvisioning(active.requestId),
        deadline,
      )
      const [cancellation, provisioning] = await Promise.all([
        cancellationSettlement,
        provisioningSettlement,
      ])

      // A bounded close must release this hook even when the underlying
      // provisioning and cancellation operations never settle. The closed ID
      // still isolates any late result from a subsequently opened session.
      if (activeRef.current === active) {
        activeRef.current = null
        closeRequestedRef.current = false
      }

      if (provisioning.status === "fulfilled") {
        hasKnownNotDispatchedEvidence =
          provisioning.value.kind === "bootstrap_failure" &&
          provisioning.value.mutationState ===
            OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched
        reconciledRecovery = createRecoveryFromResult(provisioning.value)
      } else if (cancellation.status === "fulfilled") {
        hasKnownNotDispatchedEvidence =
          cancellation.value.certainty === "known" &&
          cancellation.value.mutationState ===
            OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched
        reconciledRecovery = createRecoveryFromCancellation(cancellation.value)
      }

      if (reconciledRecovery) {
        consumeRecoveryReminder(reconciledRecovery)
      } else if (!hasKnownNotDispatchedEvidence) {
        showRecoveryWarningOnce(
          active.requestId,
          createOpenRouterBootstrapLabel(active.requestId),
        )
      }
    }

    consumeRecoveryReminder(reconciledRecovery ?? recoveryRef.current)
    setRecoveryState(null)
  }, [
    consumeRecoveryReminder,
    invalidatePreparation,
    setRecoveryState,
    showRecoveryWarningOnce,
  ])

  return {
    recovery,
    resetSession,
    notifyUrlChange,
    notifySiteChange,
    notifyCredentialChange,
    tryPrepareForStart,
    releasePreparation,
    abandonForOtherAutoDetect,
    startPrepared,
    beforeClose,
    confirmSavedCredential,
  }
}
