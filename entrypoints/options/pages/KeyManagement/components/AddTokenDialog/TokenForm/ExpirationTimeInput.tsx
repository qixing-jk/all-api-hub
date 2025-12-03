import { useTranslation } from "react-i18next"

import { FormField, Input } from "~/components/ui"

import type { FormData } from "../hooks/useTokenForm"

interface ExpirationTimeInputProps {
  expiredTime: string
  handleInputChange: (
    field: keyof FormData,
  ) => (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string
}

export function ExpirationTimeInput({
  expiredTime,
  handleInputChange,
  error,
}: ExpirationTimeInputProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <FormField
      label={t("dialog.expiration")}
      htmlFor="expiredTime"
      error={error}
      description={t("dialog.expirationPlaceholder")}
    >
      <Input
        id="expiredTime"
        type="datetime-local"
        value={expiredTime}
        onChange={handleInputChange("expiredTime")}
      />
    </FormField>
  )
}
