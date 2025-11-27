import {
  ChevronDownIcon,
  ChevronRightIcon,
  UserGroupIcon
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Badge, Card, CardContent, IconButton } from "~/components/ui"
import type { ApiToken, DisplaySiteData } from "~/types"
import { getGroupBadgeStyle, getStatusBadgeStyle } from "~/utils/formatters"

import { TokenDetails } from "./TokenDetails"

interface TokenItemProps {
  token: ApiToken
  isExpanded: boolean
  copiedKey: string | null
  onToggle: () => void
  onCopyKey: (key: string) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: (token: ApiToken, account: DisplaySiteData) => void
}

export function TokenItem({
  token,
  isExpanded,
  copiedKey,
  onToggle,
  onCopyKey,
  account,
  onOpenCCSwitchDialog
}: TokenItemProps) {
  const { t } = useTranslation("ui")

  return (
    <Card variant="interactive" padding="none">
      <CardContent
        padding="sm"
        className="dark:hover:bg-dark-bg-tertiary cursor-pointer transition-colors hover:bg-gray-50"
        onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h4 className="dark:text-dark-text-primary truncate text-sm font-medium text-gray-900">
              {token.name}
            </h4>
            <div className="flex items-center space-x-1.5">
              <UserGroupIcon className="h-3 w-3 text-gray-400 dark:text-gray-500" />
              <Badge
                variant="outline"
                size="sm"
                className={getGroupBadgeStyle(token.group || "")}>
                {token.group || t("dialog.copyKey.defaultGroup")}
              </Badge>
            </div>
          </div>

          <div className="ml-3 flex items-center space-x-2">
            <Badge
              variant={token.status === 1 ? "success" : "secondary"}
              size="sm"
              className={getStatusBadgeStyle(token.status)}>
              {token.status === 1
                ? t("dialog.copyKey.enabled")
                : t("dialog.copyKey.disabled")}
            </Badge>

            <IconButton
              variant="ghost"
              size="sm"
              aria-label={
                isExpanded ? t("dialog.collapse") : t("dialog.expand")
              }>
              {isExpanded ? (
                <ChevronDownIcon className="h-4 w-4" />
              ) : (
                <ChevronRightIcon className="h-4 w-4" />
              )}
            </IconButton>
          </div>
        </div>
      </CardContent>

      {isExpanded && (
        <TokenDetails
          token={token}
          copiedKey={copiedKey}
          onCopyKey={onCopyKey}
          account={account}
          onOpenCCSwitchDialog={onOpenCCSwitchDialog}
        />
      )}
    </Card>
  )
}
