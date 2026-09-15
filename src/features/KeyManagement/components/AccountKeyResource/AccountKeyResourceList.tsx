import { useCallback, useRef, useState } from "react"
import type { ComponentProps } from "react"

import type { KeyResourceCredentialAssociation } from "~/features/KeyManagement/components/KeyResourceCard"
import { getAccountKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/accountKeyResourcePresentation"
import type {
  AccountKeyResourceFacts,
  AccountKeyResourceRef,
  ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

import type {
  NativeKeyManagementRow,
  NativeKeyManagementRowAction,
} from "../../types"
import { AccountKeyResourceListItem } from "./AccountKeyResourceListItem"

/** Renders native account-key resources independently of legacy token presentation. */
export function AccountKeyResourceList({
  rows,
  accounts,
  ariaLabel,
  onOpenDetail,
  onEdit,
  onDelete,
  detail,
  isDetailLoading,
  detailFailure,
  onCloseDetail,
  detailsFromRows = false,
  selectionDisabledReason,
  getAssociation,
  getCredentialProfile,
  getNavigationTarget,
  getActions,
}: {
  rows: readonly NativeKeyManagementRow[]
  accounts: readonly DisplaySiteData[]
  ariaLabel: string
  onOpenDetail?: (ref: AccountKeyResourceRef) => void
  onEdit: NativeKeyManagementRowAction
  onDelete: NativeKeyManagementRowAction
  detail?: AccountKeyResourceFacts | null
  isDetailLoading?: boolean
  detailFailure?: ResourceFailure | null
  onCloseDetail?: () => void
  detailsFromRows?: boolean
  selectionDisabledReason?: string
  getAssociation?: (
    row: NativeKeyManagementRow,
  ) => KeyResourceCredentialAssociation | undefined
  getCredentialProfile?: (
    row: NativeKeyManagementRow,
  ) => ApiCredentialProfile | undefined
  getNavigationTarget?: (
    row: NativeKeyManagementRow,
  ) => { targetId: string; isNavigationTarget: true } | undefined
  getActions?: (
    row: NativeKeyManagementRow,
  ) => Pick<
    ComponentProps<typeof AccountKeyResourceListItem>,
    | "isSelected"
    | "selectionDisabledReason"
    | "onSelectionChange"
    | "onOpenCCSwitchDialog"
    | "managedSiteStatus"
    | "isManagedSiteStatusChecking"
    | "onManagedSiteImportSuccess"
    | "onManagedSiteVerificationRetry"
    | "guidedManagedSiteImportRequest"
  >
}) {
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null)
  const expandedRowKeyRef = useRef<string | null>(null)
  const handleExpandedChange = useCallback(
    (row: NativeKeyManagementRow, shouldExpand: boolean) => {
      if (!shouldExpand) {
        if (expandedRowKeyRef.current !== row.rowKey) return
        expandedRowKeyRef.current = null
        setExpandedRowKey(null)
        if (!detailsFromRows) onCloseDetail?.()
        return
      }

      expandedRowKeyRef.current = row.rowKey
      setExpandedRowKey(row.rowKey)
      if (!detailsFromRows) onOpenDetail?.(row.facts.ref)
    },
    [detailsFromRows, onCloseDetail, onOpenDetail],
  )
  if (rows.length === 0) return null
  return (
    <section aria-label={ariaLabel} className="space-y-3">
      {rows.map((row) => {
        const account = accounts.find(
          (candidate) => candidate.id === row.accountId,
        )
        return account ? (
          <AccountKeyResourceListItem
            key={row.rowKey}
            row={row}
            account={account}
            cardAdapter={getAccountKeyResourceCardAdapter(
              row.facts.ref.siteType,
            )}
            onEdit={onEdit}
            onDelete={onDelete}
            expanded={expandedRowKey === row.rowKey}
            onExpandedChange={(expanded) => handleExpandedChange(row, expanded)}
            detail={
              expandedRowKey === row.rowKey &&
              detail?.ref.accountId === row.facts.ref.accountId &&
              detail.ref.scopeKey === row.facts.ref.scopeKey &&
              detail.ref.resourceId === row.facts.ref.resourceId
                ? detail
                : null
            }
            isDetailLoading={expandedRowKey === row.rowKey && isDetailLoading}
            detailFailure={expandedRowKey === row.rowKey ? detailFailure : null}
            detailsFromRow={detailsFromRows}
            selectionDisabledReason={selectionDisabledReason}
            association={getAssociation?.(row)}
            associatedProfile={getCredentialProfile?.(row)}
            {...getNavigationTarget?.(row)}
            {...getActions?.(row)}
          />
        ) : null
      })}
    </section>
  )
}
