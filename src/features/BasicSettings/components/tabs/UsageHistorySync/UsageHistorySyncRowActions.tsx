import { Ellipsis } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
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
  const [isActionPending, setIsActionPending] = useState(false)
  const isActionPendingRef = useRef(false)

  const handleSync = async () => {
    if (isActionPendingRef.current) return

    isActionPendingRef.current = true
    setIsActionPending(true)
    try {
      await onSync(accountId)
    } finally {
      isActionPendingRef.current = false
      setIsActionPending(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          size="default"
          variant="ghost"
          className="h-8 w-8"
          aria-label={t("syncTab.table.rowActions")}
          disabled={isSyncing}
          loading={isActionPending}
        >
          <Ellipsis className="h-4 w-4" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() => void handleSync()}
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
