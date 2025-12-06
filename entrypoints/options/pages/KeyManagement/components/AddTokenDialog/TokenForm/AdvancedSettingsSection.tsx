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

/**
 * Houses advanced configuration fields like group, model, and IP restrictions.
 * @param props Component props container.
 * @param props.formData Current token form values powering the controls.
 * @param props.setFormData Setter used to update complex form fields.
 * @param props.errors Map of validation messages keyed by field name.
 * @param props.groups Available user groups keyed by identifier.
 * @param props.availableModels List of model IDs that can be targeted.
 * @param props.handleInputChange Factory for text input change handlers.
 * @param props.handleSelectChange Factory for select change handlers.
 * @param props.handleModelLimitsChange Emits updated model whitelist.
 * @returns JSX section with conditional model-limit controls.
 */
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
