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
          ? "border-border space-y-density-3 pt-density-5 mt-6 border-t"
          : "space-y-density-3"
      }
    >
      <h3 id={headingId} className="text-foreground text-sm font-semibold">
        {t("ui:dialog.dedupeAccounts.suspected.title")}
      </h3>
      <p className="dark:text-secondary-foreground text-muted-foreground text-sm">
        {t("ui:dialog.dedupeAccounts.suspected.description")}
      </p>
      {groups.map((group) => (
        <div
          key={group.id}
          className="border-border bg-card overflow-hidden rounded-lg border"
        >
          <div className="bg-warning-soft text-warning-soft-foreground space-y-density-1 py-density-3 px-3 text-sm [overflow-wrap:anywhere] break-words">
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
          <ul className="dark:divide-border divide-border-subtle divide-y">
            {group.accounts.map((account) => (
              <li
                key={account.id}
                className="space-y-density-2 py-density-3 min-w-0 px-3 text-sm"
              >
                <div className="gap-density-2 flex flex-wrap items-start justify-between">
                  <div className="text-foreground min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">
                    {accountLabelById.get(account.id) ?? account.site_name}
                  </div>
                  {account.disabled && (
                    <Badge size="sm" variant="secondary">
                      {t("account:list.site.disabled")}
                    </Badge>
                  )}
                </div>
                <div className="dark:text-secondary-foreground text-muted-foreground break-all">
                  {account.site_url}
                </div>
                <div className="gap-density-2 flex flex-wrap items-end justify-between">
                  <div className="text-muted-foreground min-w-0 text-xs [overflow-wrap:anywhere]">
                    {t("ui:dialog.dedupeAccounts.details.lastSync")}:{" "}
                    {formatTimestamp(account.last_sync_time || undefined, t)}
                  </div>
                  <div className="gap-density-2 flex flex-wrap">
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
                        className="text-destructive-text hover:text-destructive-text"
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
