import type { TFunction } from "i18next"

import { Separator } from "~/components/ui"

import type { DedupeAccountsDialogGroup } from "./types"

interface DedupeAccountsConfirmDetailsProps {
  groups: DedupeAccountsDialogGroup[]
  accountLabelById: Map<string, string>
  pinnedToDeleteCount: number
  orderedToDeleteCount: number
  t: TFunction
}

/**
 * Confirm dialog details: warnings and the per-group keep/delete summary.
 */
export function DedupeAccountsConfirmDetails({
  groups,
  accountLabelById,
  pinnedToDeleteCount,
  orderedToDeleteCount,
  t,
}: DedupeAccountsConfirmDetailsProps) {
  return (
    <div className="space-y-3">
      {(pinnedToDeleteCount > 0 || orderedToDeleteCount > 0) && (
        <div className="dark:bg-dark-bg-tertiary/40 dark:text-dark-text-secondary rounded-md bg-gray-50 p-3 text-sm text-gray-700">
          {pinnedToDeleteCount > 0 && (
            <div>
              {t("ui:dialog.dedupeAccounts.confirm.warningPinned", {
                count: pinnedToDeleteCount,
              })}
            </div>
          )}
          {orderedToDeleteCount > 0 && (
            <div>{t("ui:dialog.dedupeAccounts.confirm.warningOrder")}</div>
          )}
        </div>
      )}

      <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary max-h-[280px] space-y-2 overflow-auto rounded-md border border-gray-200 bg-white p-3">
        {groups.map((group) => {
          const keep = group.accounts.find(
            (account) => account.id === group.keepAccountId,
          )
          const deleteLabels = group.accounts
            .filter((account) => account.id !== group.keepAccountId)
            .map((account) => accountLabelById.get(account.id) ?? account.id)
            .join(", ")

          return (
            <div
              key={`confirm:${group.key.origin}::${group.key.userId}`}
              className="space-y-1"
            >
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {group.key.origin} ·{" "}
                {t("ui:dialog.dedupeAccounts.userId", {
                  userId: group.key.userId,
                })}
              </div>
              <div className="text-sm">
                <span className="font-medium">
                  {t("ui:dialog.dedupeAccounts.keep")}:
                </span>{" "}
                {keep
                  ? accountLabelById.get(keep.id) ?? keep.id
                  : group.keepAccountId}
              </div>
              <div className="text-sm">
                <span className="font-medium">
                  {t("ui:dialog.dedupeAccounts.delete")}:
                </span>{" "}
                {deleteLabels || "-"}
              </div>
              <Separator className="my-2" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
