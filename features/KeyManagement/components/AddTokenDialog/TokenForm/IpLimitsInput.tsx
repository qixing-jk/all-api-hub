import { useTranslation } from "react-i18next"

import { FormField, Input } from "~/components/ui"

import type { FormData } from "../hooks/useTokenForm"

interface IpLimitsInputProps {
  allowIps: string
  handleInputChange: (
    field: keyof FormData,
  ) => (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string
}

/**
 * Text input for comma-separated allowed IP addresses.
 * @param props Component props container with handler/error info.
 * @param props.allowIps Current allowed IPs value.
 * @param props.handleInputChange Handler to update form state for IP field.
 * @param props.error Optional validation error message.
 * @returns JSX form field for IP allow list.
 */
export function IpLimitsInput({
  allowIps,
  handleInputChange,
  error,
}: IpLimitsInputProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <FormField
      label={t("dialog.ipLimits")}
      htmlFor="ipLimits"
      error={error}
      description={t("dialog.ipExample")}
    >
      <Input
        id="ipLimits"
        type="text"
        value={allowIps}
        onChange={handleInputChange("allowIps")}
        placeholder={t("dialog.ipPlaceholder")}
      />
    </FormField>
  )
}
