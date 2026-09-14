import type { TFunction } from "i18next"

import { Separator } from "~/components/ui"

import type { DedupeAccountsDialogGroup } from "./types"
import { formatDedupeGroupIdentityLabel } from "./utils"

export interface DedupeAccountsConfirmDetailsProps {
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
        <div className="dark:bg-secondary/40 bg-surface-subtle text-secondary-foreground rounded-md p-3 text-sm">
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

      <div className="border-border bg-card max-h-[55vh] space-y-2 overflow-auto rounded-md border p-3 md:max-h-[min(65vh,40rem)]">
        {groups.map((group) => {
          const keep = group.accounts.find(
            (account) => account.id === group.keepAccountId,
          )
          const deleteLabels = group.accounts
            .filter((account) => account.id !== group.keepAccountId)
            .map((account) => accountLabelById.get(account.id) ?? account.id)
            .join(", ")

          return (
            <div key={`confirm:${group.key.id}`} className="space-y-1">
              <div className="text-muted-foreground text-xs">
                {group.key.origin} ·{" "}
                {formatDedupeGroupIdentityLabel(group.key, t)}
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
