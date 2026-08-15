import { KeyRound, Plus, SquarePen } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, EmptyState } from "~/components/ui"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type { ApiToken, DisplaySiteData } from "~/types"

import { OpenRouterKeyResourceItem } from "./OpenRouterKeyResourceItem"
import { RuntimeKeyItem } from "./RuntimeKeyItem"

interface KeyInventoryListProps {
  runtimeKeys: AccountRuntimeKey[]
  nativeKeyRows?: NativeKeyManagementRow[]
  expandedRuntimeKeys: Set<string>
  copiedRuntimeKeyId: string | null
  onToggleRuntimeKey: (id: string) => void
  onCopyKey: (runtimeKey: AccountRuntimeKey) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: (token: ApiToken, account: DisplaySiteData) => void
  canCreateDefaultKey?: boolean
  isCreating?: boolean
  createError?: string | null
  onCreateDefaultKey?: () => void
  onOpenAddTokenDialog?: () => void
  supportsApiTokenCreation?: boolean
}

/**
 * Renders legacy runtime keys and provider-native key inventory in one quick list.
 */
export function KeyInventoryList({
  runtimeKeys,
  nativeKeyRows = [],
  expandedRuntimeKeys,
  copiedRuntimeKeyId,
  onToggleRuntimeKey,
  onCopyKey,
  account,
  onOpenCCSwitchDialog,
  canCreateDefaultKey = false,
  isCreating = false,
  createError,
  onCreateDefaultKey,
  onOpenAddTokenDialog,
  supportsApiTokenCreation = false,
}: KeyInventoryListProps) {
  const { t } = useTranslation("ui")

  if (
    (!Array.isArray(runtimeKeys) || runtimeKeys.length === 0) &&
    nativeKeyRows.length === 0
  ) {
    const actions = supportsApiTokenCreation
      ? [
          ...(onCreateDefaultKey
            ? [
                {
                  label: t("dialog.copyKey.createKey"),
                  loadingLabel: t("dialog.copyKey.creatingKey"),
                  onClick: onCreateDefaultKey,
                  icon: <Plus className="h-4 w-4" />,
                  disabled: !canCreateDefaultKey || isCreating,
                  loading: isCreating,
                },
              ]
            : []),
          ...(onOpenAddTokenDialog
            ? [
                {
                  label: t("dialog.copyKey.createCustomKey"),
                  onClick: onOpenAddTokenDialog,
                  icon: <SquarePen className="h-4 w-4" />,
                  variant: "outline" as const,
                  disabled: !canCreateDefaultKey || isCreating,
                },
              ]
            : []),
        ]
      : []

    return (
      <div className="space-y-4">
        <EmptyState
          icon={<KeyRound className="h-12 w-12" />}
          title={t("dialog.copyKey.noKeys")}
          description={t("dialog.copyKey.noKeysDescription")}
          actions={actions}
        />
        {createError ? (
          <Alert variant="destructive" description={createError} />
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {runtimeKeys.map((runtimeKey) => (
        <RuntimeKeyItem
          key={runtimeKey.id}
          runtimeKey={runtimeKey}
          isExpanded={expandedRuntimeKeys.has(runtimeKey.id)}
          copiedRuntimeKeyId={copiedRuntimeKeyId}
          onToggle={() => onToggleRuntimeKey(runtimeKey.id)}
          onCopyKey={onCopyKey}
          account={account}
          onOpenCCSwitchDialog={onOpenCCSwitchDialog}
        />
      ))}
      {nativeKeyRows.map((row) => (
        <OpenRouterKeyResourceItem key={row.rowKey} row={row} />
      ))}
    </div>
  )
}
