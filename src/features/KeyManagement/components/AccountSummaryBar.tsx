import { ChevronDown } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge, Button, Card, CardContent } from "~/components/ui"

import type { KeyManagementAccountSummaryItem } from "../types"

interface AccountSummaryBarProps {
  tokenLoadProgress?: {
    total: number
    loaded: number
    loading: number
    error: number
  } | null
  failedAccounts?: Array<{ accountId: string; accountName: string }>
  onRetryFailedAccounts?: () => void
  items: KeyManagementAccountSummaryItem[]
  activeAccountIds?: string[]
  onAccountClick?: (accountId: string) => void
}

/**
 * Shows clickable badges summarizing key counts per account in "All accounts" mode.
 */
export function AccountSummaryBar({
  items,
  activeAccountIds = [],
  onAccountClick,
  tokenLoadProgress,
  failedAccounts = [],
  onRetryFailedAccounts,
}: AccountSummaryBarProps) {
  const { t } = useTranslation("keyManagement")
  const [isExpanded, setIsExpanded] = useState(false)
  const failureRegionId = useId()
  const activeAccountIdSet = new Set(activeAccountIds)
  if (!items || items.length === 0) {
    return null
  }
  const isUnavailable = (item: KeyManagementAccountSummaryItem) =>
    !item.isLoading && item.hasData === false && Boolean(item.errorType)
  const allUnavailable = items.every(isUnavailable)
  const foldedItems = items.filter(
    (item) =>
      !allUnavailable &&
      isUnavailable(item) &&
      !activeAccountIdSet.has(item.accountId),
  )
  const foldedIds = new Set(foldedItems.map((item) => item.accountId))
  const visibleItems = items.filter((item) => !foldedIds.has(item.accountId))
  const renderAccountBadge = (item: KeyManagementAccountSummaryItem) => {
    const isActive = activeAccountIdSet.has(item.accountId)
    const shouldHideUnknownCount =
      Boolean(item.errorType) &&
      item.count === 0 &&
      item.knownCount === undefined
    const countLabel = shouldHideUnknownCount
      ? null
      : item.count !== null
        ? t("accountSummary.keys", { count: item.count })
        : item.knownCount !== undefined
          ? t("knownTotalKeys", {
              count: item.knownCount,
            })
          : null
    const hasData = item.hasData ?? (item.knownCount ?? item.count ?? 0) > 0
    const statusLabel = item.isLoading
      ? t("accountSummary.loading")
      : item.errorType === "unsupported"
        ? t("accountSummary.unsupported")
        : item.errorType
          ? hasData
            ? t("accountSummary.partialLoadFailed")
            : t("accountSummary.loadFailed")
          : null
    const content = (
      <>
        <span className="truncate font-medium">{item.name}</span>
        {countLabel ? (
          <span className="text-muted-foreground ml-2 shrink-0">
            {countLabel}
          </span>
        ) : null}
        {statusLabel && (
          <span
            className={`ml-2 shrink-0 text-xs ${item.isLoading || (hasData && item.errorType === "load-failed") ? "text-warning-text" : item.errorType === "unsupported" ? "text-info-text" : "text-destructive-text"}`}
          >
            {statusLabel}
          </span>
        )}
      </>
    )
    return onAccountClick ? (
      <Badge
        key={item.accountId}
        asChild
        variant={isActive ? "default" : "secondary"}
        size="default"
        title={item.isLoading ? undefined : item.errorMessage}
      >
        <button
          type="button"
          className="min-h-(--density-control-xs) max-w-full cursor-pointer"
          aria-pressed={isActive}
          onClick={() => onAccountClick(item.accountId)}
        >
          {content}
        </button>
      </Badge>
    ) : (
      <Badge
        key={item.accountId}
        variant={isActive ? "default" : "secondary"}
        size="default"
        title={item.isLoading ? undefined : item.errorMessage}
      >
        {content}
      </Badge>
    )
  }
  return (
    <Card className="mb-density-4">
      <CardContent className="py-density-3">
        <div className="gap-y-density-2 flex flex-col gap-x-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-secondary-foreground text-sm font-medium">
            {t("accountSummary.title")}
          </div>
          <div className="gap-y-density-2 flex flex-wrap gap-x-2">
            {visibleItems.map(renderAccountBadge)}
            {foldedItems.length > 0 && (
              <Badge asChild variant="secondary">
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={failureRegionId}
                  onClick={() => setIsExpanded((expanded) => !expanded)}
                >
                  {t("accountSummary.unavailableAccounts", {
                    count: foldedItems.length,
                  })}
                  <ChevronDown
                    aria-hidden="true"
                    className={isExpanded ? "rotate-180" : undefined}
                  />
                </button>
              </Badge>
            )}
            <div
              id={failureRegionId}
              hidden={!isExpanded || foldedItems.length === 0}
              className="w-full"
            >
              {isExpanded && foldedItems.length > 0 && (
                <div className="gap-y-density-2 flex flex-wrap gap-x-2">
                  {foldedItems.map(renderAccountBadge)}
                </div>
              )}
            </div>
          </div>
        </div>
        {(Boolean(tokenLoadProgress?.loading) || failedAccounts.length > 0) && (
          <div className="gap-y-density-2 flex flex-wrap items-center justify-between gap-x-2 text-sm">
            {Boolean(tokenLoadProgress?.loading) && tokenLoadProgress && (
              <span className="text-muted-foreground" role="status">
                {t("allAccountsProgress", {
                  completed: tokenLoadProgress.loaded + tokenLoadProgress.error,
                  total: tokenLoadProgress.total,
                })}
                {` · ${t("allAccountsLoading", { count: tokenLoadProgress.loading })}`}
              </span>
            )}
            {failedAccounts.length > 0 && (
              <div className="gap-y-density-2 flex flex-wrap items-center gap-x-2">
                <Badge
                  variant="warning"
                  size="sm"
                  title={failedAccounts
                    .map((account) => account.accountName)
                    .join(", ")}
                >
                  {t("allAccountsFailed", { count: failedAccounts.length })}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={onRetryFailedAccounts}
                  disabled={!onRetryFailedAccounts}
                >
                  {t("actions.retryFailed")}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
