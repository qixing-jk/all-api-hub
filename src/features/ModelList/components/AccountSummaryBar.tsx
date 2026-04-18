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
  isLoading?: boolean
  errorType?: ModelListAccountErrorType
}

interface AccountSummaryBarProps {
  items: AccountSummaryItem[]
  activeAccountIds?: string[]
  onAccountClick?: (accountId: string) => void
}

interface StatusPresentation {
  label: string
  className: string
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
      }
    }

    if (item.errorType === MODEL_LIST_ACCOUNT_ERROR_TYPES.INVALID_FORMAT) {
      return {
        label: t("accountSummary.incompatible"),
        className: "text-red-500 dark:text-red-400",
      }
    }

    return {
      label: t("accountSummary.models", { count: item.count }),
      className: "text-emerald-600 dark:text-emerald-400",
    }
  }

  return (
    <Card className="mb-4">
      <CardContent className="py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="dark:text-dark-text-secondary text-sm font-medium text-gray-700">
            {t("accountSummary.title")}
          </div>
          <div className="flex flex-wrap gap-2">
            {items.map((item) => {
              const statusPresentation = getStatusPresentation(item)

              return (
                <Badge
                  key={item.accountId}
                  variant={
                    activeAccountIdSet.has(item.accountId)
                      ? "info"
                      : "secondary"
                  }
                  size="default"
                  className="cursor-pointer"
                  onClick={() => onAccountClick?.(item.accountId)}
                >
                  <span className="truncate font-medium">{item.name}</span>
                  <span className={cn("ml-2", statusPresentation.className)}>
                    {statusPresentation.label}
                  </span>
                </Badge>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
