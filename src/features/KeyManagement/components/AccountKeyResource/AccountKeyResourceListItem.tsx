import { Pencil, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { IconButton } from "~/components/ui"
import { KeyResourceCard } from "~/features/KeyManagement/components/KeyResourceCard"
import type { KeyResourceDetailState } from "~/features/KeyManagement/presentation/keyResourceCard"
import {
  buildOpenRouterKeyResourceCardPresentation,
  buildOpenRouterKeyResourceDetailFacts,
} from "~/features/KeyManagement/presentation/openRouterKeyResourceCard"
import type {
  AccountKeyResourceFacts,
  ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"

import { KEY_MANAGEMENT_TEST_IDS } from "../../testIds"
import type {
  NativeKeyManagementRow,
  NativeKeyManagementRowAction,
} from "../../types"

/** Keeps a disabled mutation's explanation reachable without enabling it. */
function DisabledNativeActionHint({
  label,
  reason,
  children,
}: {
  label: string
  reason?: string
  children: ReactNode
}) {
  if (!reason) return children

  return (
    <Tooltip content={reason} anchorAsChild>
      <span
        className="inline-flex"
        tabIndex={0}
        aria-label={label}
        aria-disabled="true"
      >
        {children}
      </span>
    </Tooltip>
  )
}

/** Composes an OpenRouter-native key with the shared key-resource card. */
export function AccountKeyResourceListItem({
  row,
  onEdit,
  onDelete,
  detail,
  isDetailLoading = false,
  detailFailure,
  expanded = false,
  onExpandedChange,
  actionsDisabled = false,
  selectionDisabledReason,
}: {
  row: NativeKeyManagementRow
  onEdit: NativeKeyManagementRowAction
  onDelete: NativeKeyManagementRowAction
  detail?: AccountKeyResourceFacts | null
  isDetailLoading?: boolean
  detailFailure?: ResourceFailure | null
  expanded?: boolean
  onExpandedChange: (expanded: boolean) => void
  actionsDisabled?: boolean
  selectionDisabledReason?: string
}) {
  const { t } = useTranslation(["keyManagement", "common"])
  const presentation = buildOpenRouterKeyResourceCardPresentation(row, t)
  const visibleDetail = detail ?? (actionsDisabled ? row.facts : null)
  const detailState: KeyResourceDetailState = isDetailLoading
    ? { status: "loading" }
    : detailFailure
      ? {
          status: "error",
          message: t("openRouter.list.details.loadFailed"),
          onRetry: () => onExpandedChange(true),
        }
      : {
          status: "ready",
          facts: visibleDetail
            ? buildOpenRouterKeyResourceDetailFacts(visibleDetail, t)
            : [],
        }
  const disabledReason = actionsDisabled
    ? t("openRouter.list.actions.singleAccountOnly")
    : undefined
  const actions =
    presentation.actions.edit || presentation.actions.delete ? (
      <>
        {presentation.actions.edit ? (
          <DisabledNativeActionHint
            label={t("openRouter.list.actions.edit")}
            reason={disabledReason}
          >
            <IconButton
              type="button"
              size="sm"
              variant="outline"
              aria-label={t("openRouter.list.actions.edit")}
              disableAutoTitle={actionsDisabled}
              disabled={actionsDisabled}
              onClick={() => onEdit(row.facts.ref)}
            >
              <Pencil
                aria-hidden="true"
                className="h-4 w-4 text-blue-500 dark:text-blue-400"
              />
            </IconButton>
          </DisabledNativeActionHint>
        ) : null}
        {presentation.actions.delete ? (
          <DisabledNativeActionHint
            label={t("openRouter.list.actions.delete")}
            reason={disabledReason}
          >
            <IconButton
              type="button"
              size="sm"
              variant="destructive"
              aria-label={t("openRouter.list.actions.delete")}
              disableAutoTitle={actionsDisabled}
              disabled={actionsDisabled}
              onClick={() => onDelete(row.facts.ref)}
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </IconButton>
          </DisabledNativeActionHint>
        ) : null}
      </>
    ) : undefined

  return (
    <KeyResourceCard
      presentation={presentation}
      secret={presentation.maskedLabel}
      actions={actions}
      details={detailState}
      isDetailsExpanded={expanded}
      onDetailsExpandedChange={onExpandedChange}
      selectionDisabledReason={selectionDisabledReason}
      selectionLabel={t("batchManagedSiteExport.selection.rowLabel", {
        name: presentation.title,
      })}
      testId={KEY_MANAGEMENT_TEST_IDS.nativeKeyRow}
    />
  )
}
