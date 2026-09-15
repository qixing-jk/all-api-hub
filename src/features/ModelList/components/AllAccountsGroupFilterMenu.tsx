import { Funnel } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Badge, Button, CompactMultiSelect } from "~/components/ui"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { formatGroupLabel } from "~/features/ModelList/groupLabels"
import type { AccountGroupOption } from "~/features/ModelList/modelListItems"
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
          <span className="gap-y-density-2 flex items-center gap-x-2">
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
        <div className="dark:border-border py-density-3 border-b px-4">
          <div className="gap-y-density-3 flex flex-col gap-x-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-density-1">
              <div className="text-foreground text-sm font-semibold">
                {t("accountGroupFilterTitle")}
              </div>
              <p className="text-muted-foreground text-xs">
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

        <div className="space-y-density-3 py-density-4 max-h-[70vh] overflow-y-auto px-4">
          {accountSections.length === 0 ? (
            <div className="border-border text-muted-foreground py-density-6 rounded-lg border border-dashed px-4 text-sm">
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
                    className="border-border space-y-density-3 py-density-3 rounded-lg border px-3"
                  >
                    <div className="gap-y-density-3 flex flex-col gap-x-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-density-1">
                        <div className="text-foreground text-sm font-medium">
                          {accountName}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {t("accountGroupFilterSelectedSummary", {
                            selected: selectedGroups.length,
                            total: groups.length,
                          })}
                        </div>
                      </div>

                      <div className="gap-y-density-2 flex items-center gap-x-2">
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
                            ? group.name
                            : formatGroupLabel(group.name, group.ratio),
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
      </PopoverContent>
    </Popover>
  )
}
