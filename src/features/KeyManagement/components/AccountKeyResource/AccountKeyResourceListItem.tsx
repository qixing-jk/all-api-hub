import type { TFunction } from "i18next"
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge, Button, Card, CardContent } from "~/components/ui"
import type {
  AccountKeyResourceFacts,
  ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_MODES,
} from "~/services/apiAdapters/openrouter/keyResourceFields"

import { KEY_MANAGEMENT_TEST_IDS } from "../../testIds"
import type {
  NativeKeyManagementRow,
  NativeKeyManagementRowAction,
} from "../../types"
import { AccountKeyResourceDetails } from "./AccountKeyResourceDetails"

const findFact = (row: NativeKeyManagementRow, fieldId: string) =>
  row.facts.fields.find((fact) => fact.fieldId === fieldId)

const factValue = (row: NativeKeyManagementRow, fieldId: string) => {
  const fact = findFact(row, fieldId)
  return fact && (fact.kind === "number" || fact.kind === "text")
    ? String(fact.value)
    : null
}

const statusVariant = (status: NativeKeyManagementRow["facts"]["status"]) =>
  status === "enabled"
    ? "success"
    : status === "unknown"
      ? "warning"
      : "secondary"

const statusLabel = (
  status: NativeKeyManagementRow["facts"]["status"],
  t: TFunction,
) => {
  switch (status) {
    case "enabled":
      return t("keyManagement:openRouter.list.status.enabled")
    case "disabled":
      return t("keyManagement:openRouter.list.status.disabled")
    case "expired":
      return t("keyManagement:openRouter.list.status.expired")
    default:
      return t("keyManagement:openRouter.list.status.unknown")
  }
}

/** Controlled native OpenRouter row with narrow remote-key actions. */
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
}) {
  const { t } = useTranslation()
  const limit = factValue(row, OPENROUTER_KEY_FIELD_IDS.Limit)
  const remaining = factValue(row, OPENROUTER_KEY_FIELD_IDS.LimitRemaining)
  const usage = factValue(row, OPENROUTER_KEY_FIELD_IDS.Usage)
  const limitMode = factValue(row, OPENROUTER_KEY_FIELD_IDS.LimitMode)
  const isUnlimited = limitMode === OPENROUTER_KEY_LIMIT_MODES.Unlimited
  const toggleDetails = () => onExpandedChange(!expanded)
  const visibleDetail = detail ?? (actionsDisabled ? row.facts : null)

  return (
    <Card data-testid={KEY_MANAGEMENT_TEST_IDS.nativeKeyRow}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-medium">{row.facts.displayName}</h3>
              <Badge variant={statusVariant(row.facts.status)} size="sm">
                {statusLabel(row.facts.status, t)}
              </Badge>
            </div>
            <p className="text-muted-foreground truncate font-mono text-xs">
              {row.facts.maskedLabel}
            </p>
            <p className="text-muted-foreground text-sm">
              <span>{row.accountName}</span> · <span>{row.workspaceName}</span>
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={toggleDetails}
              aria-expanded={expanded}
              aria-label={t("keyManagement:openRouter.list.actions.details")}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {t("keyManagement:openRouter.list.actions.details")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onEdit(row.facts.ref)}
              disabled={actionsDisabled}
              title={
                actionsDisabled
                  ? t("keyManagement:openRouter.list.actions.singleAccountOnly")
                  : undefined
              }
              aria-label={t("keyManagement:openRouter.list.actions.edit")}
            >
              <Pencil className="h-4 w-4" />
              {t("keyManagement:openRouter.list.actions.edit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => onDelete(row.facts.ref)}
              disabled={actionsDisabled}
              title={
                actionsDisabled
                  ? t("keyManagement:openRouter.list.actions.singleAccountOnly")
                  : undefined
              }
              aria-label={t("keyManagement:openRouter.list.actions.delete")}
            >
              <Trash2 className="h-4 w-4" />
              {t("keyManagement:openRouter.list.actions.delete")}
            </Button>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1">
            <dt className="text-muted-foreground">
              {t("keyManagement:openRouter.list.details.limit")}:
            </dt>
            <dd>
              {isUnlimited
                ? t("keyManagement:openRouter.list.values.unlimited")
                : limit ?? t("keyManagement:openRouter.list.values.missing")}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted-foreground">
              {t("keyManagement:openRouter.list.details.remaining")}:
            </dt>
            <dd>
              {isUnlimited
                ? t("keyManagement:openRouter.list.values.unlimited")
                : remaining ??
                  t("keyManagement:openRouter.list.values.missing")}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted-foreground">
              {t("keyManagement:openRouter.list.details.usage")}:
            </dt>
            <dd>
              {usage ?? t("keyManagement:openRouter.list.values.missing")}
            </dd>
          </div>
        </dl>
        {expanded ? (
          isDetailLoading ? (
            <p role="status" className="text-muted-foreground text-sm">
              {t("keyManagement:openRouter.list.details.loading")}
            </p>
          ) : detailFailure ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>{t("keyManagement:openRouter.list.details.loadFailed")}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onExpandedChange(true)}
              >
                {t("keyManagement:openRouter.list.details.retry")}
              </Button>
            </div>
          ) : visibleDetail ? (
            <AccountKeyResourceDetails facts={visibleDetail} />
          ) : null
        ) : null}
      </CardContent>
    </Card>
  )
}
