import { useTranslation } from "react-i18next"

import type { UserGroupInfo } from "~/services/apiService/common/type"
import { isNotEmptyArray } from "~/utils"

import type { FormData } from "../hooks/useTokenForm"
import { FormSection } from "./FormSection"
import { GroupSelection } from "./GroupSelection"
import { IpLimitsInput } from "./IpLimitsInput"
import { ModelLimits } from "./ModelLimits"

interface AdvancedSettingsSectionProps {
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  errors: Record<string, string>
  groups: Record<string, UserGroupInfo>
  availableModels: string[]
  handleInputChange: (
    field: keyof FormData,
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  handleSelectChange: (field: keyof FormData) => (value: string) => void
  handleModelLimitsChange: (values: string[]) => void
}

export function AdvancedSettingsSection({
  formData,
  setFormData,
  errors,
  groups,
  availableModels,
  handleInputChange,
  handleSelectChange,
  handleModelLimitsChange,
}: AdvancedSettingsSectionProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <FormSection title={t("dialog.advancedSettings")}>
      <GroupSelection
        group={formData.group}
        handleSelectChange={handleSelectChange("group")}
        groups={groups}
      />
      {isNotEmptyArray(availableModels) && (
        <ModelLimits
          modelLimitsEnabled={formData.modelLimitsEnabled}
          modelLimits={formData.modelLimits}
          availableModels={availableModels}
          setFormData={setFormData}
          handleModelLimitsChange={handleModelLimitsChange}
        />
      )}
      <IpLimitsInput
        allowIps={formData.allowIps}
        handleInputChange={handleInputChange}
        error={errors.allowIps}
      />
    </FormSection>
  )
}
