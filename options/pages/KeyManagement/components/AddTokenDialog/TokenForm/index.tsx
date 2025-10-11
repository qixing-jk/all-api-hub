import type { FormData } from "~/options/pages/KeyManagement/components/AddTokenDialog/hooks/useTokenForm"
import type { UserGroupInfo } from "~/services/apiService/common/type"

import type { Account } from "./AccountSelection"
import { AdvancedSettingsSection } from "./AdvancedSettingsSection"
import { BasicInfoSection } from "./BasicInfoSection"

interface TokenFormProps {
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  errors: Record<string, string>
  isEditMode: boolean
  availableAccounts: Account[]
  groups: Record<string, UserGroupInfo>
  availableModels: string[]
}

export function Index({
  formData,
  setFormData,
  errors,
  isEditMode,
  availableAccounts,
  groups,
  availableModels
}: TokenFormProps) {
  const handleInputChange =
    (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }))
    }

  const handleSwitchChange = (field: keyof FormData) => (checked: boolean) => {
    setFormData((prev) => ({ ...prev, [field]: checked }))
  }

  const handleModelSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(
      e.target.selectedOptions,
      (option) => option.value
    )
    setFormData((prev) => ({ ...prev, modelLimits: values }))
  }

  return (
    <div className="space-y-6">
      <BasicInfoSection
        formData={formData}
        setFormData={setFormData}
        errors={errors}
        isEditMode={isEditMode}
        availableAccounts={availableAccounts}
        handleInputChange={handleInputChange}
        handleSwitchChange={handleSwitchChange}
      />
      <AdvancedSettingsSection
        formData={formData}
        setFormData={setFormData}
        errors={errors}
        groups={groups}
        availableModels={availableModels}
        handleInputChange={handleInputChange}
        handleModelSelectChange={handleModelSelectChange}
      />
    </div>
  )
}
