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
