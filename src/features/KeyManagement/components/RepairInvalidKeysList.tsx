import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"

import { Alert, Badge, Button, Checkbox, EmptyState } from "~/components/ui"
import type { AccountKeyRepairInvalidToken } from "~/types/accountKeyAutoProvisioning"

import {
  getInvalidTokenKey,
  getInvalidTokenReasonLabel,
} from "./repairMissingKeysDialogHelpers"

interface RepairInvalidKeysListProps {
  deleteResultMessage: string
  filteredInvalidTokens: AccountKeyRepairInvalidToken[]
  invalidTokens: AccountKeyRepairInvalidToken[]
  selectedInvalidTokenKeys: Set<string>
  selectedInvalidTokens: AccountKeyRepairInvalidToken[]
  onOpenDeleteConfirm: () => void
  onSelectedInvalidTokenKeysChange: (
    updater: Set<string> | ((previous: Set<string>) => Set<string>),
  ) => void
  t: TFunction
}

/**
 * Renders invalid keys with selection, empty states, and delete feedback.
 */
export function RepairInvalidKeysList({
  deleteResultMessage,
  filteredInvalidTokens,
  invalidTokens,
  selectedInvalidTokenKeys,
  selectedInvalidTokens,
  onOpenDeleteConfirm,
  onSelectedInvalidTokenKeysChange,
  t,
}: RepairInvalidKeysListProps) {
  if (invalidTokens.length === 0) {
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

  if (filteredInvalidTokens.length === 0) {
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

      <div className="dark:border-dark-bg-tertiary space-y-2 border-b border-gray-200 px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={
                filteredInvalidTokens.length > 0 &&
                selectedInvalidTokens.length === filteredInvalidTokens.length
              }
              onCheckedChange={(checked) => {
                onSelectedInvalidTokenKeysChange(
                  checked
                    ? new Set(filteredInvalidTokens.map(getInvalidTokenKey))
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
              {t("keyManagement:repairMissingKeys.invalidKeys.selectedCount", {
                count: selectedInvalidTokens.length,
              })}
            </span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={selectedInvalidTokens.length === 0}
              onClick={onOpenDeleteConfirm}
            >
              {t("keyManagement:repairMissingKeys.invalidKeys.deleteSelected")}
            </Button>
          </div>
        </div>
      </div>

      <ul className="dark:divide-dark-bg-tertiary divide-y">
        {filteredInvalidTokens.map((token) => {
          const tokenKey = getInvalidTokenKey(token)

          return (
            <li
              key={`${token.accountId}-${token.tokenId}-${token.group}`}
              className="px-4 py-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <Checkbox
                    checked={selectedInvalidTokenKeys.has(tokenKey)}
                    onCheckedChange={(checked) => {
                      onSelectedInvalidTokenKeysChange((previous) => {
                        const next = new Set(previous)
                        if (checked) {
                          next.add(tokenKey)
                        } else {
                          next.delete(tokenKey)
                        }
                        return next
                      })
                    }}
                    aria-label={token.tokenName}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-medium">
                        {token.tokenName}
                      </div>
                      <Badge
                        variant="warning"
                        size="sm"
                        className="shrink-0 border-transparent"
                      >
                        {t("keyManagement:repairMissingKeys.invalidKeys.badge")}
                      </Badge>
                      <Badge
                        variant="outline"
                        size="sm"
                        className="dark:border-dark-bg-tertiary shrink-0 border-gray-200 px-2 py-0.5 text-[11px] font-medium"
                        title={token.group}
                      >
                        {token.group}
                      </Badge>
                    </div>
                    <div className="dark:text-dark-text-secondary truncate text-xs text-gray-500">
                      {token.accountName} · {token.siteUrlOrigin}
                    </div>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  size="sm"
                  className="dark:border-dark-bg-tertiary shrink-0 border-gray-200 px-2 py-0.5 text-[11px] font-medium"
                  title={token.siteType}
                >
                  {token.siteType}
                </Badge>
              </div>
              <div className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                {getInvalidTokenReasonLabel(t, token)}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
