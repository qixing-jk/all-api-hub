import type { TFunction } from "i18next"
import { Search } from "lucide-react"

import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  InlineMessage,
} from "~/components/ui"
import {
  getInvalidResourceKey,
  getInvalidResourceReasonLabel,
} from "~/features/KeyManagement/repair/repairMissingKeysDialogHelpers"
import type { AccountKeyRepairInvalidResource } from "~/types/accountKeyAutoProvisioning"

interface RepairInvalidKeysListProps {
  deleteResultMessage: string
  filteredInvalidResources: AccountKeyRepairInvalidResource[]
  invalidResources: AccountKeyRepairInvalidResource[]
  readOnly?: boolean
  selectedInvalidResourceKeys: Set<string>
  selectedInvalidResources: AccountKeyRepairInvalidResource[]
  onOpenDeleteConfirm: () => void
  onSelectedInvalidResourceKeysChange: (
    updater: Set<string> | ((previous: Set<string>) => Set<string>),
  ) => void
  t: TFunction
}

/** Renders invalid native resources with selection and delete feedback. */
export function RepairInvalidKeysList({
  deleteResultMessage,
  filteredInvalidResources,
  invalidResources,
  readOnly = false,
  selectedInvalidResourceKeys,
  selectedInvalidResources,
  onOpenDeleteConfirm,
  onSelectedInvalidResourceKeysChange,
  t,
}: RepairInvalidKeysListProps) {
  const deleteFeedback = deleteResultMessage ? (
    <div className="px-4 pt-density-4">
      <InlineMessage role="alert">{deleteResultMessage}</InlineMessage>
    </div>
  ) : null

  if (invalidResources.length === 0) {
    return (
      <div>
        {deleteFeedback}
        <EmptyState
          icon={<Search className="h-12 w-12" />}
          title={t("keyManagement:repairMissingKeys.invalidKeys.emptyTitle")}
          description={t(
            "keyManagement:repairMissingKeys.invalidKeys.emptyDescription",
          )}
          className="py-density-10"
        />
      </div>
    )
  }

  if (filteredInvalidResources.length === 0) {
    return (
      <div>
        {deleteFeedback}
        <EmptyState
          icon={<Search className="h-12 w-12" />}
          title={t("keyManagement:repairMissingKeys.noMatchingResults")}
          className="py-density-10"
        />
      </div>
    )
  }

  return (
    <div>
      {deleteFeedback}

      {!readOnly ? (
        <div className="space-y-density-2 border-b border-border px-4 py-density-3">
          <div className="flex flex-col gap-density-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-density-2 text-sm">
              <Checkbox
                checked={
                  filteredInvalidResources.length > 0 &&
                  selectedInvalidResources.length ===
                    filteredInvalidResources.length
                }
                onCheckedChange={(checked) => {
                  onSelectedInvalidResourceKeysChange(
                    checked
                      ? new Set(
                          filteredInvalidResources.map(getInvalidResourceKey),
                        )
                      : new Set(),
                  )
                }}
                aria-label={t(
                  "keyManagement:repairMissingKeys.invalidKeys.selectAll",
                )}
              />
              {t("keyManagement:repairMissingKeys.invalidKeys.selectAll")}
            </label>
            <div className="flex items-center gap-density-2">
              <span className="text-xs text-muted-foreground">
                {t(
                  "keyManagement:repairMissingKeys.invalidKeys.selectedCount",
                  { count: selectedInvalidResources.length },
                )}
              </span>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={selectedInvalidResources.length === 0}
                onClick={onOpenDeleteConfirm}
              >
                {t(
                  "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ul className="divide-y dark:divide-border">
        {filteredInvalidResources.map((resource) => {
          const resourceKey = getInvalidResourceKey(resource)
          const displayLabel =
            resource.displayLabel?.trim() ||
            t("keyManagement:repairMissingKeys.invalidKeys.unnamed")

          return (
            <li key={resourceKey} className="px-4 py-density-3">
              <div className="flex flex-col gap-density-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-density-3">
                  {!readOnly ? (
                    <Checkbox
                      checked={selectedInvalidResourceKeys.has(resourceKey)}
                      onCheckedChange={(checked) => {
                        onSelectedInvalidResourceKeysChange((previous) => {
                          const next = new Set(previous)
                          if (checked) next.add(resourceKey)
                          else next.delete(resourceKey)
                          return next
                        })
                      }}
                      aria-label={displayLabel}
                      className="mt-0.5 shrink-0"
                    />
                  ) : null}
                  <div className="min-w-0 space-y-density-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-density-2">
                      <div className="truncate text-sm font-medium">
                        {displayLabel}
                      </div>
                      <Badge
                        variant="warning"
                        size="sm"
                        className="shrink-0 border-transparent"
                      >
                        {t("keyManagement:repairMissingKeys.invalidKeys.badge")}
                      </Badge>
                      {resource.groupLabel ? (
                        <Badge
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-border px-2 py-0.5 text-2xs font-medium"
                          title={resource.groupLabel}
                        >
                          {t(
                            "keyManagement:repairMissingKeys.invalidKeys.group",
                            { name: resource.groupLabel },
                          )}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground dark:text-secondary-foreground">
                      {resource.accountName} · {resource.siteUrlOrigin}
                    </div>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-border px-2 py-0.5 text-2xs font-medium"
                  title={resource.siteType}
                >
                  {resource.siteType}
                </Badge>
              </div>
              <div className="mt-density-2 text-xs text-warning-text">
                {getInvalidResourceReasonLabel(t, resource)}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
