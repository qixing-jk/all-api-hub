import { Funnel } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Badge, Button, CompactMultiSelect } from "~/components/ui"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { formatGroupLabel } from "~/features/ModelList/groups/groupLabels"
import type { AccountGroupOption } from "~/features/ModelList/presentation/modelListItems"
import { cn } from "~/lib/utils"
import type { DisplaySiteData } from "~/types"

interface AllAccountsGroupFilterMenuProps {
  accounts: DisplaySiteData[]
  availableAccountGroupsByAccountId: Record<string, string[]>
  availableAccountGroupOptionsByAccountId: Record<string, AccountGroupOption[]>
  excludedGroupsByAccountId: Record<string, string[]>
  onExcludedGroupsChange: (next: Record<string, string[]>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Returns a stable array of non-empty group names with duplicates removed. */
function toUniqueGroups(groups: string[]) {
  return Array.from(new Set(groups.filter(Boolean)))
}

/**
 * Popover menu for excluding account-specific groups from all-accounts price comparisons.
 */
export function AllAccountsGroupFilterMenu({
  accounts,
  availableAccountGroupsByAccountId,
  availableAccountGroupOptionsByAccountId,
  excludedGroupsByAccountId,
  onExcludedGroupsChange,
  open,
  onOpenChange,
}: AllAccountsGroupFilterMenuProps) {
  const { t } = useTranslation("modelList")

  const accountSections = useMemo(
    () =>
      accounts.flatMap((account) => {
        const groups = toUniqueGroups(
          availableAccountGroupsByAccountId[account.id] ?? [],
        )

        if (groups.length === 0) {
          return []
        }

        return [
          {
            accountId: account.id,
            accountName: account.name,
            groups,
            groupOptions:
              availableAccountGroupOptionsByAccountId[account.id] ?? [],
          },
        ]
      }),
    [
      accounts,
      availableAccountGroupOptionsByAccountId,
      availableAccountGroupsByAccountId,
    ],
  )

  const activeFilteredAccountCount = useMemo(
    () =>
      accountSections.filter(({ accountId, groups }) => {
        const effectiveExcludedGroups = toUniqueGroups(
          excludedGroupsByAccountId[accountId] ?? [],
        ).filter((group) => groups.includes(group))

        return effectiveExcludedGroups.length > 0
      }).length,
    [accountSections, excludedGroupsByAccountId],
  )

  const totalExcludedGroups = useMemo(
    () =>
      accountSections.reduce((count, { accountId, groups }) => {
        const excluded = new Set(
          toUniqueGroups(excludedGroupsByAccountId[accountId] ?? []),
        )

        return count + groups.filter((group) => excluded.has(group)).length
      }, 0),
    [accountSections, excludedGroupsByAccountId],
  )

  /** Updates the excluded-group map for a single account based on selected groups. */
  const handleAccountSelectionChange = (
    accountId: string,
    selectedGroups: string[],
  ) => {
    const availableGroups = accountSections.find(
      (section) => section.accountId === accountId,
    )?.groups

    if (!availableGroups || availableGroups.length === 0) {
      return
    }

    const selectedGroupSet = new Set(toUniqueGroups(selectedGroups))
    const nextExcludedGroups = availableGroups.filter(
      (group) => !selectedGroupSet.has(group),
    )

    if (nextExcludedGroups.length === 0) {
      const next = { ...excludedGroupsByAccountId }
      delete next[accountId]
      onExcludedGroupsChange(next)
      return
    }

    onExcludedGroupsChange({
      ...excludedGroupsByAccountId,
      [accountId]: nextExcludedGroups,
    })
  }

  const handleSelectAllForAccount = (accountId: string) => {
    if (!(accountId in excludedGroupsByAccountId)) {
      return
    }

    const next = { ...excludedGroupsByAccountId }
    delete next[accountId]
    onExcludedGroupsChange(next)
  }

  const handleClearAllForAccount = (accountId: string) => {
    const availableGroups = accountSections.find(
      (section) => section.accountId === accountId,
    )?.groups

    if (!availableGroups || availableGroups.length === 0) {
      return
    }

    onExcludedGroupsChange({
      ...excludedGroupsByAccountId,
      [accountId]: availableGroups,
    })
  }

  const handleResetAll = () => {
    onExcludedGroupsChange({})
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={totalExcludedGroups > 0 ? "secondary" : "outline"}
          aria-label={t("accountGroupFilterTrigger")}
          className={cn("w-full justify-between px-3 sm:w-56")}
        >
          <span className="flex items-center gap-x-2 gap-y-density-2">
            <Funnel className="h-4 w-4" />
            <span>{t("accountGroupFilterTrigger")}</span>
          </span>
          {activeFilteredAccountCount > 0 ? (
            <Badge variant="secondary" size="sm">
              {t("accountGroupFilterTriggerCount", {
                count: activeFilteredAccountCount,
              })}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[min(42rem,calc(100vw-2rem))] p-0"
      >
        <AccountGroupFilterContent
          accountSections={accountSections}
          excludedGroupsByAccountId={excludedGroupsByAccountId}
          totalExcludedGroups={totalExcludedGroups}
          handleResetAll={handleResetAll}
          handleSelectAllForAccount={handleSelectAllForAccount}
          handleClearAllForAccount={handleClearAllForAccount}
          handleAccountSelectionChange={handleAccountSelectionChange}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Builds account sections only while the popover mounts its content. */
function AccountGroupFilterContent({
  accountSections,
  excludedGroupsByAccountId,
  totalExcludedGroups,
  handleResetAll,
  handleSelectAllForAccount,
  handleClearAllForAccount,
  handleAccountSelectionChange,
}: {
  accountSections: {
    accountId: string
    accountName: string
    groups: string[]
    groupOptions: AccountGroupOption[]
  }[]
  excludedGroupsByAccountId: Record<string, string[]>
  totalExcludedGroups: number
  handleResetAll: () => void
  handleSelectAllForAccount: (accountId: string) => void
  handleClearAllForAccount: (accountId: string) => void
  handleAccountSelectionChange: (accountId: string, groups: string[]) => void
}) {
  const { t } = useTranslation("modelList")
  return (
    <>
      <div className="border-b px-4 py-density-3 dark:border-border">
        <div className="flex flex-col gap-x-3 gap-y-density-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-density-1">
            <div className="text-sm font-semibold text-foreground">
              {t("accountGroupFilterTitle")}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("accountGroupFilterDescription")}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetAll}
            disabled={totalExcludedGroups === 0}
          >
            {t("accountGroupFilterResetAll")}
          </Button>
        </div>
      </div>

      <div className="max-h-[70vh] space-y-density-3 overflow-y-auto px-4 py-density-4">
        {accountSections.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-density-6 text-sm text-muted-foreground">
            {t("accountGroupFilterNoGroups")}
          </div>
        ) : (
          accountSections.map(
            ({ accountId, accountName, groups, groupOptions }) => {
              const excluded = new Set(
                toUniqueGroups(excludedGroupsByAccountId[accountId] ?? []),
              )
              const selectedGroups = groups.filter(
                (group) => !excluded.has(group),
              )

              return (
                <section
                  key={accountId}
                  className="space-y-density-3 rounded-lg border border-border px-3 py-density-3"
                >
                  <div className="flex flex-col gap-x-3 gap-y-density-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-density-1">
                      <div className="text-sm font-medium text-foreground">
                        {accountName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("accountGroupFilterSelectedSummary", {
                          selected: selectedGroups.length,
                          total: groups.length,
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-x-2 gap-y-density-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSelectAllForAccount(accountId)}
                        disabled={selectedGroups.length === groups.length}
                      >
                        {t("accountGroupFilterSelectAll")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleClearAllForAccount(accountId)}
                        disabled={selectedGroups.length === 0}
                      >
                        {t("accountGroupFilterClearAll")}
                      </Button>
                    </div>
                  </div>

                  <CompactMultiSelect
                    options={groupOptions.map((group) => ({
                      value: group.name,
                      label:
                        group.ratio === undefined
                          ? (group.displayName ?? group.name)
                          : formatGroupLabel(
                              group.displayName ?? group.name,
                              group.ratio,
                            ),
                    }))}
                    selected={selectedGroups}
                    onChange={(values) =>
                      handleAccountSelectionChange(accountId, values)
                    }
                    size="sm"
                    displayMode="summary"
                    placeholder={t(
                      selectedGroups.length === 0
                        ? "accountGroupFilterNoGroupsIncluded"
                        : "accountGroupFilterAllIncluded",
                    )}
                  />
                </section>
              )
            },
          )
        )}
      </div>
    </>
  )
}
