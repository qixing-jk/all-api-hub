import { useTranslation } from "react-i18next"

import { Badge, Card, CardContent } from "~/components/ui"
import { cn } from "~/lib/utils"

interface AccountSummaryItem {
  accountId: string
  name: string
  count: number
  isLoading?: boolean
  errorType?: "invalid-format" | "load-failed"
}

interface AccountSummaryBarProps {
  items: AccountSummaryItem[]
  activeAccountIds?: string[]
  onAccountClick?: (accountId: string) => void
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
  const activeAccountIdSet = new Set(activeAccountIds)

  if (!items || items.length === 0) {
    return null
  }

  const renderStatus = (item: AccountSummaryItem) => {
    if (item.isLoading) {
      return t("accountSummary.loading")
    }

    if (item.errorType === "load-failed") {
      return t("accountSummary.loadFailed")
    }

    if (item.errorType === "invalid-format") {
      return t("accountSummary.incompatible")
    }

    return t("accountSummary.models", { count: item.count })
  }

  const getStatusClassName = (item: AccountSummaryItem) => {
    if (item.isLoading) {
      return "text-amber-600 dark:text-amber-300"
    }

    if (item.errorType) {
      return "text-red-500 dark:text-red-400"
    }

    return "text-emerald-600 dark:text-emerald-400"
  }

  return (
    <Card className="mb-4">
      <CardContent className="py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="dark:text-dark-text-secondary text-sm font-medium text-gray-700">
            {t("accountSummary.title")}
          </div>
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <Badge
                key={item.accountId}
                variant={
                  activeAccountIdSet.has(item.accountId) ? "info" : "secondary"
                }
                size="default"
                className="cursor-pointer"
                onClick={() => onAccountClick?.(item.accountId)}
              >
                <span className="truncate font-medium">{item.name}</span>
                <span className={cn("ml-2", getStatusClassName(item))}>
                  {renderStatus(item)}
                </span>
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
