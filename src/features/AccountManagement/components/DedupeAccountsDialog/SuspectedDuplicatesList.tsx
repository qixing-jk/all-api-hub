import type { TFunction } from "i18next"
import { useId } from "react"

import { Badge, Button } from "~/components/ui"
import type { SuspectedDuplicateAccountGroup } from "~/services/accounts/accountDedupe"

import { formatTimestamp } from "./utils"

/** Cross-domain matches with explicit per-account actions, outside bulk cleanup. */
export function SuspectedDuplicatesList({
  groups,
  accountLabelById,
  isWorking,
  separated,
  onReviewAccount,
  onDeleteAccount,
  t,
}: {
  groups: SuspectedDuplicateAccountGroup[]
  accountLabelById: Map<string, string>
  isWorking: boolean
  separated: boolean
  onReviewAccount?: (accountId: string) => void
  onDeleteAccount?: (accountId: string) => void
  t: TFunction
}) {
  const headingId = useId()
  if (groups.length === 0) return null
  return (
    <section
      aria-labelledby={headingId}
      className={
        separated
          ? "dark:border-dark-bg-tertiary mt-6 space-y-3 border-t border-gray-200 pt-5"
          : "space-y-3"
      }
    >
      <h3
        id={headingId}
        className="dark:text-dark-text-primary text-sm font-semibold text-gray-900"
      >
        {t("ui:dialog.dedupeAccounts.suspected.title")}
      </h3>
      <p className="dark:text-dark-text-secondary text-sm text-gray-600">
        {t("ui:dialog.dedupeAccounts.suspected.description")}
      </p>
      {groups.map((group) => (
        <div
          key={group.id}
          className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary overflow-hidden rounded-lg border border-gray-200 bg-white"
        >
          <div className="space-y-1 bg-amber-50 p-3 text-sm [overflow-wrap:anywhere] break-words text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <div>
              {t("ui:dialog.dedupeAccounts.userId", { userId: group.userId })}
            </div>
            {group.siteName && (
              <div>
                {t("ui:dialog.dedupeAccounts.suspected.sameName", {
                  name: group.siteName,
                })}
              </div>
            )}
            {group.rootDomain && (
              <div>
                {t("ui:dialog.dedupeAccounts.suspected.sameDomain", {
                  domain: group.rootDomain,
                })}
              </div>
            )}
          </div>
          <ul className="dark:divide-dark-bg-tertiary divide-y divide-gray-100">
            {group.accounts.map((account) => (
              <li key={account.id} className="min-w-0 space-y-2 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="dark:text-dark-text-primary min-w-0 flex-1 font-medium [overflow-wrap:anywhere] text-gray-900">
                    {accountLabelById.get(account.id) ?? account.site_name}
                  </div>
                  {account.disabled && (
                    <Badge size="sm" variant="secondary">
                      {t("account:list.site.disabled")}
                    </Badge>
                  )}
                </div>
                <div className="dark:text-dark-text-secondary break-all text-gray-600">
                  {account.site_url}
                </div>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="dark:text-dark-text-tertiary min-w-0 text-xs [overflow-wrap:anywhere] text-gray-500">
                    {t("ui:dialog.dedupeAccounts.details.lastSync")}:{" "}
                    {formatTimestamp(account.last_sync_time || undefined, t)}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onReviewAccount && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isWorking}
                        onClick={() => onReviewAccount(account.id)}
                        aria-label={t(
                          "ui:dialog.dedupeAccounts.suspected.reviewAccount",
                          {
                            name:
                              accountLabelById.get(account.id) ??
                              account.site_name,
                          },
                        )}
                      >
                        {t("ui:dialog.dedupeAccounts.suspected.review")}
                      </Button>
                    )}
                    {onDeleteAccount && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        disabled={isWorking}
                        onClick={() => onDeleteAccount(account.id)}
                        aria-label={t(
                          "ui:dialog.dedupeAccounts.suspected.deleteAccount",
                          {
                            name:
                              accountLabelById.get(account.id) ??
                              account.site_name,
                          },
                        )}
                      >
                        {t("common:actions.delete")}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
