import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"

import { Alert, Badge, Button, Checkbox, EmptyState } from "~/components/ui"
import type { AccountKeyRepairInvalidResource } from "~/types/accountKeyAutoProvisioning"

import {
  getInvalidResourceKey,
  getInvalidResourceReasonLabel,
} from "./repairMissingKeysDialogHelpers"

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
  if (invalidResources.length === 0) {
    return (
      <div>
        {deleteResultMessage ? (
          <div className="px-4 pt-4">
            <Alert description={deleteResultMessage} />
          </div>
        ) : null}
        <EmptyState
          icon={<MagnifyingGlassIcon className="h-12 w-12" />}
          title={t("keyManagement:repairMissingKeys.invalidKeys.emptyTitle")}
          description={t(
            "keyManagement:repairMissingKeys.invalidKeys.emptyDescription",
          )}
          className="py-10"
        />
      </div>
    )
  }

  if (filteredInvalidResources.length === 0) {
    return (
      <div>
        {deleteResultMessage ? (
          <div className="px-4 pt-4">
            <Alert description={deleteResultMessage} />
          </div>
        ) : null}
        <EmptyState
          icon={<MagnifyingGlassIcon className="h-12 w-12" />}
          title={t("keyManagement:repairMissingKeys.noMatchingResults")}
          className="py-10"
        />
      </div>
    )
  }

  return (
    <div>
      {deleteResultMessage ? (
        <div className="px-4 pt-4">
          <Alert description={deleteResultMessage} />
        </div>
      ) : null}

      {!readOnly ? (
        <div className="dark:border-dark-bg-tertiary space-y-2 border-b border-gray-200 px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm">
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
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

      <ul className="dark:divide-dark-bg-tertiary divide-y">
        {filteredInvalidResources.map((resource) => {
          const resourceKey = getInvalidResourceKey(resource)
          const displayLabel =
            resource.displayLabel?.trim() ||
            t("keyManagement:repairMissingKeys.invalidKeys.unnamed")

          return (
            <li key={resourceKey} className="px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
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
                  <div className="min-w-0 space-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                          className="dark:border-dark-bg-tertiary shrink-0 border-gray-200 px-2 py-0.5 text-[11px] font-medium"
                          title={resource.groupLabel}
                        >
                          {t(
                            "keyManagement:repairMissingKeys.invalidKeys.group",
                            { name: resource.groupLabel },
                          )}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="dark:text-dark-text-secondary truncate text-xs text-gray-500">
                      {resource.accountName} · {resource.siteUrlOrigin}
                    </div>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  size="sm"
                  className="dark:border-dark-bg-tertiary shrink-0 border-gray-200 px-2 py-0.5 text-[11px] font-medium"
                  title={resource.siteType}
                >
                  {resource.siteType}
                </Badge>
              </div>
              <div className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                {getInvalidResourceReasonLabel(t, resource)}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
