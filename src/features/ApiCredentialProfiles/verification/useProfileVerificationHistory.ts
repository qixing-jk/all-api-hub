import {
  useCallback,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react"

import { buildProbeState } from "~/components/dialogs/VerifyApiDialog/probeState"
import { useVerificationDialogState } from "~/components/dialogs/VerifyApiDialog/useVerificationDialogState"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import {
  createProfileModelVerificationHistoryTarget,
  createProfileVerificationHistoryTarget,
} from "~/services/verification/verificationResultHistory"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

/**
 * Resolves the persisted history target for the profile and optional model.
 */
function createCurrentProfileVerificationHistoryTarget(
  profileId: string,
  modelId?: string,
) {
  const trimmedModelId = modelId?.trim()
  return trimmedModelId
    ? createProfileModelVerificationHistoryTarget(profileId, trimmedModelId)
    : createProfileVerificationHistoryTarget(profileId)
}

/**
 * Tracks the persisted-history context separately from the storage target so
 * API type switches still force a history refresh.
 */
function createVerificationHistoryContextKey(
  profileId: string,
  apiType: ApiVerificationApiType,
  modelId?: string,
) {
  return `${profileId}::${apiType}::${modelId?.trim() ?? ""}`
}
/** Own profile/model history selection, stale-load rejection and preservation of active probe results. */
export function useProfileVerificationHistory({
  profile,
  apiType,
  modelId,
  setModelId,
  isOpen,
  isRunning,
  isPersisting,
}: {
  profile: ApiCredentialProfile | null
  apiType: ApiVerificationApiType
  modelId: string
  setModelId: Dispatch<SetStateAction<string>>
  isOpen: boolean
  isRunning: boolean
  isPersisting: boolean
}) {
  const pendingHistoryContextKeyRef = useRef<string | null>(null)
  const lastLoadedHistoryContextKeyRef = useRef<string | null>(null)
  const trimmedModelId = modelId.trim()
  const historyTarget = useMemo(() => {
    if (!profile) return null

    // API type does not change the storage key, but it does change which
    // persisted summary should be shown for the active dialog context.
    void apiType
    return createCurrentProfileVerificationHistoryTarget(
      profile.id,
      trimmedModelId,
    )
  }, [apiType, profile, trimmedModelId])
  const historyContextKey = useMemo(() => {
    if (!profile) return null
    return createVerificationHistoryContextKey(
      profile.id,
      apiType,
      trimmedModelId,
    )
  }, [apiType, profile, trimmedModelId])
  const {
    probes,
    setProbes: replaceProbes,
    probesRef,
    persistedSummary,
    setPersistedSummary,
    persistCurrentResults,
    loadVerificationHistory,
  } = useVerificationDialogState(historyTarget)

  const getHistoryTargetForModel = useCallback(
    (nextModelId?: string) => {
      if (!profile) return null
      return createCurrentProfileVerificationHistoryTarget(
        profile.id,
        nextModelId,
      )
    },
    [profile],
  )

  const preserveCurrentProbeStateForModel = useCallback(
    (nextModelId: string, nextApiType: ApiVerificationApiType) => {
      if (!profile) return

      pendingHistoryContextKeyRef.current = null
      lastLoadedHistoryContextKeyRef.current =
        createVerificationHistoryContextKey(
          profile.id,
          nextApiType,
          nextModelId,
        )
    },
    [profile],
  )

  const resetHistoryContext = useCallback(() => {
    pendingHistoryContextKeyRef.current = null
    lastLoadedHistoryContextKeyRef.current = null
  }, [])
  const beginHistoryContext = useCallback(
    (nextApiType: ApiVerificationApiType, nextModelId: string) => {
      if (!profile) return
      pendingHistoryContextKeyRef.current = createVerificationHistoryContextKey(
        profile.id,
        nextApiType,
        nextModelId,
      )
      lastLoadedHistoryContextKeyRef.current = null
    },
    [profile],
  )

  const isAnyProbeRunning = probes.some((p) => p.isRunning)
  const restoreHistory = useCallback(() => {
    if (
      !isOpen ||
      !profile ||
      !historyTarget ||
      !historyContextKey ||
      isRunning ||
      isAnyProbeRunning ||
      isPersisting
    ) {
      return
    }

    if (
      pendingHistoryContextKeyRef.current &&
      pendingHistoryContextKeyRef.current !== historyContextKey
    ) {
      return
    }

    if (lastLoadedHistoryContextKeyRef.current === historyContextKey) {
      return
    }

    pendingHistoryContextKeyRef.current = null
    lastLoadedHistoryContextKeyRef.current = historyContextKey

    let cancelled = false
    setPersistedSummary(null)
    replaceProbes(buildProbeState(apiType))

    void loadVerificationHistory({
      apiType,
      isCancelled: () => cancelled,
      onResolvedModelId: (resolvedModelId) => {
        setModelId((current) => current.trim() || resolvedModelId)
      },
      shouldApplySummaryToProbes: (summary) => summary.apiType === apiType,
    }).then((summary) => {
      if (cancelled || !summary || summary.apiType === apiType) {
        return
      }

      setPersistedSummary(null, false)
    })

    return () => {
      cancelled = true
    }
  }, [
    apiType,
    historyContextKey,
    historyTarget,
    isAnyProbeRunning,
    isOpen,
    isPersisting,
    isRunning,
    loadVerificationHistory,
    setModelId,
    profile,
    replaceProbes,
    setPersistedSummary,
  ])

  return {
    probes,
    setProbes: replaceProbes,
    probesRef,
    persistedSummary,
    setPersistedSummary,
    persistCurrentResults,
    historyTarget,
    getHistoryTargetForModel,
    preserveCurrentProbeStateForModel,
    beginHistoryContext,
    resetHistoryContext,
    restoreHistory,
  }
}
