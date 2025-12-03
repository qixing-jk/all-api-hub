import { useTranslation } from "react-i18next"

import {
  FormField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import type { UserGroupInfo } from "~/services/apiService/common/type"

interface GroupSelectionProps {
  group: string
  handleSelectChange: (value: string) => void
  groups: Record<string, UserGroupInfo>
}

export function GroupSelection({
  group,
  handleSelectChange,
  groups,
}: GroupSelectionProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <FormField label={t("dialog.groupLabel")} htmlFor="groupSelect">
      <Select value={group ?? ""} onValueChange={handleSelectChange}>
        <SelectTrigger id="groupSelect" className="w-full">
          <SelectValue
            placeholder={t("dialog.groupPlaceholder") ?? t("dialog.groupLabel")}
          />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(groups).map(([key, groupInfo]) => (
            <SelectItem key={key} value={key}>
              {groupInfo.desc} ({t("dialog.groupRate")}: {groupInfo.ratio})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  )
}
