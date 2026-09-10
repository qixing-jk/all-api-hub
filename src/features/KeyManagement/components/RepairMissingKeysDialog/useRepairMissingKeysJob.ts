import type { TFunction } from "i18next"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react"

import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import {
  AccountKeyRepairMessageTypes,
  sendAccountKeyRepairMessage,
} from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import {
  trackProductAnalyticsActionCompleted,
  trackProductAnalyticsActionStarted,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"
import { onRuntimeMessage } from "~/utils/browser/browserApi"

import { hasRepairAttentionOutcomes } from "./repairMissingKeysDialogHelpers"

const repairMissingKeysAnalyticsContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.RepairMissingAccountKeys,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRepairDialog,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}

/**
 * Counts accounts that are eligible for the repair attempt at the dialog boundary.
 */
function getEligibleAccountCountFromAccounts(accounts: DisplaySiteData[]) {
  return accounts.filter((account) => !account.disabled).length
}

/**
 * Builds sanitized analytics insights when the repair job cannot start.
 */
function getRepairStartFailureInsights(
  progress: AccountKeyRepairProgress | null,
  accounts: DisplaySiteData[],
) {
  return {
    itemCount:
      progress?.totals.eligibleAccounts ??
      getEligibleAccountCountFromAccounts(accounts),
    selectedCount: 0,
    successCount: 0,
    failureCount: progress?.summary.failed ?? 0,
    statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
  }
}

/**
 * Extracts privacy-safe count metrics from repair progress.
 */
function getRepairProgressInsightCounts(progress: AccountKeyRepairProgress) {
  const failureCount =
    progress.summary.partial +
    progress.summary.blocked +
    progress.summary.failed
  return {
    itemCount: progress.totals.eligibleAccounts,
    selectedCount: progress.totals.processedAccounts,
    successCount: progress.summary.complete,
    failureCount,
  }
}

/**
 * Maps terminal repair progress into a coarse health status.
 */
function getRepairProgressStatusKind(progress: AccountKeyRepairProgress) {
  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Failed) {
    return PRODUCT_ANALYTICS_STATUS_KINDS.Error
  }
  if (hasRepairAttentionOutcomes(progress.summary)) {
    return PRODUCT_ANALYTICS_STATUS_KINDS.Warning
  }
  return PRODUCT_ANALYTICS_STATUS_KINDS.Healthy
}

/**
 * Maps terminal repair progress into the product analytics result enum.
 */
function getRepairProgressResult(progress: AccountKeyRepairProgress) {
  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled) {
    return PRODUCT_ANALYTICS_RESULTS.Cancelled
  }
  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Failed) {
    return PRODUCT_ANALYTICS_RESULTS.Failure
  }
  if (hasRepairAttentionOutcomes(progress.summary)) {
    return PRODUCT_ANALYTICS_RESULTS.Failure
  }
  return PRODUCT_ANALYTICS_RESULTS.Success
}

interface UseRepairMissingKeysJobOptions {
  accounts: DisplaySiteData[]
  isOpen: boolean
  startOnOpen: boolean
  renameAutoTemplateTokens?: boolean
  t: TFunction
}

/**
 * Manages repair job loading, starting, progress subscriptions, and analytics.
 */
