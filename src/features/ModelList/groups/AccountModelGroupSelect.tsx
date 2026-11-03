import { useTranslation } from "react-i18next"

import { Badge, SearchableSelect } from "~/components/ui"
import { formatGroupLabelFromRatios } from "~/features/ModelList/groups/groupLabels"

const GROUP_SELECT_VALUES = {
  ALL: "all",
  GROUP_PREFIX: "group:",
  EMPTY: "",
} as const

/** Selects the quote group for one account model within the active account filter. */
export function AccountModelGroupSelect({
  selectedGroup,
  groups,
  excludedGroups,
  groupRatios,
  displayNames,
  onChange,
}: {
  selectedGroup?: string
  groups: string[]
  excludedGroups: string[]
  groupRatios: Record<string, number>
  displayNames?: Record<string, string>
  onChange: (group: string | undefined) => void
}) {
  const { t } = useTranslation("modelList")
  const included = groups.filter((group) => !excludedGroups.includes(group))
  const [onlyGroup] = included
  if (included.length === 1 && onlyGroup !== undefined) {
    return (
      <Badge
        variant="secondary"
        size="sm"
        className="max-w-[12rem] min-w-0 text-xs font-medium"
        title={t("accountGroupFilterSelectedSummary", {
          selected: 1,
          total: 1,
        })}
      >
        <span className="min-w-0 truncate">
          {formatGroupLabelFromRatios(onlyGroup, groupRatios, displayNames)}
        </span>
      </Badge>
    )
  }
  const hasOverride =
    selectedGroup !== undefined && included.includes(selectedGroup)
  const selectedCount = hasOverride ? 1 : included.length
  return (
    <SearchableSelect
      className="bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:hover:bg-secondary/80 h-auto min-h-0 w-auto max-w-[12rem] gap-1 rounded-full border-transparent px-2 py-0.5 text-xs font-medium shadow-none [&_svg]:size-3"
      contentClassName="w-64 max-w-[calc(100vw-2rem)]"
      aria-label={t("modelGroupQuickSelect")}
      title={t("accountGroupFilterSelectedSummary", {
        selected: selectedCount,
        total: included.length,
      })}
      value={
        hasOverride
          ? `${GROUP_SELECT_VALUES.GROUP_PREFIX}${selectedGroup}`
          : included.length > 0
            ? GROUP_SELECT_VALUES.ALL
            : GROUP_SELECT_VALUES.EMPTY
      }
      placeholder={t("accountGroupFilterSelectedSummary", {
        selected: selectedCount,
        total: included.length,
      })}
      options={[
        {
          value: GROUP_SELECT_VALUES.ALL,
          label: `${t("allAccountGroups")} (${included.length})`,
        },
        ...included.map((group) => ({
          value: `${GROUP_SELECT_VALUES.GROUP_PREFIX}${group}`,
          label: formatGroupLabelFromRatios(group, groupRatios, displayNames),
        })),
      ]}
      onChange={(value) =>
        onChange(
          value === GROUP_SELECT_VALUES.ALL
            ? undefined
            : value.slice(GROUP_SELECT_VALUES.GROUP_PREFIX.length),
        )
      }
    />
  )
}
