import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import type {
  AccountKeyResourceFacts,
  AccountKeyResourceRef,
  ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"

import type {
  NativeKeyManagementRow,
  NativeKeyManagementRowAction,
} from "../../types"
import { AccountKeyResourceListItem } from "./AccountKeyResourceListItem"

/** Renders native account-key resources independently of legacy token presentation. */
export function AccountKeyResourceList({
  rows,
  onOpenDetail,
  onEdit,
  onDelete,
  detail,
  isDetailLoading,
  detailFailure,
  onCloseDetail,
  actionsDisabled = false,
}: {
  rows: readonly NativeKeyManagementRow[]
  onOpenDetail?: (ref: AccountKeyResourceRef) => void
  onEdit: NativeKeyManagementRowAction
  onDelete: NativeKeyManagementRowAction
  detail?: AccountKeyResourceFacts | null
  isDetailLoading?: boolean
  detailFailure?: ResourceFailure | null
  onCloseDetail?: () => void
  actionsDisabled?: boolean
}) {
  const { t } = useTranslation()
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null)
  const expandedRowKeyRef = useRef<string | null>(null)
  const handleExpandedChange = useCallback(
    (row: NativeKeyManagementRow, shouldExpand: boolean) => {
      if (!shouldExpand) {
        if (expandedRowKeyRef.current !== row.rowKey) return
        expandedRowKeyRef.current = null
        setExpandedRowKey(null)
        if (!actionsDisabled) onCloseDetail?.()
        return
      }

      expandedRowKeyRef.current = row.rowKey
      setExpandedRowKey(row.rowKey)
      if (!actionsDisabled) onOpenDetail?.(row.facts.ref)
    },
    [actionsDisabled, onCloseDetail, onOpenDetail],
  )
  if (rows.length === 0) return null
  return (
    <section
      aria-label={t("keyManagement:openRouter.list.heading")}
      className="space-y-3"
    >
      {rows.map((row) => (
        <AccountKeyResourceListItem
          key={row.rowKey}
          row={row}
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
          actionsDisabled={actionsDisabled}
        />
      ))}
    </section>
  )
}
