import type { UserGroupInfo } from "~/services/apiService/common/type"

import type { FormData } from "../hooks/useTokenForm"
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
  allowedGroups?: string[]
  availableModels: string[]
}

/**
 * Composes the token creation form, splitting into basic and advanced sections.
 * Handles wiring shared change handlers and passing state down to subcomponents.
 */
export function TokenForm({
  formData,
  setFormData,
  errors,
  isEditMode,
  availableAccounts,
  groups,
  allowedGroups,
  availableModels,
}: TokenFormProps) {
  const handleInputChange =
    (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }))
    }

  const handleSelectChange = (field: keyof FormData) => (value: string) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value }
      
      // When group changes, update the group suffix in token name
      if (field === "group") {
        const currentName = prev.name
        // Extract base name by removing existing group suffix (pattern: -groupname at the end)
        const baseNameMatch = currentName.match(/^(.+?)-[^-]+$/)
        if (baseNameMatch) {
          const baseName = baseNameMatch[1]
          updated.name = `${baseName}-${value}`
        }
      }
      
      return updated
    })
  }

  const handleSwitchChange = (field: keyof FormData) => (checked: boolean) => {
    setFormData((prev) => ({ ...prev, [field]: checked }))
  }

  const handleModelLimitsChange = (values: string[]) => {
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
        handleSelectChange={handleSelectChange}
        handleSwitchChange={handleSwitchChange}
      />
      <AdvancedSettingsSection
        formData={formData}
        setFormData={setFormData}
        errors={errors}
        groups={groups}
        allowedGroups={allowedGroups}
        availableModels={availableModels}
        handleInputChange={handleInputChange}
        handleSelectChange={handleSelectChange}
        handleModelLimitsChange={handleModelLimitsChange}
      />
    </div>
  )
}
