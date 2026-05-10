import { useTranslation } from "react-i18next"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
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
  allowedGroups?: string[]
  availableModels: string[]
  showGroupSelection: boolean
  currentSiteType?: AccountSiteType
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
 * @param props.allowedGroups Optional allow-list restricting selectable groups.
 * @param props.availableModels List of model IDs that can be targeted.
 * @param props.showGroupSelection Whether group selection is supported.
 * @param props.currentSiteType Site type for site-specific field semantics.
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
  allowedGroups,
  availableModels,
  showGroupSelection,
  currentSiteType,
  handleInputChange,
  handleSelectChange,
  handleModelLimitsChange,
}: AdvancedSettingsSectionProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <FormSection title={t("dialog.advancedSettings")}>
      {showGroupSelection ? (
        <GroupSelection
          group={formData.group}
          handleSelectChange={handleSelectChange("group")}
          groups={groups}
          allowedGroups={allowedGroups}
          error={errors.group}
        />
      ) : null}
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
        usesSubnetLimits={currentSiteType === SITE_TYPES.AIHUBMIX}
        handleInputChange={handleInputChange}
        error={errors.allowIps}
      />
    </FormSection>
  )
}
