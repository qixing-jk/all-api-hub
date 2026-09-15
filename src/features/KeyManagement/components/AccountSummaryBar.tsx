import { useTranslation } from "react-i18next"

import { Badge, Card, CardContent } from "~/components/ui"

import type { KeyManagementAccountSummaryItem } from "../types"

interface AccountSummaryBarProps {
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
}: AccountSummaryBarProps) {
  const { t } = useTranslation("keyManagement")
  const activeAccountIdSet = new Set(activeAccountIds)

  if (!items || items.length === 0) {
    return null
  }

  return (
    <Card className="mb-4">
      <CardContent className="py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-secondary-foreground text-sm font-medium">
            {t("accountSummary.title")}
          </div>
          <div className="flex flex-wrap gap-2">
            {items.map((item) => {
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

              return (
                <Badge
                  key={item.accountId}
                  variant={isActive ? "default" : "secondary"}
                  size="default"
                  {...(onAccountClick
                    ? {
                        className: "cursor-pointer",
                        onClick: () => onAccountClick(item.accountId),
                      }
                    : {})}
                >
                  <span className="truncate font-medium">{item.name}</span>
                  {countLabel ? (
                    <span className="text-muted-foreground ml-2">
                      {countLabel}
                    </span>
                  ) : null}
                  {item.errorType && (
                    <span className="text-destructive-text ml-2 text-xs">
                      {item.errorType === "unsupported"
                        ? t("accountSummary.unsupported")
                        : t("accountSummary.loadFailed")}
                    </span>
                  )}
                </Badge>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
