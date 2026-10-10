import { KeyRound, Plus, SquarePen } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, EmptyState } from "~/components/ui"
import type { DeeplinkExportTarget } from "~/features/CredentialExport/DeeplinkExportDialog"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import type { AccountRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import type { CredentialExportSource } from "~/services/integrations/credentialExport"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

import { AccountKeyResourceItem } from "./AccountKeyResourceItem"
import { RuntimeKeyItem } from "./RuntimeKeyItem"

export type KeyEditorAction = "default" | "custom"

interface KeyInventoryListProps {
  getCredentialProfile?: (
    row: NativeKeyManagementRow,
  ) => ApiCredentialProfile | undefined
  runtimeKeys: AccountRuntimeKey[]
  nativeKeyRows?: NativeKeyManagementRow[]
  expandedRuntimeKeys: Set<string>
  copiedRuntimeKeyId: string | null
  onToggleRuntimeKey: (id: string) => void
  onCopyKey: (runtimeKey: AccountRuntimeKey) => void
  account: DisplaySiteData
  onOpenDeeplinkExport?: (
    target: DeeplinkExportTarget,
    source: CredentialExportSource,
  ) => void
  canCreateDefaultKey?: boolean
  isCreating?: boolean
  openingEditorAction?: KeyEditorAction | null
  createError?: string | null
  onCreateDefaultKey?: () => void
  onOpenAddTokenDialog?: () => void
  supportsApiTokenCreation?: boolean
}

/**
 * Renders service credentials and provider-native key inventory in one quick list.
 */
export function KeyInventoryList({
  runtimeKeys,
  nativeKeyRows = [],
  getCredentialProfile,
  expandedRuntimeKeys,
  copiedRuntimeKeyId,
  onToggleRuntimeKey,
  onCopyKey,
  account,
  onOpenDeeplinkExport,
  canCreateDefaultKey = false,
  isCreating = false,
  openingEditorAction = null,
  createError,
  onCreateDefaultKey,
  onOpenAddTokenDialog,
  supportsApiTokenCreation = false,
}: KeyInventoryListProps) {
  const { t } = useTranslation(["ui", "keyManagement"])
  const isOpeningEditor = openingEditorAction !== null

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
                  loadingLabel:
                    openingEditorAction === "default"
                      ? t("keyManagement:native.editor.opening.loading")
                      : t("ui:dialog.copyKey.creatingKey"),
                  onClick: onCreateDefaultKey,
                  icon: <Plus className="h-4 w-4" />,
                  disabled:
                    !canCreateDefaultKey || isCreating || isOpeningEditor,
                  loading: isCreating || openingEditorAction === "default",
                },
              ]
            : []),
          ...(onOpenAddTokenDialog
            ? [
                {
                  label: t("dialog.copyKey.createCustomKey"),
                  loadingLabel: t(
                    "keyManagement:native.editor.opening.loading",
                  ),
                  loading: openingEditorAction === "custom",
                  onClick: onOpenAddTokenDialog,
                  icon: <SquarePen className="h-4 w-4" />,
                  variant: "outline" as const,
                  disabled:
                    !canCreateDefaultKey || isCreating || isOpeningEditor,
                },
              ]
            : []),
        ]
      : []

    return (
      <div className="space-y-density-4">
        {createError ? (
          <Alert compact variant="destructive" description={createError} />
        ) : null}
        <EmptyState
          className="py-density-6"
          icon={<KeyRound className="h-12 w-12" />}
          title={t("dialog.copyKey.noKeys")}
          description={t("dialog.copyKey.noKeysDescription")}
          actions={actions}
        />
      </div>
    )
  }

  return (
    <div className="space-y-density-3">
      {createError ? (
        <Alert variant="destructive" description={createError} />
      ) : null}
      {runtimeKeys.map((runtimeKey) => (
        <RuntimeKeyItem
          key={runtimeKey.id}
          runtimeKey={runtimeKey}
          isExpanded={expandedRuntimeKeys.has(runtimeKey.id)}
          copiedRuntimeKeyId={copiedRuntimeKeyId}
          onToggle={() => onToggleRuntimeKey(runtimeKey.id)}
          onCopyKey={onCopyKey}
          account={account}
          onOpenDeeplinkExport={onOpenDeeplinkExport}
        />
      ))}
      {nativeKeyRows.map((row) => (
        <AccountKeyResourceItem
          key={row.rowKey}
          row={row}
          associatedProfile={getCredentialProfile?.(row)}
          account={account}
          copiedRuntimeKeyId={copiedRuntimeKeyId}
          onCopyKey={onCopyKey}
          onOpenDeeplinkExport={onOpenDeeplinkExport}
        />
      ))}
    </div>
  )
}
