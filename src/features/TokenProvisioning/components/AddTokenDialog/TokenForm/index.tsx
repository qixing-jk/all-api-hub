import {
  ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES,
  resolveAccountSiteTokenFormNetworkLimitPolicy,
} from "~/services/accounts/accountSiteProfile"
import type { UserGroupInfo } from "~/services/accountTokens/tokenProvisioningModel"

import { applyDefaultTokenCreateGroupSelection } from "../defaultTokenCreatePrefill"
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
  showGroupSelection: boolean
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
  showGroupSelection,
}: TokenFormProps) {
  const handleInputChange =
    (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }))
    }

  const handleSelectChange = (field: keyof FormData) => (value: string) => {
    setFormData((prev) => {
      if (field !== "group") {
        return { ...prev, [field]: value }
      }

      return applyDefaultTokenCreateGroupSelection(prev, value)
    })
  }

  const handleSwitchChange = (field: keyof FormData) => (checked: boolean) => {
    setFormData((prev) => ({ ...prev, [field]: checked }))
  }

  const handleModelLimitsChange = (values: string[]) => {
    setFormData((prev) => ({ ...prev, modelLimits: values }))
  }
  const selectedAccount = availableAccounts.find(
    (account) => account.id === formData.accountId,
  )
  const usesSubnetLimits = selectedAccount
    ? resolveAccountSiteTokenFormNetworkLimitPolicy(selectedAccount) ===
      ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.SubnetLimit
    : false

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
        showGroupSelection={showGroupSelection}
        usesSubnetLimits={usesSubnetLimits}
        handleInputChange={handleInputChange}
        handleSelectChange={handleSelectChange}
        handleModelLimitsChange={handleModelLimitsChange}
      />
    </div>
  )
}