export function useRepairMissingKeysJob({
  accounts,
  isOpen,
  renameAutoTemplateTokens = true,
  startOnOpen,
  t,
}: UseRepairMissingKeysJobOptions) {
  const [progress, setProgressState] =
    useState<AccountKeyRepairProgress | null>(null)
  const [failure, setFailure] = useState<"start" | "cancel" | "load" | null>(
    null,
  )
  const [isStarting, setIsStarting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const startedAnalyticsJobIdRef = useRef<string | null>(null)
  const completedAnalyticsJobIdRef = useRef<string | null>(null)
  const cancelInFlightRef = useRef(false)
  const progressRef = useRef<AccountKeyRepairProgress | null>(null)
  const accountsRef = useRef(accounts)
  const isDialogOpenRef = useRef(isOpen)
  const hasAutoStartedRef = useRef(false)
  const startInFlightRef = useRef(false)
  const startRequestIdRef = useRef(0)
  const progressRevisionRef = useRef(0)

  const setProgress = useCallback(
    (update: SetStateAction<AccountKeyRepairProgress | null>) => {
      const current = progressRef.current
      const next = typeof update === "function" ? update(current) : update
      if (!next) {
        progressRef.current = null
        progressRevisionRef.current += 1
        setProgressState(null)
        return
      }
      if (current?.jobId === next.jobId) {
        if (
          (current.updatedAt ?? 0) > (next.updatedAt ?? 0) ||
          (current.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Running &&
            current.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Idle &&
            next.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Running)
        ) {
          return
        }
      } else if (
        current?.startedAt !== undefined &&
        next.startedAt !== undefined &&
        current.startedAt > next.startedAt
      ) {
        return
      }
      progressRef.current = next
      progressRevisionRef.current += 1
      setProgressState(next)
    },
    [],
  )

  isDialogOpenRef.current = isOpen

  const invalidatePendingStart = useCallback(() => {
    startRequestIdRef.current += 1
    startInFlightRef.current = false
    if (isDialogOpenRef.current) {
      setIsStarting(false)
    }
  }, [])

  const handleStartAudit = useCallback(async () => {
    if (startInFlightRef.current) {
      return
    }

    startInFlightRef.current = true
    const requestId = startRequestIdRef.current + 1
    startRequestIdRef.current = requestId

    setIsStarting(true)
    setFailure(null)
    try {
      const response = await sendAccountKeyRepairMessage(
        AccountKeyRepairMessageTypes.Start,
        {
          renameAutoTemplateTokens,
        },
      )
      if (response?.success && response.data) {
        startedAnalyticsJobIdRef.current = response.data.jobId
        void trackProductAnalyticsActionStarted(
          repairMissingKeysAnalyticsContext,
        )
        if (
          isDialogOpenRef.current &&
          startRequestIdRef.current === requestId
        ) {
          setProgress(response.data)
        }
        return
      }

      void trackProductAnalyticsActionCompleted({
        ...repairMissingKeysAnalyticsContext,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: getRepairStartFailureInsights(
          progressRef.current,
          accountsRef.current,
        ),
      })
      if (isDialogOpenRef.current && startRequestIdRef.current === requestId) {
        setFailure("start")
      }
    } catch {
      void trackProductAnalyticsActionCompleted({
        ...repairMissingKeysAnalyticsContext,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: getRepairStartFailureInsights(
          progressRef.current,
          accountsRef.current,
        ),
      })
      if (isDialogOpenRef.current && startRequestIdRef.current === requestId) {
        setFailure("start")
      }
    } finally {
      if (startRequestIdRef.current === requestId) {
        startInFlightRef.current = false
        if (isDialogOpenRef.current) {
          setIsStarting(false)
        }
      }
    }
  }, [renameAutoTemplateTokens, setProgress])

  const handleCancelAudit = useCallback(async () => {
    if (cancelInFlightRef.current) {
      return
    }

    cancelInFlightRef.current = true
    invalidatePendingStart()
    setIsCancelling(true)
    setFailure(null)
    try {
      const response = await sendAccountKeyRepairMessage(
        AccountKeyRepairMessageTypes.Cancel,
      )
      if (response?.success && response.data) {
        completedAnalyticsJobIdRef.current = response.data.jobId
        void trackProductAnalyticsActionCompleted({
          ...repairMissingKeysAnalyticsContext,
          result: getRepairProgressResult(response.data),
          insights: {
            ...getRepairProgressInsightCounts(response.data),
            statusKind: getRepairProgressStatusKind(response.data),
          },
        })
        if (isDialogOpenRef.current) {
          setProgress(response.data)
        }
        return
      }

      if (isDialogOpenRef.current) {
        setFailure("cancel")
      }
    } catch {
      if (isDialogOpenRef.current) {
        setFailure("cancel")
      }
    } finally {
      cancelInFlightRef.current = false
      if (isDialogOpenRef.current) {
        setIsCancelling(false)
      }
    }
  }, [invalidatePendingStart, setProgress])

  useEffect(() => {
    isDialogOpenRef.current = isOpen
    if (isOpen) {
      setIsStarting(startInFlightRef.current)
    } else {
      setIsStarting(false)
      setIsCancelling(false)
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      isDialogOpenRef.current = false
      invalidatePendingStart()
    }
  }, [invalidatePendingStart])

  useEffect(() => {
    if (!isOpen) {
      startedAnalyticsJobIdRef.current = null
      completedAnalyticsJobIdRef.current = null
    }
  }, [isOpen])

  useEffect(() => {
    accountsRef.current = accounts
  }, [accounts])

  useEffect(() => {
    if (!isOpen) return

    return onRuntimeMessage((message) => {
      if (message?.type !== RuntimeMessageTypes.AccountKeyRepairProgress) return
      const payload = message?.payload as AccountKeyRepairProgress | undefined
      if (!payload) return
      setProgress(payload)
    })
  }, [isOpen, setProgress])

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    const revision = progressRevisionRef.current
    setFailure(null)

    void (async () => {
      try {
        const response = await sendAccountKeyRepairMessage(
          AccountKeyRepairMessageTypes.GetProgress,
        )
        if (cancelled || revision !== progressRevisionRef.current) return
        if (response?.success && response.data) {
          setProgress(response.data)
          return
        }

        setFailure("load")
      } catch {
        if (!cancelled && revision === progressRevisionRef.current) {
          setFailure("load")
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, setProgress])

  useEffect(() => {
    if (!isOpen || progress?.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Running) {
      return
    }

    let cancelled = false
    let inFlight = false
    // Broadcasts are best-effort. Reconcile while visible so a missed terminal
    // notification (including a restarted worker) cannot leave the UI running.
    const timer = setInterval(async () => {
      if (inFlight) return
      inFlight = true
      const revision = progressRevisionRef.current
      try {
        const response = await sendAccountKeyRepairMessage(
          AccountKeyRepairMessageTypes.GetProgress,
        )
        if (cancelled || revision !== progressRevisionRef.current) return
        if (response?.success && response.data) {
          setProgress(response.data)
          setFailure((current) => (current === "load" ? null : current))
        } else {
          setFailure("load")
        }
      } catch {
        if (!cancelled && revision === progressRevisionRef.current) {
          setFailure("load")
        }
      } finally {
        inFlight = false
      }
    }, 3000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isOpen, progress?.jobId, progress?.state, setProgress])

  useEffect(() => {
    if (!isOpen) {
      hasAutoStartedRef.current = false
      return
    }
    if (!startOnOpen) return
    if (hasAutoStartedRef.current) return

    hasAutoStartedRef.current = true
    void handleStartAudit()
  }, [handleStartAudit, isOpen, startOnOpen])

  useEffect(() => {
    if (!progress) return
    if (
      progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Completed &&
      progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Failed &&
      progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled
    ) {
      return
    }
    if (startedAnalyticsJobIdRef.current !== progress.jobId) return
    if (completedAnalyticsJobIdRef.current === progress.jobId) return

    completedAnalyticsJobIdRef.current = progress.jobId

    void trackProductAnalyticsActionCompleted({
      ...repairMissingKeysAnalyticsContext,
      result: getRepairProgressResult(progress),
      ...(progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Failed
        ? { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown }
        : {}),
      insights: {
        ...getRepairProgressInsightCounts(progress),
        statusKind: getRepairProgressStatusKind(progress),
      },
    })
  }, [progress])

  return {
    error:
      failure === "start"
        ? t("keyManagement:repairMissingKeys.messages.startFailed")
        : failure === "cancel"
          ? t("keyManagement:repairMissingKeys.messages.cancelFailed")
          : failure === "load"
            ? t("keyManagement:repairMissingKeys.messages.loadFailed")
            : "",
    handleCancelAudit,
    handleStartAudit,
    isCancelling,
    isStarting,
    progress,
    setProgress,
  }
}
