import { ChevronDown } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge, Card, CardContent } from "~/components/ui"
import {
  MODEL_LIST_ACCOUNT_ERROR_TYPES,
  type ModelListAccountErrorType,
} from "~/features/ModelList/modelDataStates"
import { cn } from "~/lib/utils"

interface AccountSummaryItem {
  accountId: string
  name: string
  count: number
  /** Whether the query retains data, independent of the current model filters. */
  hasData?: boolean
  isLoading?: boolean
  errorType?: ModelListAccountErrorType
  errorMessage?: string
}

interface AccountSummaryBarProps {
  items: AccountSummaryItem[]
  activeAccountIds?: string[]
  onAccountClick?: (accountId: string) => void
}

interface StatusPresentation {
  label: string
  className: string
  title?: string
}

/** Renders one account filter and owns its status presentation. */
function AccountSummaryBadge({
  item,
  isActive,
  onAccountClick,
}: {
  item: AccountSummaryItem
  isActive: boolean
  onAccountClick: AccountSummaryBarProps["onAccountClick"]
}) {
  const { t } = useTranslation("modelList")

  const getStatusPresentation = (
    item: AccountSummaryItem,
  ): StatusPresentation => {
    if (item.isLoading) {
      return {
        label: t("accountSummary.loading"),
        className: "text-amber-600 dark:text-amber-300",
      }
    }

    if (item.errorType === MODEL_LIST_ACCOUNT_ERROR_TYPES.LOAD_FAILED) {
      return {
        label: t("accountSummary.loadFailed"),
        className: "text-red-500 dark:text-red-400",
        title: item.errorMessage,
      }
    }

    if (item.errorType === MODEL_LIST_ACCOUNT_ERROR_TYPES.INVALID_FORMAT) {
      return {
        label: t("accountSummary.incompatible"),
        className: "text-red-500 dark:text-red-400",
        title: item.errorMessage,
      }
    }

    if (item.errorType === MODEL_LIST_ACCOUNT_ERROR_TYPES.UNSUPPORTED_SOURCE) {
      return {
        label: t("accountSummary.unsupported"),
        className: "text-blue-600 dark:text-blue-300",
        title: item.errorMessage,
      }
    }

    if (item.errorType === MODEL_LIST_ACCOUNT_ERROR_TYPES.PARTIAL_LOAD_FAILED) {
      return {
        label: t("accountSummary.partialLoadFailed"),
        className: "text-amber-600 dark:text-amber-300",
        title: item.errorMessage,
      }
    }

    return {
      label: t("accountSummary.models", { count: item.count }),
      className: "text-emerald-600 dark:text-emerald-400",
    }
  }

  const statusPresentation = getStatusPresentation(item)

  return (
    <Badge
      asChild
      variant={isActive ? "info" : "secondary"}
      size="default"
      className="cursor-pointer"
      title={statusPresentation.title}
      aria-label={
        statusPresentation.title
          ? `${item.name} ${statusPresentation.label} ${statusPresentation.title}`
          : undefined
      }
    >
      <button
        type="button"
        aria-pressed={isActive}
        onClick={() => onAccountClick?.(item.accountId)}
      >
        <span className="truncate font-medium">{item.name}</span>
        <span className={cn("ml-2", statusPresentation.className)}>
          {statusPresentation.label}
        </span>
      </button>
    </Badge>
  )
}

/**
 * Shows clickable badges summarizing model counts per account.
 * @param props Component props.
 * @param props.items Accounts with model counts and error states.
 * @param props.activeAccountIds Currently highlighted account ids.
 * @param props.onAccountClick Callback when a badge is clicked.
 * @returns Card containing account summary badges or null when empty.
 */
export function AccountSummaryBar({
  items,
  activeAccountIds = [],
  onAccountClick,
}: AccountSummaryBarProps) {
  const { t } = useTranslation("modelList")
  const [isExpanded, setIsExpanded] = useState(false)
  const failureRegionId = useId()
  const activeAccountIdSet = new Set(activeAccountIds)

  if (!items || items.length === 0) {
    return null
  }

  const isUnavailable = (item: AccountSummaryItem) =>
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

  /** Uses the same account control in both visible and expanded groups. */
  const renderAccountBadge = (item: AccountSummaryItem) => (
    <AccountSummaryBadge
      key={item.accountId}
      item={item}
      isActive={activeAccountIdSet.has(item.accountId)}
      onAccountClick={onAccountClick}
    />
  )

  return (
    <Card className="mb-4">
      <CardContent className="py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="dark:text-dark-text-secondary text-sm font-medium text-gray-700">
            {t("accountSummary.title")}
          </div>
          <div className="flex flex-wrap gap-2">
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
                    className={cn(isExpanded && "rotate-180")}
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
                <div className="flex flex-wrap gap-2">
                  {foldedItems.map(renderAccountBadge)}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
