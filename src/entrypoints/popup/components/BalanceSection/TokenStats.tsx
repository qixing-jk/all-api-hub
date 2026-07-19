import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/24/outline"
import React from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { BodySmall } from "~/components/ui"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import {
  formatTokenCount,
  getTodayMetricPresentation,
} from "~/utils/core/formatters"

export const TokenStats = React.memo(() => {
  const { t } = useTranslation("account")
  const { stats } = useAccountDataContext()
  const todayTokens = stats
  const todayTotalPromptTokens = todayTokens.today_total_prompt_tokens
  const todayTotalCompletionTokens = todayTokens.today_total_completion_tokens
  const coverage = stats.todayStatsCoverage.tokens
  const presentation = getTodayMetricPresentation(
    todayTotalPromptTokens + todayTotalCompletionTokens,
    coverage,
  )

  if (presentation.value === null) {
    const unavailableLabel = t(
      presentation.requiresRefresh
        ? "todayMetricAvailability.pendingRefreshHelp"
        : "todayMetricAvailability.unavailable",
    )
    if (presentation.requiresRefresh) {
      return (
        <Tooltip content={unavailableLabel}>
          <BodySmall
            weight="medium"
            role="status"
            aria-label={unavailableLabel}
            className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            tabIndex={0}
          >
            <span aria-hidden="true">
              {t("todayMetricAvailability.pendingRefresh")}
            </span>
          </BodySmall>
        </Tooltip>
      )
    }
    return (
      <BodySmall weight="medium" role="status" aria-label={unavailableLabel}>
        <span aria-hidden="true">—</span>
      </BodySmall>
    )
  }

  if (coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial) {
    const totalText = formatTokenCount(presentation.value)
    const qualifier =
      coverage.legacyUnclassifiedCount > 0
        ? t("todayMetricAvailability.includesPendingRefresh")
        : undefined
    const coverageLabel = t(
      coverage.legacyUnclassifiedCount > 0
        ? "todayMetricAvailability.coverageWithRefresh"
        : "todayMetricAvailability.coverage",
      {
        complete: coverage.completeCount,
        partial: coverage.partialCount,
        refresh: coverage.legacyUnclassifiedCount,
        eligible: coverage.eligibleCount,
      },
    )
    return (
      <Tooltip content={coverageLabel}>
        <BodySmall
          weight="medium"
          className="cursor-help rounded-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={[totalText, qualifier, coverageLabel]
            .filter(Boolean)
            .join(". ")}
          tabIndex={0}
        >
          {totalText}
          {qualifier ? (
            <span className="dark:text-dark-text-tertiary ml-1.5 text-[10px] font-medium text-gray-500">
              {qualifier}
            </span>
          ) : null}
        </BodySmall>
      </Tooltip>
    )
  }

  const promptLabel = t("stats.prompt")
  const completionLabel = t("stats.completion")
  const tokenLabel = t("common:labels.token")
  const promptTokens = todayTotalPromptTokens.toLocaleString()
  const completionTokens = todayTotalCompletionTokens.toLocaleString()
  const completeBreakdownLabel = `${promptLabel}: ${promptTokens} ${tokenLabel}; ${completionLabel}: ${completionTokens} ${tokenLabel}`

  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <div>
            {promptLabel}: {promptTokens} {tokenLabel}
          </div>
          <div>
            {completionLabel}: {completionTokens} {tokenLabel}
          </div>
        </div>
      }
      anchorAsChild
    >
      <div
        className="flex cursor-help items-center justify-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        role="group"
        tabIndex={0}
        aria-label={completeBreakdownLabel}
      >
        <div className="flex items-center gap-1">
          <ArrowUpIcon className="h-4 w-4 text-green-500" />
          <BodySmall weight="medium">
            {formatTokenCount(todayTokens.today_total_prompt_tokens)}
          </BodySmall>
        </div>
        <div className="flex items-center gap-1">
          <ArrowDownIcon className="h-4 w-4 text-blue-500" />
          <BodySmall weight="medium">
            {formatTokenCount(todayTokens.today_total_completion_tokens)}
          </BodySmall>
        </div>
      </div>
    </Tooltip>
  )
})
