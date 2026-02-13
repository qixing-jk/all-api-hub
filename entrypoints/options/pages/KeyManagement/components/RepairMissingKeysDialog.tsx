import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Modal,
  Spinner,
  TagFilter,
} from "~/components/ui"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ACCOUNT_KEY_REPAIR_PROGRESS_MESSAGE_TYPE } from "~/services/accountKeyAutoProvisioning"
import type { DisplaySiteData } from "~/types"
import type {
  AccountKeyRepairOutcome,
  AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import { onRuntimeMessage, sendRuntimeActionMessage } from "~/utils/browserApi"

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
  t: (key: string, options?: any) => string,
  reason: string | undefined,
) {
  if (!reason) return ""
  return t(`repairMissingKeys.skipReasons.${reason}`)
}

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"]

const OUTCOME_BADGE_VARIANTS: Record<AccountKeyRepairOutcome, BadgeVariant> = {
  created: "success",
  alreadyHad: "info",
  skipped: "warning",
  failed: "danger",
}

/**
 * Modal dialog showing the background progress of the "ensure at least one key" job.
 */
export function RepairMissingKeysDialog(props: RepairMissingKeysDialogProps) {
  const { isOpen, onClose, accounts, startOnOpen } = props
  const { t } = useTranslation(["keyManagement", "common"])

  const [progress, setProgress] = useState<AccountKeyRepairProgress | null>(
    null,
  )
  const [error, setError] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  const [outcomeFilter, setOutcomeFilter] =
    useState<AccountKeyRepairOutcome | null>(null)

  const disabledAccountIds = useMemo(() => {
    return new Set(
      accounts.filter((account) => account.disabled).map((a) => a.id),
    )
  }, [accounts])

  const visibleResults = useMemo(() => {
    if (!progress) return []
    return progress.results.filter(
      (result) => !disabledAccountIds.has(result.accountId),
    )
  }, [disabledAccountIds, progress])

  /**
   * Filters visible repair results by free-text search and an optional outcome filter.
   * Search matches account name, site origin, and site type (case-insensitive).
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
      return (
        result.accountName.toLowerCase().includes(keyword) ||
        result.siteUrlOrigin.toLowerCase().includes(keyword) ||
        result.siteType.toLowerCase().includes(keyword)
      )
    })
  }, [outcomeFilter, searchTerm, visibleResults])

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
  const processedTotal = progress?.totals.processedAccounts ?? 0
  const progressMax = Math.max(1, eligibleTotal)

  const progressPercent = useMemo(() => {
    if (eligibleTotal <= 0) return 0
    return Math.min(100, Math.round((processedTotal / eligibleTotal) * 100))
  }, [eligibleTotal, processedTotal])

  const progressBarColor = useMemo(() => {
    if (!progress) {
      return "bg-blue-600 dark:bg-blue-500"
    }
    if (progress.state === "failed") {
      return "bg-red-600 dark:bg-red-500"
    }
    if (progress.state === "completed" && progress.summary.failed > 0) {
      return "bg-amber-600 dark:bg-amber-500"
    }
    if (progress.state === "completed") {
      return "bg-emerald-600 dark:bg-emerald-500"
    }
    return "bg-blue-600 dark:bg-blue-500"
  }, [progress])

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("")
      setOutcomeFilter(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    return onRuntimeMessage((message) => {
      if (message?.type !== ACCOUNT_KEY_REPAIR_PROGRESS_MESSAGE_TYPE) return
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
        const response = await sendRuntimeActionMessage({
          action: RuntimeActionIds.AccountKeyRepairGetProgress,
        })
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

    let cancelled = false

    void (async () => {
      try {
        const response = await sendRuntimeActionMessage({
          action: RuntimeActionIds.AccountKeyRepairStart,
        })
        if (cancelled) return
        if (response?.success && response.data) {
          setProgress(response.data)
        } else {
          setError(t("repairMissingKeys.messages.startFailed"))
        }
      } catch {
        if (!cancelled) {
          setError(t("repairMissingKeys.messages.startFailed"))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, startOnOpen, t])

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
            {progress?.state === "running" ? (
              <Badge
                variant="info"
                size="sm"
                className="shrink-0 border-transparent"
              >
                <Spinner size="sm" className="h-3.5 w-3.5" />
                {t("common:status.processing")}
              </Badge>
            ) : progress?.state === "failed" ? (
              <Badge
                variant="danger"
                size="sm"
                className="shrink-0 border-transparent"
              >
                {t("common:status.failed")}
              </Badge>
            ) : progress?.state === "completed" ? (
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

      {progress ? (
        <div className="space-y-4">
          <Card>
            <CardContent padding="md" spacing="none" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <span>{t("repairMissingKeys.progressLabel")}</span>
                  <span>
                    {processedTotal}/{eligibleTotal} ({progressPercent}%)
                  </span>
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
                    {progress.totals.processedAccounts}
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

          <Card>
            <CardHeader
              padding="sm"
              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">
                  {t("repairMissingKeys.resultsTitle")}
                </CardTitle>
                <Badge
                  variant="outline"
                  size="sm"
                  className="border-transparent"
                >
                  {filteredResults.length}/{visibleResults.length}
                </Badge>
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

            <CardContent
              padding="sm"
              spacing="none"
              className="dark:border-dark-bg-tertiary border-b border-gray-200"
            >
              <div className="space-y-2">
                <div>
                  <Label className="text-sm font-medium">
                    {t("repairMissingKeys.outcomeLabel")}
                  </Label>
                </div>
                <TagFilter
                  mode="single"
                  value={outcomeFilter}
                  onChange={(value) =>
                    setOutcomeFilter(value as AccountKeyRepairOutcome | null)
                  }
                  allCount={visibleResults.length}
                  options={[
                    {
                      value: "created",
                      label: t("repairMissingKeys.outcomes.created"),
                      count: outcomeCounts.created,
                      variant: "success",
                    },
                    {
                      value: "alreadyHad",
                      label: t("repairMissingKeys.outcomes.alreadyHad"),
                      count: outcomeCounts.alreadyHad,
                      variant: "info",
                    },
                    {
                      value: "skipped",
                      label: t("repairMissingKeys.outcomes.skipped"),
                      count: outcomeCounts.skipped,
                      variant: "warning",
                    },
                    {
                      value: "failed",
                      label: t("repairMissingKeys.outcomes.failed"),
                      count: outcomeCounts.failed,
                      variant: "danger",
                    },
                  ]}
                />
              </div>
            </CardContent>

            <CardContent padding="none" spacing="none">
              <div className="max-h-72 overflow-y-auto">
                {filteredResults.length === 0 ? (
                  <EmptyState
                    icon={<MagnifyingGlassIcon className="h-12 w-12" />}
                    title={t("repairMissingKeys.noMatchingResults")}
                    className="py-10"
                  />
                ) : (
                  <ul className="dark:divide-dark-bg-tertiary divide-y">
                    {filteredResults.map((result) => {
                      const outcomeLabel = t(
                        `repairMissingKeys.outcomes.${result.outcome}`,
                      )
                      const details =
                        result.outcome === "skipped"
                          ? getSkipReasonLabel(t, result.skipReason)
                          : result.outcome === "failed"
                            ? result.errorMessage || ""
                            : ""

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

                          {details ? (
                            <div
                              className={[
                                "mt-2 text-xs",
                                result.outcome === "failed"
                                  ? "text-red-700 dark:text-red-300"
                                  : "dark:text-dark-text-secondary text-gray-500",
                              ].join(" ")}
                            >
                              {details}
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
      ) : (
        <div className="dark:text-dark-text-secondary flex items-center justify-center gap-3 py-10 text-sm text-gray-500">
          <Spinner size="sm" />
          {t("common:status.loading")}
        </div>
      )}
    </Modal>
  )
}
