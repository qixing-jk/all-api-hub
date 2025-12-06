import { useTranslation } from "react-i18next"

import type { FormData } from "../hooks/useTokenForm"
import { AccountSelection, type Account } from "./AccountSelection"
import { ExpirationTimeInput } from "./ExpirationTimeInput"
import { FormSection } from "./FormSection"
import { QuotaSettings } from "./QuotaSettings"
import { TokenNameInput } from "./TokenNameInput"

interface BasicInfoSectionProps {
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  errors: Record<string, string>
  isEditMode: boolean
  availableAccounts: Account[]
  handleInputChange: (
    field: keyof FormData,
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  handleSelectChange: (field: keyof FormData) => (value: string) => void
  handleSwitchChange: (field: keyof FormData) => (checked: boolean) => void
}

/**
 * Groups primary token metadata inputs (account, name, quota, expiry).
 * @param props Component props container.
 * @param props.formData Current form values.
 * @param props.errors Validation errors mapped by field.
 * @param props.isEditMode Whether the dialog edits an existing token.
 * @param props.availableAccounts Accounts selectable for association.
 * @param props.handleInputChange Factory for binding input change handlers.
 * @param props.handleSelectChange Factory for select change handlers.
 * @param props.handleSwitchChange Factory for switch change handlers.
 */
export function BasicInfoSection({
  formData,
  errors,
  isEditMode,
  availableAccounts,
  handleInputChange,
  handleSelectChange,
  handleSwitchChange,
}: BasicInfoSectionProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <FormSection title={t("dialog.basicInfo")}>
      <AccountSelection
        accountId={formData.accountId}
        handleSelectChange={handleSelectChange("accountId")}
        isEditMode={isEditMode}
        availableAccounts={availableAccounts}
        error={errors.accountId}
      />
      <TokenNameInput
        name={formData.name}
        handleInputChange={handleInputChange}
        error={errors.name}
      />
      <QuotaSettings
        unlimitedQuota={formData.unlimitedQuota}
        quota={formData.quota}
        handleSwitchChange={handleSwitchChange}
        handleInputChange={handleInputChange}
        error={errors.quota}
      />
      <ExpirationTimeInput
        expiredTime={formData.expiredTime}
        handleInputChange={handleInputChange}
        error={errors.expiredTime}
      />
    </FormSection>
  )
}
