import { useTranslation } from "react-i18next"

import { FormField, SearchableSelect } from "~/components/ui"
import type { UserGroupInfo } from "~/services/apiService/common/type"

interface GroupSelectionProps {
  group: string
  handleSelectChange: (value: string) => void
  groups: Record<string, UserGroupInfo>
  allowedGroups?: string[]
}

/**
 * Dropdown for selecting the token's user group or plan.
 *
 * When `allowedGroups` is provided, options outside the allow-list remain
 * visible but disabled, and are sorted to the bottom to reduce confusion.
 * @param props Component props container.
 * @param props.group Currently selected group key.
 * @param props.handleSelectChange Change handler invoked when a group is chosen.
 * @param props.groups Available groups keyed by id.
 * @param props.allowedGroups Optional allow-list restricting selectable groups.
 * @returns Searchable select listing groups with ratios.
 */
export function GroupSelection({
  group,
  handleSelectChange,
  groups,
  allowedGroups,
}: GroupSelectionProps) {
  const { t } = useTranslation("keyManagement")

  const normalizedAllowedGroups = Array.isArray(allowedGroups)
    ? allowedGroups.map((value) => value.trim()).filter(Boolean)
    : []
  const allowedGroupSet =
    normalizedAllowedGroups.length > 0 ? new Set(normalizedAllowedGroups) : null

  const allowedGroupOrder = new Map(
    normalizedAllowedGroups.map((allowedGroup, index) => [allowedGroup, index]),
  )

  const options = Object.entries(groups)
    .map(([key, groupInfo]) => {
      const desc = groupInfo.desc?.trim()
      const ratioLabel = `${t("dialog.groupRate")} ${groupInfo.ratio}`

      const label = (() => {
        if (!desc || desc === key) {
          return `${key} (${ratioLabel})`
        }

        return `${key} - ${desc} (${ratioLabel})`
      })()

      return {
        value: key,
        label,
        disabled: allowedGroupSet ? !allowedGroupSet.has(key) : false,
      }
    })
    .sort((a, b) => {
      if (!allowedGroupSet) return 0

      const aAllowed = !a.disabled
      const bAllowed = !b.disabled

      if (aAllowed !== bAllowed) {
        return aAllowed ? -1 : 1
      }

      if (aAllowed && bAllowed) {
        return (
          (allowedGroupOrder.get(a.value) ?? Number.POSITIVE_INFINITY) -
          (allowedGroupOrder.get(b.value) ?? Number.POSITIVE_INFINITY)
        )
      }

      return a.value.localeCompare(b.value)
    })

  return (
    <FormField
      label={t("dialog.groupLabel")}
      htmlFor="groupSelect"
      description={
        allowedGroupSet ? t("dialog.groupRestrictedNote") : undefined
      }
    >
      <SearchableSelect
        options={options}
        value={group ?? ""}
        onChange={handleSelectChange}
        placeholder={t("dialog.groupPlaceholder") ?? t("dialog.groupLabel")}
      />
    </FormField>
  )
}
