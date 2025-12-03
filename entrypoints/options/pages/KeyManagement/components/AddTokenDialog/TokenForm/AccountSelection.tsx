import { useTranslation } from "react-i18next"

import {
  FormField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"

export interface Account {
  id: string
  name: string
}

interface AccountSelectionProps {
  accountId: string
  handleSelectChange: (value: string) => void
  isEditMode: boolean
  availableAccounts: Account[]
  error?: string
}

const UNSELECTED_VALUE = "__unselected__"

export function AccountSelection({
  accountId,
  handleSelectChange,
  isEditMode,
  availableAccounts,
  error,
}: AccountSelectionProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <FormField
      label={`${t("dialog.accountSelect")} *`}
      htmlFor="accountSelect"
      error={error}
      description={isEditMode ? t("dialog.editModeNoChange") : undefined}
    >
      <Select
        value={accountId ? accountId : UNSELECTED_VALUE}
        onValueChange={(value) =>
          handleSelectChange(value === UNSELECTED_VALUE ? "" : value)
        }
        disabled={isEditMode}
      >
        <SelectTrigger id="accountSelect" className="w-full">
          <SelectValue placeholder={t("pleaseSelectAccount")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSELECTED_VALUE}>
            {t("pleaseSelectAccount")}
          </SelectItem>
          {availableAccounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  )
}
