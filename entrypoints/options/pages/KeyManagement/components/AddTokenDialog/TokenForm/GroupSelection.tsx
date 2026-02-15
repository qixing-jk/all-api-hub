import { useTranslation } from "react-i18next"

import { FormField, SearchableSelect } from "~/components/ui"
import type { UserGroupInfo } from "~/services/apiService/common/type"

interface GroupSelectionProps {
  group: string
  handleSelectChange: (value: string) => void
  groups: Record<string, UserGroupInfo>
}

/**
 * Dropdown for selecting the token's user group or plan.
 * @param props Component props container.
 * @param props.group Currently selected group key.
 * @param props.handleSelectChange Change handler invoked when a group is chosen.
 * @param props.groups Available groups keyed by id.
 * @returns Searchable select listing groups with ratios.
 */
export function GroupSelection({
  group,
  handleSelectChange,
  groups,
}: GroupSelectionProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <FormField label={t("dialog.groupLabel")} htmlFor="groupSelect">
      <SearchableSelect
        options={Object.entries(groups).map(([key, groupInfo]) => ({
          value: key,
          label: (() => {
            const desc = groupInfo.desc?.trim()
            const ratioLabel = `${t("dialog.groupRate")} ${groupInfo.ratio}`

            if (!desc || desc === key) {
              return `${key} (${ratioLabel})`
            }

            return `${key} - ${desc} (${ratioLabel})`
          })(),
        }))}
        value={group ?? ""}
        onChange={handleSelectChange}
        placeholder={t("dialog.groupPlaceholder") ?? t("dialog.groupLabel")}
      />
    </FormField>
  )
}
