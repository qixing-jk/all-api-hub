import { Ellipsis } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"

interface UsageHistorySyncRowActionsProps {
  accountId: string
  isSyncing: boolean
  onSync: (accountId: string) => void | Promise<void>
}

/**
 * Row-level actions for the usage-history sync state table.
 */
export default function UsageHistorySyncRowActions({
  accountId,
  isSyncing,
  onSync,
}: UsageHistorySyncRowActionsProps) {
  const { t } = useTranslation("usageAnalytics")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label={t("syncTab.table.rowActions")}
          disabled={isSyncing}
        >
          <Ellipsis className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() => void onSync(accountId)}
          disabled={isSyncing}
        >
          {isSyncing
            ? t("syncTab.actions.syncing")
            : t("syncTab.actions.syncAccount")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
