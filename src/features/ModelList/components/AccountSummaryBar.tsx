import { useTranslation } from "react-i18next"

import { Badge, Card, CardContent } from "~/components/ui"

interface AccountSummaryItem {
  accountId: string
  name: string
  count: number
  errorType?: "invalid-format" | "load-failed"
}

interface AccountSummaryBarProps {
  items: AccountSummaryItem[]
  activeAccountId?: string | null
  onAccountClick?: (accountId: string) => void
}

/**
 * Shows clickable badges summarizing model counts per account.
 * @param props Component props.
 * @param props.items Accounts with model counts and error states.
 * @param props.activeAccountId Currently highlighted account id.
 * @param props.onAccountClick Callback when a badge is clicked.
 * @returns Card containing account summary badges or null when empty.
 */
export function AccountSummaryBar({
  items,
  activeAccountId,
  onAccountClick,
}: AccountSummaryBarProps) {
  const { t } = useTranslation("modelList")

  if (!items || items.length === 0) {
    return null
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
                  activeAccountId && activeAccountId === item.accountId
                    ? "info"
                    : "secondary"
                }
                size="default"
                className="cursor-pointer"
                onClick={() => onAccountClick?.(item.accountId)}
              >
                <span className="truncate font-medium">{item.name}</span>
                <span className="dark:text-dark-text-tertiary ml-2 text-gray-500">
                  {t("accountSummary.models", { count: item.count })}
                </span>
                {item.errorType && (
                  <span className="ml-2 text-xs text-red-500 dark:text-red-400">
                    {item.errorType === "load-failed"
                      ? t("accountSummary.loadFailed")
                      : t("accountSummary.incompatible")}
                  </span>
                )}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
