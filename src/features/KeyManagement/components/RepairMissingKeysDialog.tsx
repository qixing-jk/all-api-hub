import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import { ShieldCheck, TriangleAlert } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import { ResponsiveToggleGroup } from "~/components/ResponsiveButtonGroup"
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  DestructiveConfirmDialog,
  EmptyState,
  Input,
  Label,
  Modal,
  Spinner,
  TagFilter,
} from "~/components/ui"
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
import type {
  AccountKeyRepairInvalidToken,
  AccountKeyRepairOutcome,
  AccountKeyRepairProgress,
  AccountKeyRepairSkipReason,
} from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS,
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
} from "~/types/accountKeyAutoProvisioning"
import { onRuntimeMessage } from "~/utils/browser/browserApi"

const repairMissingKeysAnalyticsContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.RepairMissingAccountKeys,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRepairDialog,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}

const deleteInvalidKeysAnalyticsContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteInvalidAccountTokens,
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

interface RepairMissingKeysDialogProps {
  isOpen: boolean
  onClose: () => void
  accounts: DisplaySiteData[]
  startOnOpen: boolean
}

/**
 * Returns the localized skip reason label used when a repair result is skipped.
 */
function getSkipReasonLabel(
  t: TFunction,
  reason: AccountKeyRepairSkipReason | undefined,
) {
  if (!reason) return ""
  switch (reason) {
    case ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api:
      return t("keyManagement:repairMissingKeys.skipReasons.sub2api")
    case ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey:
      return t("keyManagement:repairMissingKeys.skipReasons.aihubmixOneTimeKey")
    case ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth:
      return t("keyManagement:repairMissingKeys.skipReasons.noneAuth")
  }
}

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"]
const REPAIR_RESULT_VIEWS = {
  AccountCoverage: "accountCoverage",
  InvalidKeys: "invalidKeys",
} as const

type RepairResultView =
  (typeof REPAIR_RESULT_VIEWS)[keyof typeof REPAIR_RESULT_VIEWS]

const OUTCOME_BADGE_VARIANTS: Record<AccountKeyRepairOutcome, BadgeVariant> = {
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Created]: "success",
  [ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad]: "info",
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped]: "warning",
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Failed]: "danger",
}

/**
 * Returns the localized outcome label shown for each repair result row.
 */
function getRepairOutcomeLabel(t: TFunction, outcome: AccountKeyRepairOutcome) {
  switch (outcome) {
    case ACCOUNT_KEY_REPAIR_OUTCOMES.Created:
      return t("keyManagement:repairMissingKeys.outcomes.created")
    case ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad:
      return t("keyManagement:repairMissingKeys.outcomes.alreadyHad")
    case ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped:
      return t("keyManagement:repairMissingKeys.outcomes.skipped")
    case ACCOUNT_KEY_REPAIR_OUTCOMES.Failed:
      return t("keyManagement:repairMissingKeys.outcomes.failed")
  }
}

/**
 * Returns the localized view switch label.
 */
function getRepairResultViewLabel(t: TFunction, view: RepairResultView) {
  switch (view) {
    case REPAIR_RESULT_VIEWS.AccountCoverage:
      return t("keyManagement:repairMissingKeys.views.accountCoverage")
    case REPAIR_RESULT_VIEWS.InvalidKeys:
      return t("keyManagement:repairMissingKeys.views.invalidKeys")
  }
}

/**
 * Keeps group names visible if i18n returns the missing-key fallback instead of
 * interpolated copy.
 */
function getCoverageGroupLabel(
  t: TFunction,
  key: "createdGroup" | "missingGroup",
  group: string,
) {
  const [translationKey, label] =
    key === "createdGroup"
      ? [
          "keyManagement:repairMissingKeys.coverage.createdGroup",
          t("keyManagement:repairMissingKeys.coverage.createdGroup", {
            group,
          }),
        ]
      : [
          "keyManagement:repairMissingKeys.coverage.missingGroup",
          t("keyManagement:repairMissingKeys.coverage.missingGroup", {
            group,
          }),
        ]

  return label === translationKey ? group : label
}

/**
 * Returns the localized reason shown for invalid keys.
 */
