import type { TFunction } from "i18next"
import { useCallback, useEffect, useRef, useState } from "react"

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
} from "~/services/productAnalytics/events"
import type { DisplaySiteData } from "~/types"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"
import { onRuntimeMessage } from "~/utils/browser/browserApi"

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
  return {
    itemCount: progress.totals.eligibleAccounts,
    selectedCount:
      progress.totals.processedEligibleAccounts ??
      progress.totals.processedAccounts,
    successCount: progress.summary.created,
    failureCount: progress.summary.failed,
  }
}

/**
 * Maps terminal repair progress into a coarse health status.
 */
function getRepairProgressStatusKind(progress: AccountKeyRepairProgress) {
  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Failed) {
    return PRODUCT_ANALYTICS_STATUS_KINDS.Error
  }
  if (progress.summary.failed > 0) {
    return PRODUCT_ANALYTICS_STATUS_KINDS.Warning
  }
  return PRODUCT_ANALYTICS_STATUS_KINDS.Healthy
}

/**
 * Maps terminal repair progress into the product analytics result enum.
 */
function getRepairProgressResult(progress: AccountKeyRepairProgress) {
  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Failed) {
    return PRODUCT_ANALYTICS_RESULTS.Failure
  }
  if (progress.summary.failed > 0) {
    return PRODUCT_ANALYTICS_RESULTS.Failure
  }
  return PRODUCT_ANALYTICS_RESULTS.Success
}

interface UseRepairMissingKeysJobOptions {
  accounts: DisplaySiteData[]
  isOpen: boolean
  startOnOpen: boolean
  t: TFunction
}

/**
 * Manages repair job loading, starting, progress subscriptions, and analytics.
 */
export function useRepairMissingKeysJob({
  accounts,
  isOpen,
  startOnOpen,
  t,
}: UseRepairMissingKeysJobOptions) {
  const [progress, setProgress] = useState<AccountKeyRepairProgress | null>(
    null,
  )
  const [error, setError] = useState<string>("")
  const [isStarting, setIsStarting] = useState(false)
  const startedAnalyticsJobIdRef = useRef<string | null>(null)
  const completedAnalyticsJobIdRef = useRef<string | null>(null)
  const progressRef = useRef<AccountKeyRepairProgress | null>(null)
  const accountsRef = useRef(accounts)
  const isDialogOpenRef = useRef(isOpen)
  const startInFlightRef = useRef(false)
  const startRequestIdRef = useRef(0)

  isDialogOpenRef.current = isOpen

  const handleStartAudit = useCallback(async () => {
    if (startInFlightRef.current) {
      return
    }

    startInFlightRef.current = true
    const requestId = startRequestIdRef.current + 1
    startRequestIdRef.current = requestId

    setIsStarting(true)
    setError("")
    try {
      const response = await sendAccountKeyRepairMessage(
        AccountKeyRepairMessageTypes.Start,
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
        setError(t("keyManagement:repairMissingKeys.messages.startFailed"))
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
        setError(t("keyManagement:repairMissingKeys.messages.startFailed"))
      }
    } finally {
      if (startRequestIdRef.current === requestId) {
        startInFlightRef.current = false
        if (isDialogOpenRef.current) {
          setIsStarting(false)
        }
      }
    }
  }, [t])

  useEffect(() => {
    isDialogOpenRef.current = isOpen
    if (isOpen) {
      setIsStarting(startInFlightRef.current)
    } else {
      setIsStarting(false)
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      isDialogOpenRef.current = false
      startRequestIdRef.current += 1
      startInFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      startedAnalyticsJobIdRef.current = null
      completedAnalyticsJobIdRef.current = null
    }
  }, [isOpen])

  useEffect(() => {
    progressRef.current = progress
  }, [progress])

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
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setError("")

    void (async () => {
      try {
        const response = await sendAccountKeyRepairMessage(
          AccountKeyRepairMessageTypes.GetProgress,
        )
        if (cancelled) return
        if (response?.success && response.data) {
          setProgress(response.data)
          return
        }

        setError(t("keyManagement:repairMissingKeys.messages.loadFailed"))
      } catch {
        if (!cancelled) {
          setError(t("keyManagement:repairMissingKeys.messages.loadFailed"))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, t])

  useEffect(() => {
    if (!isOpen) return
    if (!startOnOpen) return

    void handleStartAudit()
  }, [handleStartAudit, isOpen, startOnOpen])

  useEffect(() => {
    if (!progress) return
    if (
      progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Completed &&
      progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Failed
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
    error,
    handleStartAudit,
    isStarting,
    progress,
    setProgress,
  }
}
