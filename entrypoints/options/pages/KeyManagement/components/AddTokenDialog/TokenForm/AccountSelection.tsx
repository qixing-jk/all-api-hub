import { useTranslation } from "react-i18next"

import { FormField, SearchableSelect } from "~/components/ui"

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

/**
 * Account selector for associating a token with one of the user accounts.
 * @param props Component props container.
 * @param props.accountId Currently selected account id.
 * @param props.handleSelectChange Callback fired when selection changes.
 * @param props.isEditMode When true, disables changing the account.
 * @param props.availableAccounts List of accounts rendered in dropdown.
 * @param props.error Validation message to display beneath the field.
 */
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
      <SearchableSelect
        options={[
          { value: "", label: t("pleaseSelectAccount") },
          ...availableAccounts.map((account) => ({
            value: account.id,
            label: account.name,
          })),
        ]}
        value={accountId || ""}
        onChange={handleSelectChange}
        placeholder={t("pleaseSelectAccount")}
        disabled={isEditMode}
      />
    </FormField>
  )
}