function getInvalidTokenReasonLabel(
  t: TFunction,
  token: AccountKeyRepairInvalidToken,
) {
  switch (token.reason) {
    case ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable:
      return t("keyManagement:repairMissingKeys.invalidKeys.groupUnavailable", {
        group: token.group,
      })
  }
}

/**
 * Builds a stable selection key for an invalid token within an account.
 */
function getInvalidTokenKey(token: AccountKeyRepairInvalidToken) {
  return `${token.accountId}:${token.tokenId}`
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

/**
 * Modal dialog showing the background progress of the "ensure at least one key" job.
 */
export function RepairMissingKeysDialog(props: RepairMissingKeysDialogProps) {
  const { isOpen, onClose, accounts, startOnOpen } = props
  const { t } = useTranslation(["keyManagement", "common"])
  const { openDefaultTokenQuickCreateDialogForAccount } = useChannelDialog()

  const [progress, setProgress] = useState<AccountKeyRepairProgress | null>(
    null,
  )
  const [error, setError] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  const [outcomeFilter, setOutcomeFilter] =
    useState<AccountKeyRepairOutcome | null>(null)
  const [activeView, setActiveView] = useState<RepairResultView>(
    REPAIR_RESULT_VIEWS.AccountCoverage,
  )
  const [openingSub2ApiAccountId, setOpeningSub2ApiAccountId] = useState<
    string | null
  >(null)
  const [selectedInvalidTokenKeys, setSelectedInvalidTokenKeys] = useState<
    Set<string>
  >(() => new Set())
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isDeletingInvalidKeys, setIsDeletingInvalidKeys] = useState(false)
  const [deleteResultMessage, setDeleteResultMessage] = useState("")
  const [isStarting, setIsStarting] = useState(false)
  const startedAnalyticsJobIdRef = useRef<string | null>(null)
  const completedAnalyticsJobIdRef = useRef<string | null>(null)
  const progressRef = useRef<AccountKeyRepairProgress | null>(null)
  const accountsRef = useRef(accounts)
  const isDialogOpenRef = useRef(isOpen)
  const startInFlightRef = useRef(false)
  const startRequestIdRef = useRef(0)

  isDialogOpenRef.current = isOpen

  const disabledAccountIds = useMemo(() => {
    return new Set(
      accounts.filter((account) => account.disabled).map((a) => a.id),
    )
  }, [accounts])

  const accountById = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]))
  }, [accounts])

  const visibleResults = useMemo(() => {
    if (!progress) return []
    return progress.results.filter(
      (result) => !disabledAccountIds.has(result.accountId),
    )
  }, [disabledAccountIds, progress])

  const invalidTokens = useMemo(() => {
    return visibleResults.flatMap((result) => result.invalidTokens ?? [])
  }, [visibleResults])

  /**
   * Filters visible repair results by free-text search and an optional outcome filter.
   * Search matches account name, site origin, site type, and group coverage
   * details (case-insensitive).
   */
  const filteredResults = useMemo(() => {
    let results = visibleResults

    if (outcomeFilter) {
      results = results.filter((result) => result.outcome === outcomeFilter)
    }

    const keyword = searchTerm.trim().toLowerCase()
    if (!keyword) {
      return results
    }

    return results.filter((result) => {
      const groupNames = [
        ...(result.availableGroups ?? []),
        ...(result.coveredGroups ?? []),
        ...(result.createdGroups ?? []),
        ...(result.missingGroups ?? []),
      ]

      return (
        result.accountName.toLowerCase().includes(keyword) ||
        result.siteUrlOrigin.toLowerCase().includes(keyword) ||
        result.siteType.toLowerCase().includes(keyword) ||
        groupNames.some((group) => group.toLowerCase().includes(keyword))
      )
    })
  }, [outcomeFilter, searchTerm, visibleResults])

  const filteredInvalidTokens = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    if (!keyword) {
      return invalidTokens
    }

    return invalidTokens.filter((token) => {
      return (
        token.accountName.toLowerCase().includes(keyword) ||
        token.siteUrlOrigin.toLowerCase().includes(keyword) ||
        token.siteType.toLowerCase().includes(keyword) ||
        token.tokenName.toLowerCase().includes(keyword) ||
        token.group.toLowerCase().includes(keyword)
      )
    })
  }, [invalidTokens, searchTerm])

  const selectedInvalidTokens = useMemo(() => {
    return filteredInvalidTokens.filter((token) =>
      selectedInvalidTokenKeys.has(getInvalidTokenKey(token)),
    )
  }, [filteredInvalidTokens, selectedInvalidTokenKeys])

  const deleteConfirmDetails = useMemo(() => {
    const previewTokens = selectedInvalidTokens.slice(0, 5)
    const hiddenCount = selectedInvalidTokens.length - previewTokens.length

    return (
      <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-tertiary/40 rounded-md border border-gray-200 bg-gray-50 p-3">
        <ul className="space-y-2 text-sm">
          {previewTokens.map((token) => (
            <li
              key={getInvalidTokenKey(token)}
              className="min-w-0 text-gray-700 dark:text-gray-300"
            >
              <span className="font-medium">{token.tokenName}</span>
              <span className="dark:text-dark-text-secondary text-gray-500">
                {" "}
                · {token.accountName}
              </span>
            </li>
          ))}
        </ul>
        {hiddenCount > 0 ? (
          <p className="dark:text-dark-text-secondary mt-2 text-xs text-gray-500">
            {t("repairMissingKeys.deleteConfirm.more", {
              count: hiddenCount,
            })}
          </p>
        ) : null}
      </div>
    )
  }, [selectedInvalidTokens, t])

  const handleDeleteInvalidKeys = async () => {
    const tokensToDelete = selectedInvalidTokens
    if (tokensToDelete.length === 0) {
      return
    }

    setIsDeletingInvalidKeys(true)
    setDeleteResultMessage("")
    void trackProductAnalyticsActionStarted(deleteInvalidKeysAnalyticsContext)
    try {
      const response = await sendAccountKeyRepairMessage(
        AccountKeyRepairMessageTypes.DeleteInvalidTokens,
        { tokens: tokensToDelete },
      )

      if (!response?.success || !response.data) {
        setDeleteResultMessage(t("repairMissingKeys.invalidKeys.deleteFailed"))
        setIsDeleteConfirmOpen(false)
        void trackProductAnalyticsActionCompleted({
          ...deleteInvalidKeysAnalyticsContext,
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: tokensToDelete.length,
            selectedCount: tokensToDelete.length,
            successCount: 0,
            failureCount: tokensToDelete.length,
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
          },
        })
        return
      }

      const deletedKeys = new Set(response.data.deleted.map(getInvalidTokenKey))
      setSelectedInvalidTokenKeys((previous) => {
        const next = new Set(previous)
        for (const key of deletedKeys) {
          next.delete(key)
        }
        return next
      })
      setProgress((current) => {
        if (!current) return current

        let removedInvalidTokenCount = 0
        const nextResults = current.results.map((result) => {
          const nextInvalidTokens = result.invalidTokens?.filter((token) => {
            const shouldRemove = deletedKeys.has(getInvalidTokenKey(token))
            if (shouldRemove) {
              removedInvalidTokenCount += 1
            }
            return !shouldRemove
          })

          return {
            ...result,
            invalidTokens: nextInvalidTokens,
          }
        })

        return {
          ...current,
          summary: {
            ...current.summary,
            invalidKeys: Math.max(
              0,
              (current.summary.invalidKeys ?? 0) - removedInvalidTokenCount,
            ),
            deletedKeys:
              (current.summary.deletedKeys ?? 0) + response.data.deleted.length,
            deleteFailed:
              (current.summary.deleteFailed ?? 0) + response.data.failed.length,
          },
          results: nextResults,
        }
      })
      setDeleteResultMessage(
        response.data.failed.length > 0
          ? t("repairMissingKeys.invalidKeys.deletePartial", {
              deleted: response.data.deleted.length,
              failed: response.data.failed.length,
            })
          : t("repairMissingKeys.invalidKeys.deleteSuccess", {
              count: response.data.deleted.length,
            }),
      )
      setIsDeleteConfirmOpen(false)
      void trackProductAnalyticsActionCompleted({
        ...deleteInvalidKeysAnalyticsContext,
        result:
          response.data.failed.length > 0
            ? PRODUCT_ANALYTICS_RESULTS.Failure
            : PRODUCT_ANALYTICS_RESULTS.Success,
        insights: {
          itemCount: tokensToDelete.length,
          selectedCount: tokensToDelete.length,
          successCount: response.data.deleted.length,
          failureCount: response.data.failed.length,
          statusKind:
            response.data.failed.length > 0
              ? PRODUCT_ANALYTICS_STATUS_KINDS.Warning
              : PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
        },
      })
    } catch {
      setDeleteResultMessage(t("repairMissingKeys.invalidKeys.deleteFailed"))
      setIsDeleteConfirmOpen(false)
      void trackProductAnalyticsActionCompleted({
        ...deleteInvalidKeysAnalyticsContext,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: tokensToDelete.length,
          selectedCount: tokensToDelete.length,
          successCount: 0,
          failureCount: tokensToDelete.length,
          statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
        },
      })
    } finally {
      setIsDeletingInvalidKeys(false)
    }
  }

  const handleOpenSub2ApiTokenDialog = async (accountId: string) => {
    const account = accountById.get(accountId)
    if (!account) return

    setOpeningSub2ApiAccountId(accountId)
    try {
      await openDefaultTokenQuickCreateDialogForAccount(account)
    } finally {
      setOpeningSub2ApiAccountId((current) =>
        current === accountId ? null : current,
      )
    }
  }

  /**
   * Builds filter option counts based on currently visible (enabled) accounts.
   */
  const outcomeCounts = useMemo(() => {
    const counts: Record<AccountKeyRepairOutcome, number> = {
      created: 0,
      alreadyHad: 0,
      skipped: 0,
      failed: 0,
    }

    for (const result of visibleResults) {
      counts[result.outcome] += 1
    }

    return counts
  }, [visibleResults])

  const eligibleTotal = progress?.totals.eligibleAccounts ?? 0
  const processedTotal =
    progress?.totals.processedEligibleAccounts ??
    progress?.totals.processedAccounts ??
    0
  const progressMax = Math.max(1, eligibleTotal)

  const progressPercent = useMemo(() => {
    if (eligibleTotal <= 0) return 0
    return Math.min(100, Math.round((processedTotal / eligibleTotal) * 100))
  }, [eligibleTotal, processedTotal])

  const progressBarColor = useMemo(() => {
    if (!progress) {
      return "bg-blue-600 dark:bg-blue-500"
    }
    if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Failed) {
      return "bg-red-600 dark:bg-red-500"
    }
    if (
      progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Completed &&
      progress.summary.failed > 0
    ) {
      return "bg-amber-600 dark:bg-amber-500"
    }
    if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Completed) {
      return "bg-emerald-600 dark:bg-emerald-500"
    }
    return "bg-blue-600 dark:bg-blue-500"
  }, [progress])

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
        setError(t("repairMissingKeys.messages.startFailed"))
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
        setError(t("repairMissingKeys.messages.startFailed"))
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
    if (!isOpen) {
      setSearchTerm("")
      setOutcomeFilter(null)
      setActiveView(REPAIR_RESULT_VIEWS.AccountCoverage)
      setSelectedInvalidTokenKeys(new Set())
      setIsDeleteConfirmOpen(false)
      setDeleteResultMessage("")
    }
  }, [isOpen])

  useEffect(() => {
    const currentInvalidTokenKeys = new Set(
      invalidTokens.map(getInvalidTokenKey),
    )
    setSelectedInvalidTokenKeys((previous) => {
      const next = new Set(
        [...previous].filter((key) => currentInvalidTokenKeys.has(key)),
      )
      return next.size === previous.size ? previous : next
    })
  }, [invalidTokens])

  useEffect(() => {
    if (isDeleteConfirmOpen && selectedInvalidTokens.length === 0) {
      setIsDeleteConfirmOpen(false)
    }
  }, [isDeleteConfirmOpen, selectedInvalidTokens.length])

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
        }
      } catch {
        if (!cancelled) {
          setError(t("repairMissingKeys.messages.loadFailed"))
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      header={
        <div className="space-y-1 pr-10">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">
              {t("repairMissingKeys.title")}
            </h2>
            {progress?.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Running ? (
              <Badge
                variant="info"
                size="sm"
                className="shrink-0 border-transparent"
              >
                <Spinner size="sm" className="h-3.5 w-3.5" />
                {t("common:status.processing")}
              </Badge>
            ) : progress?.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Failed ? (
              <Badge
                variant="danger"
                size="sm"
                className="shrink-0 border-transparent"
              >
                {t("common:status.failed")}
              </Badge>
            ) : progress?.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Completed ? (
              <Badge
                variant={progress.summary.failed > 0 ? "warning" : "success"}
                size="sm"
                className="shrink-0 border-transparent"
              >
                {progress.summary.failed > 0
                  ? t("common:status.error")
                  : t("common:status.success")}
              </Badge>
            ) : null}
          </div>
          <p className="dark:text-dark-text-secondary text-sm text-gray-500">
            {t("repairMissingKeys.description")}
          </p>
        </div>
      }
      footer={
        <p className="dark:text-dark-text-secondary text-xs text-gray-500">
          {t("repairMissingKeys.runningNote")}
        </p>
      }
    >
      {error ? <Alert variant="destructive" description={error} /> : null}

      {!progress || progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Idle ? (
        <Card variant="outlined" className="overflow-hidden">
          <CardContent padding="default" className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="pt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">
                {t("repairMissingKeys.initialNotice")}
              </p>
            </div>
            <Alert
              variant="info"
              compact
              description={t("repairMissingKeys.remoteWriteNotice")}
            />
          </CardContent>
          <CardFooter
            padding="sm"
            className="dark:bg-dark-bg-primary/40 justify-start bg-gray-50/80"
          >
            <Button
              type="button"
              onClick={() => void handleStartAudit()}
              disabled={isStarting}
              loading={isStarting}
              className="w-full sm:w-auto"
            >
              {t("repairMissingKeys.actions.start")}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {progress && progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Idle ? (
        <div className="space-y-4">
          <Card>
            <CardContent padding="md" spacing="none" className="space-y-4">
              <div className="space-y-2">
                <div
                  data-testid="repair-missing-keys-progress-header"
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0 text-xs text-gray-600 dark:text-gray-400">
                    <span>{t("repairMissingKeys.progressLabel")}</span>
                  </div>
                  <div
                    data-testid="repair-missing-keys-progress-actions"
                    className="flex flex-wrap items-center justify-end gap-3 text-xs text-gray-600 dark:text-gray-400"
                  >
                    <span>
                      {processedTotal}/{eligibleTotal} ({progressPercent}%)
                    </span>
                    {progress.state !==
                    ACCOUNT_KEY_REPAIR_JOB_STATES.Running ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleStartAudit()}
                        disabled={isStarting}
                        loading={isStarting}
                      >
                        {t("repairMissingKeys.actions.rerun")}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div
                  className="dark:bg-dark-bg-tertiary h-2 w-full rounded-full bg-gray-100"
                  role="progressbar"
                  aria-label={t("repairMissingKeys.progressLabel")}
                  aria-valuemin={0}
                  aria-valuemax={progressMax}
                  aria-valuenow={Math.min(processedTotal, progressMax)}
                  aria-valuetext={`${processedTotal}/${eligibleTotal} (${progressPercent}%)`}
                >
                  <div
                    className={`h-2 rounded-full transition-all ${progressBarColor}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t("repairMissingKeys.totalsLabels.enabledAccounts")}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {progress.totals.enabledAccounts}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t("repairMissingKeys.totalsLabels.eligibleAccounts")}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {progress.totals.eligibleAccounts}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t("repairMissingKeys.totalsLabels.processedAccounts")}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {processedTotal}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t("repairMissingKeys.outcomes.created")}
                  </p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {progress.summary.created}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t("repairMissingKeys.outcomes.alreadyHad")}
                  </p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {progress.summary.alreadyHad}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t("repairMissingKeys.outcomes.skipped")}
                  </p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {progress.summary.skipped}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t("repairMissingKeys.outcomes.failed")}
                  </p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {progress.summary.failed}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <ResponsiveToggleGroup
            aria-label={t("repairMissingKeys.views.label")}
            value={activeView}
            onValueChange={setActiveView}
            buttonSize="sm"
            className="w-full"
            options={[
              {
                value: REPAIR_RESULT_VIEWS.AccountCoverage,
                label: getRepairResultViewLabel(
                  t,
                  REPAIR_RESULT_VIEWS.AccountCoverage,
                ),
                leftIcon: (
                  <ShieldCheck
                    aria-hidden="true"
                    data-testid="repair-missing-keys-account-coverage-view-icon"
                    className="h-4 w-4"
                  />
                ),
              },
              {
                value: REPAIR_RESULT_VIEWS.InvalidKeys,
                label: (
                  <>
                    {getRepairResultViewLabel(
                      t,
                      REPAIR_RESULT_VIEWS.InvalidKeys,
                    )}
                    {invalidTokens.length > 0 ? (
                      <Badge
                        variant="warning"
                        size="sm"
                        className="ml-2"
                        aria-hidden="true"
                      >
                        {invalidTokens.length}
                      </Badge>
                    ) : null}
                  </>
                ),
                leftIcon: (
                  <TriangleAlert
                    aria-hidden="true"
                    data-testid="repair-missing-keys-invalid-keys-view-icon"
                    className="h-4 w-4"
                  />
                ),
              },
            ]}
          />

          <Card>
            <CardHeader
              data-testid="repair-missing-keys-results-header"
              padding="sm"
              className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div
                data-testid="repair-missing-keys-result-heading-row"
                className="flex h-9 items-center"
              >
                <div
                  data-testid="repair-missing-keys-result-heading"
                  className="flex items-baseline gap-2"
                >
                  <CardTitle className="text-sm">
                    {t("repairMissingKeys.resultsTitle")}
                  </CardTitle>
                  <span
                    data-testid="repair-missing-keys-result-count"
                    className="text-xs leading-none text-gray-500 tabular-nums dark:text-gray-400"
                  >
                    {activeView === REPAIR_RESULT_VIEWS.AccountCoverage
                      ? `${filteredResults.length}/${visibleResults.length}`
                      : `${filteredInvalidTokens.length}/${invalidTokens.length}`}
                  </span>
                </div>
              </div>

              <div className="w-full sm:w-80">
                <Label htmlFor="repair-missing-keys-search" className="sr-only">
                  {t("repairMissingKeys.searchLabel")}
                </Label>
                <Input
                  id="repair-missing-keys-search"
                  type="text"
                  placeholder={t("repairMissingKeys.searchPlaceholder")}
                  aria-label={t("repairMissingKeys.searchLabel")}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
                  rightIcon={
                    searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm("")}
                        className="dark:hover:bg-dark-bg-tertiary rounded p-1 hover:bg-gray-100"
                        aria-label={t("common:actions.clear")}
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    ) : null
                  }
                  containerClassName="w-full"
                />
              </div>
            </CardHeader>

            {activeView === REPAIR_RESULT_VIEWS.AccountCoverage ? (
              <CardContent
                padding="sm"
                spacing="none"
                className="dark:border-dark-bg-tertiary border-b border-gray-200"
              >
                <div className="space-y-2">
                  <TagFilter
                    mode="single"
                    value={outcomeFilter}
                    onChange={(value) =>
                      setOutcomeFilter(value as AccountKeyRepairOutcome | null)
                    }
                    allCount={visibleResults.length}
                    options={[
                      {
                        value: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
                        label: t("repairMissingKeys.outcomes.created"),
                        count: outcomeCounts.created,
                        variant: "success",
                      },
                      {
                        value: ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad,
                        label: t("repairMissingKeys.outcomes.alreadyHad"),
                        count: outcomeCounts.alreadyHad,
                        variant: "info",
                      },
                      {
                        value: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
                        label: t("repairMissingKeys.outcomes.skipped"),
                        count: outcomeCounts.skipped,
                        variant: "warning",
                      },
                      {
                        value: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
                        label: t("repairMissingKeys.outcomes.failed"),
                        count: outcomeCounts.failed,
                        variant: "danger",
                      },
                    ]}
                  />
                </div>
              </CardContent>
            ) : null}

            <CardContent padding="none" spacing="none">
              <div className="max-h-[60vh] overflow-y-auto md:max-h-[min(70vh,48rem)]">
                {activeView === REPAIR_RESULT_VIEWS.InvalidKeys ? (
                  <div>
                    {deleteResultMessage ? (
                      <div className="px-4 pt-4">
                        <Alert description={deleteResultMessage} />
                      </div>
                    ) : null}

                    {invalidTokens.length === 0 ? (
                      <EmptyState
                        icon={<MagnifyingGlassIcon className="h-12 w-12" />}
                        title={t("repairMissingKeys.invalidKeys.emptyTitle")}
                        description={t(
                          "repairMissingKeys.invalidKeys.emptyDescription",
                        )}
                        className="py-10"
                      />
                    ) : filteredInvalidTokens.length === 0 ? (
                      <EmptyState
                        icon={<MagnifyingGlassIcon className="h-12 w-12" />}
                        title={t("repairMissingKeys.noMatchingResults")}
                        className="py-10"
                      />
                    ) : (
                      <>
                        <div className="dark:border-dark-bg-tertiary space-y-2 border-b border-gray-200 px-4 py-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={
                                  filteredInvalidTokens.length > 0 &&
                                  selectedInvalidTokens.length ===
                                    filteredInvalidTokens.length
                                }
                                onCheckedChange={(checked) => {
                                  setSelectedInvalidTokenKeys(
                                    checked
                                      ? new Set(
                                          filteredInvalidTokens.map(
                                            getInvalidTokenKey,
                                          ),
                                        )
                                      : new Set(),
                                  )
                                }}
                                aria-label={t(
                                  "repairMissingKeys.invalidKeys.selectAll",
                                )}
                              />
                              {t("repairMissingKeys.invalidKeys.selectAll")}
                            </label>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {t(
                                  "repairMissingKeys.invalidKeys.selectedCount",
                                  {
                                    count: selectedInvalidTokens.length,
                                  },
                                )}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={selectedInvalidTokens.length === 0}
                                onClick={() => setIsDeleteConfirmOpen(true)}
                              >
                                {t(
                                  "repairMissingKeys.invalidKeys.deleteSelected",
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>

                        <ul className="dark:divide-dark-bg-tertiary divide-y">
                          {filteredInvalidTokens.map((token) => {
                            const tokenKey = getInvalidTokenKey(token)

                            return (
                              <li
                                key={`${token.accountId}-${token.tokenId}-${token.group}`}
                                className="px-4 py-3"
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="flex min-w-0 gap-3">
                                    <Checkbox
                                      checked={selectedInvalidTokenKeys.has(
                                        tokenKey,
                                      )}
                                      onCheckedChange={(checked) => {
                                        setSelectedInvalidTokenKeys(
                                          (previous) => {
                                            const next = new Set(previous)
                                            if (checked) {
                                              next.add(tokenKey)
                                            } else {
                                              next.delete(tokenKey)
                                            }
                                            return next
                                          },
                                        )
                                      }}
                                      aria-label={token.tokenName}
                                      className="mt-0.5 shrink-0"
                                    />
                                    <div className="min-w-0 space-y-1">
                                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <div className="truncate text-sm font-medium">
                                          {token.tokenName}
                                        </div>
                                        <Badge
                                          variant="warning"
                                          size="sm"
                                          className="shrink-0 border-transparent"
                                        >
                                          {t(
                                            "repairMissingKeys.invalidKeys.badge",
                                          )}
                                        </Badge>
                                        <Badge
                                          variant="outline"
                                          size="sm"
                                          className="dark:border-dark-bg-tertiary shrink-0 border-gray-200 px-2 py-0.5 text-[11px] font-medium"
                                          title={token.group}
                                        >
                                          {token.group}
                                        </Badge>
                                      </div>
                                      <div className="dark:text-dark-text-secondary truncate text-xs text-gray-500">
                                        {token.accountName} ·{" "}
                                        {token.siteUrlOrigin}
                                      </div>
                                    </div>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    size="sm"
                                    className="dark:border-dark-bg-tertiary shrink-0 border-gray-200 px-2 py-0.5 text-[11px] font-medium"
                                    title={token.siteType}
                                  >
                                    {token.siteType}
                                  </Badge>
                                </div>
                                <div className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                                  {getInvalidTokenReasonLabel(t, token)}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      </>
                    )}
                  </div>
                ) : filteredResults.length === 0 ? (
                  <EmptyState
                    icon={<MagnifyingGlassIcon className="h-12 w-12" />}
                    title={t("repairMissingKeys.noMatchingResults")}
                    className="py-10"
                  />
                ) : (
                  <ul className="dark:divide-dark-bg-tertiary divide-y">
                    {filteredResults.map((result) => {
                      const outcomeLabel = getRepairOutcomeLabel(
                        t,
                        result.outcome,
                      )
                      const details =
                        result.outcome === ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped
                          ? getSkipReasonLabel(t, result.skipReason)
                          : result.outcome ===
                              ACCOUNT_KEY_REPAIR_OUTCOMES.Failed
                            ? result.errorMessage || ""
                            : ""
                      const canCreateSub2ApiKey =
                        result.outcome ===
                          ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped &&
                        result.skipReason ===
                          ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api &&
                        accountById.has(result.accountId)

                      const badgeVariant =
                        OUTCOME_BADGE_VARIANTS[result.outcome]

                      return (
                        <li
                          key={`${result.accountId}-${result.finishedAt}`}
                          className="px-4 py-3"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="truncate text-sm font-medium">
                                  {result.accountName}
                                </div>
                                <Badge
                                  variant="outline"
                                  size="sm"
                                  className="dark:border-dark-bg-tertiary shrink-0 border-gray-200 px-2 py-0.5 text-[11px] font-medium"
                                  title={result.siteType}
                                >
                                  {result.siteType}
                                </Badge>
                              </div>
                              <div className="dark:text-dark-text-secondary truncate text-xs text-gray-500">
                                {result.siteUrlOrigin}
                              </div>
                            </div>
                            <Badge
                              variant={badgeVariant}
                              size="sm"
                              className="shrink-0 border-transparent"
                            >
                              {outcomeLabel}
                            </Badge>
                          </div>

                          {canCreateSub2ApiKey ? (
                            <div className="mt-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void handleOpenSub2ApiTokenDialog(
                                    result.accountId,
                                  )
                                }
                                disabled={
                                  openingSub2ApiAccountId === result.accountId
                                }
                                loading={
                                  openingSub2ApiAccountId === result.accountId
                                }
                              >
                                {t("dialog.createToken")}
                              </Button>
                            </div>
                          ) : null}

                          {details ? (
                            <div
                              className={[
                                "mt-2 text-xs",
                                result.outcome ===
                                ACCOUNT_KEY_REPAIR_OUTCOMES.Failed
                                  ? "text-red-700 dark:text-red-300"
                                  : "dark:text-dark-text-secondary text-gray-500",
                              ].join(" ")}
                            >
                              {details}
                            </div>
                          ) : null}

                          {result.availableGroups ? (
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <Badge variant="outline" size="sm">
                                {t("repairMissingKeys.coverage.groupsCovered", {
                                  covered: result.coveredGroups?.length ?? 0,
                                  total: result.availableGroups.length,
                                })}
                              </Badge>
                              {(result.createdGroups ?? []).map((group) => (
                                <Badge key={group} variant="success" size="sm">
                                  {getCoverageGroupLabel(
                                    t,
                                    "createdGroup",
                                    group,
                                  )}
                                </Badge>
                              ))}
                              {(result.missingGroups ?? []).map((group) => (
                                <Badge key={group} variant="warning" size="sm">
                                  {getCoverageGroupLabel(
                                    t,
                                    "missingGroup",
                                    group,
                                  )}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <DestructiveConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => void handleDeleteInvalidKeys()}
        title={t("repairMissingKeys.deleteConfirm.title", {
          count: selectedInvalidTokens.length,
        })}
        description={t("repairMissingKeys.deleteConfirm.description")}
        confirmLabel={t("repairMissingKeys.deleteConfirm.confirm")}
        cancelLabel={t("common:actions.cancel")}
        details={deleteConfirmDetails}
        isWorking={isDeletingInvalidKeys}
        size="md"
        confirmButtonTestId="repair-invalid-keys-confirm-delete"
      />
    </Modal>
  )
}
