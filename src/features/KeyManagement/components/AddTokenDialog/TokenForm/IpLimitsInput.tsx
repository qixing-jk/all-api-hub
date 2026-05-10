import { useTranslation } from "react-i18next"

import { FormField, Input } from "~/components/ui"

import type { FormData } from "../hooks/useTokenForm"

interface IpLimitsInputProps {
  allowIps: string
  usesSubnetLimits?: boolean
  handleInputChange: (
    field: keyof FormData,
  ) => (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string
}

/**
 * Text input for comma-separated allowed IP addresses.
 * @param props Component props container with handler/error info.
 * @param props.allowIps Current allowed IPs value.
 * @param props.usesSubnetLimits Whether to show AIHubMix subnet-limit copy.
 * @param props.handleInputChange Handler to update form state for IP field.
 * @param props.error Optional validation error message.
 * @returns JSX form field for IP allow list.
 */
export function IpLimitsInput({
  allowIps,
  usesSubnetLimits = false,
  handleInputChange,
  error,
}: IpLimitsInputProps) {
  const { t } = useTranslation("keyManagement")
  const label = usesSubnetLimits
    ? t("dialog.subnetLimits")
    : t("dialog.ipLimits")
  const description = usesSubnetLimits
    ? t("dialog.subnetExample")
    : t("dialog.ipExample")
  const placeholder = usesSubnetLimits
    ? t("dialog.subnetPlaceholder")
    : t("dialog.ipPlaceholder")

  return (
    <FormField
      label={label}
      htmlFor="ipLimits"
      error={error}
      description={description}
    >
      <Input
        id="ipLimits"
        type="text"
        value={allowIps}
        onChange={handleInputChange("allowIps")}
        placeholder={placeholder}
      />
    </FormField>
  )
}
