import { ShieldCheck } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  Modal,
  Spinner,
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
  AccountKeyRepairOutcome,
  AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"
import { onRuntimeMessage } from "~/utils/browser/browserApi"

import { RepairInvalidKeysDeleteConfirm } from "./RepairInvalidKeysDeleteConfirm"
import {
  getInvalidTokenKey,
  REPAIR_RESULT_VIEWS,
  type RepairResultView,
} from "./repairMissingKeysDialogHelpers"
import { RepairMissingKeysProgressCard } from "./RepairMissingKeysProgressCard"
import { RepairMissingKeysResultsPanel } from "./RepairMissingKeysResultsPanel"

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

  const accountIds = useMemo(() => {
    return new Set(accounts.map((account) => account.id))
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
          <RepairMissingKeysProgressCard
            progress={progress}
            isStarting={isStarting}
            onStartAudit={() => void handleStartAudit()}
            t={t}
          />

          <RepairMissingKeysResultsPanel
            accountIds={accountIds}
            activeView={activeView}
            deleteResultMessage={deleteResultMessage}
            filteredInvalidTokens={filteredInvalidTokens}
            filteredResults={filteredResults}
            invalidTokens={invalidTokens}
            openingSub2ApiAccountId={openingSub2ApiAccountId}
            outcomeCounts={outcomeCounts}
            outcomeFilter={outcomeFilter}
            searchTerm={searchTerm}
            selectedInvalidTokenKeys={selectedInvalidTokenKeys}
            selectedInvalidTokens={selectedInvalidTokens}
            visibleResults={visibleResults}
            onActiveViewChange={setActiveView}
            onOpenDeleteConfirm={() => setIsDeleteConfirmOpen(true)}
            onOpenSub2ApiTokenDialog={(accountId) =>
              void handleOpenSub2ApiTokenDialog(accountId)
            }
            onOutcomeFilterChange={setOutcomeFilter}
            onSearchTermChange={setSearchTerm}
            onSelectedInvalidTokenKeysChange={setSelectedInvalidTokenKeys}
            t={t}
          />
        </div>
      ) : null}

      <RepairInvalidKeysDeleteConfirm
        isOpen={isDeleteConfirmOpen}
        isWorking={isDeletingInvalidKeys}
        selectedInvalidTokens={selectedInvalidTokens}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => void handleDeleteInvalidKeys()}
        t={t}
      />
    </Modal>
  )
}
