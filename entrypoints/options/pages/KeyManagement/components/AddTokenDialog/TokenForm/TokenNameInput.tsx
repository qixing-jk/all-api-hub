import { useTranslation } from "react-i18next"

import { FormField, Input } from "~/components/ui"

import type { FormData } from "../hooks/useTokenForm"

interface TokenNameInputProps {
  name: string
  handleInputChange: (
    field: keyof FormData,
  ) => (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string
}

export function TokenNameInput({
  name,
  handleInputChange,
  error,
}: TokenNameInputProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <FormField
      label={`${t("dialog.tokenName")} *`}
      htmlFor="tokenName"
      error={error}
    >
      <Input
        id="tokenName"
        type="text"
        value={name}
        onChange={handleInputChange("name")}
        placeholder={t("dialog.tokenName")}
      />
    </FormField>
  )
}
