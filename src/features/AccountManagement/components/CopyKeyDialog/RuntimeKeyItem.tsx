import { ChevronDown, ChevronRight, UsersRound } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { DeeplinkExportTarget } from "~/components/DeeplinkExportDialog"
import { Badge, Card, CardContent, IconButton } from "~/components/ui"
import { getCopyKeyDialogRuntimeKeyItemTestId } from "~/features/AccountManagement/testIds"
import {
  ACCOUNT_RUNTIME_KEY_STATUSES,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import type { CredentialExportSource } from "~/services/integrations/credentialExport"
import type { DisplaySiteData } from "~/types"

import { RuntimeKeyDetails } from "./RuntimeKeyDetails"

interface RuntimeKeyItemProps {
  runtimeKey: AccountRuntimeKey
  isExpanded: boolean
  copiedRuntimeKeyId: string | null
  onToggle: () => void
  onCopyKey: (runtimeKey: AccountRuntimeKey) => void
  account: DisplaySiteData
  onOpenDeeplinkExport?: (
    target: DeeplinkExportTarget,
    source: CredentialExportSource,
  ) => void
}

/**
 * Collapsible card for a single runtime key showing group, status, and expanded details.
 */
export function RuntimeKeyItem({
  runtimeKey,
  isExpanded,
  copiedRuntimeKeyId,
  onToggle,
  onCopyKey,
  account,
  onOpenDeeplinkExport,
}: RuntimeKeyItemProps) {
  const { t } = useTranslation("ui")

  const isActive = runtimeKey.status === ACCOUNT_RUNTIME_KEY_STATUSES.Active

  return (
    <Card variant="interactive" padding="none">
      <CardContent
        padding="sm"
        data-expanded={isExpanded}
        className="dark:hover:bg-secondary hover:bg-surface-subtle cursor-pointer rounded-[var(--corner-inner-radius)] transition-colors data-[expanded=true]:rounded-b-none"
        onClick={onToggle}
        data-testid={getCopyKeyDialogRuntimeKeyItemTestId(runtimeKey.id)}
      >
        <div className="flex items-center justify-between">
          <div className="space-y-density-1-5 min-w-0 flex-1">
            <h4 className="text-foreground truncate text-sm font-medium">
              {runtimeKey.label}
            </h4>
            <div className="flex items-center space-x-1.5">
              <UsersRound className="text-faint-foreground h-3 w-3" />
              <Badge variant="secondary" size="sm">
                {t("dialog.copyKey.defaultGroup")}
              </Badge>
            </div>
          </div>

          <div className="ml-3 flex items-center space-x-2">
            <Badge variant={isActive ? "success" : "secondary"} size="sm">
              {isActive
                ? t("dialog.copyKey.enabled")
                : t("dialog.copyKey.disabled")}
            </Badge>

            <IconButton
              variant="ghost"
              size="sm"
              aria-label={
                isExpanded ? t("dialog.collapse") : t("dialog.expand")
              }
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </IconButton>
          </div>
        </div>
      </CardContent>

      {isExpanded && (
        <RuntimeKeyDetails
          runtimeKey={runtimeKey}
          copiedRuntimeKeyId={copiedRuntimeKeyId}
          onCopyKey={onCopyKey}
          account={account}
          onOpenDeeplinkExport={onOpenDeeplinkExport}
        />
      )}
    </Card>
  )
}
