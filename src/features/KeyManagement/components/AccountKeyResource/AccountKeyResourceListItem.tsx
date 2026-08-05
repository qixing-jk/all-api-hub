import { Pencil, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

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
  detailsFromRow = false,
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
  detailsFromRow?: boolean
  selectionDisabledReason?: string
}) {
  const { t } = useTranslation(["keyManagement", "common"])
  const presentation = buildOpenRouterKeyResourceCardPresentation(row, t)
  const visibleDetail = detail ?? (detailsFromRow ? row.facts : null)
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
  const actions =
    presentation.actions.edit || presentation.actions.delete ? (
      <>
        {presentation.actions.edit ? (
          <IconButton
            type="button"
            size="sm"
            variant="outline"
            aria-label={t("openRouter.list.actions.edit")}
            onClick={() => onEdit(row.facts.ref)}
          >
            <Pencil
              aria-hidden="true"
              className="h-4 w-4 text-blue-500 dark:text-blue-400"
            />
          </IconButton>
        ) : null}
        {presentation.actions.delete ? (
          <IconButton
            type="button"
            size="sm"
            variant="destructive"
            aria-label={t("openRouter.list.actions.delete")}
            onClick={() => onDelete(row.facts.ref)}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </IconButton>
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
