import type { TFunction } from "i18next"

import { Badge, Separator } from "~/components/ui"
import type { SiteAccount } from "~/types"

import { DedupeAccountCard } from "./DedupeAccountCard"
import type {
  DedupeAccountsDialogGroup,
  DedupeAccountsKeepChangeInput,
} from "./types"
import { formatDedupeGroupIdentityLabel } from "./utils"

export interface DedupeAccountsGroupsListProps {
  groups: DedupeAccountsDialogGroup[]
  accountLabelById: Map<string, string>
  orderedIndexByAccountId: Map<string, number>
  pinnedAccountIds: string[]
  detailsOpenByAccountId: Record<string, true>
  isWorking: boolean
  t: TFunction
  onKeepChange: (input: DedupeAccountsKeepChangeInput) => void
  onToggleDetails: (accountId: string) => void
}

/**
 * Renders scanned duplicate groups and their accounts for a keep/delete preview.
 */
export function DedupeAccountsGroupsList({
  groups,
  accountLabelById,
  orderedIndexByAccountId,
  pinnedAccountIds,
  detailsOpenByAccountId,
  isWorking,
  t,
  onKeepChange,
  onToggleDetails,
}: DedupeAccountsGroupsListProps) {
  return (
    <div className="space-y-density-3">
      {groups.map((group) => (
        <DedupeAccountsGroupCard
          key={group.groupId}
          group={group}
          accountLabelById={accountLabelById}
          orderedIndexByAccountId={orderedIndexByAccountId}
          pinnedAccountIds={pinnedAccountIds}
          detailsOpenByAccountId={detailsOpenByAccountId}
          isWorking={isWorking}
          t={t}
          onKeepChange={onKeepChange}
          onToggleDetails={onToggleDetails}
        />
      ))}
    </div>
  )
}

/**
 * Stable ordering for displaying accounts in a group: prefer user-defined order when available.
 */
function sortAccountsByOrder({
  accounts,
  orderedIndexByAccountId,
}: {
  accounts: SiteAccount[]
  orderedIndexByAccountId: Map<string, number>
}) {
  return [...accounts].sort((a, b) => {
    const aOrder = orderedIndexByAccountId.get(a.id)
    const bOrder = orderedIndexByAccountId.get(b.id)
    if (aOrder !== undefined && bOrder !== undefined) {
      return aOrder - bOrder
    }
    if (aOrder !== undefined) return -1
    if (bOrder !== undefined) return 1
    return 0
  })
}

/**
 * One duplicate group fieldset, including per-account selection and details toggles.
 */
function DedupeAccountsGroupCard({
  group,
  accountLabelById,
  orderedIndexByAccountId,
  pinnedAccountIds,
  detailsOpenByAccountId,
  isWorking,
  t,
  onKeepChange,
  onToggleDetails,
}: {
  group: DedupeAccountsDialogGroup
  accountLabelById: Map<string, string>
  orderedIndexByAccountId: Map<string, number>
  pinnedAccountIds: string[]
  detailsOpenByAccountId: Record<string, true>
  isWorking: boolean
  t: TFunction
  onKeepChange: (input: DedupeAccountsKeepChangeInput) => void
  onToggleDetails: (accountId: string) => void
}) {
  const orderedGroupAccounts = sortAccountsByOrder({
    accounts: group.accounts,
    orderedIndexByAccountId,
  })
  const identityLabel = formatDedupeGroupIdentityLabel(group.key, t)

  return (
    <fieldset
      disabled={isWorking}
      className="border-border bg-card py-density-4 rounded-lg border px-4"
    >
      <legend className="sr-only">
        {group.key.origin} · {identityLabel}
      </legend>
      <div className="gap-density-2 flex flex-wrap items-start justify-between">
        <div className="min-w-0">
          <div className="text-foreground truncate text-sm font-semibold">
            {group.key.origin}
          </div>
          <div className="text-muted-foreground text-xs">{identityLabel}</div>
        </div>
        <Badge variant="danger">
          {t("ui:dialog.dedupeAccounts.duplicateCount", {
            count: group.accounts.length,
          })}
        </Badge>
      </div>

      <Separator className="my-density-3" />

      <div className="space-y-density-2">
        {orderedGroupAccounts.map((account) => (
          <DedupeAccountCard
            key={account.id}
            account={account}
            group={{ ...group, reason: group.key.reason }}
            accountLabelById={accountLabelById}
            pinnedAccountIds={pinnedAccountIds}
            detailsOpenByAccountId={detailsOpenByAccountId}
            isWorking={isWorking}
            t={t}
            onKeepChange={onKeepChange}
            onToggleDetails={onToggleDetails}
          />
        ))}
      </div>
    </fieldset>
  )
}
