import { useTranslation } from "react-i18next"

import { FormField, Input } from "~/components/ui"

import type { FormData } from "../hooks/useTokenForm"

interface TokenNameInputProps {
  /**
   * Current token name value to display in the input.
   */
  name: string
  /**
   * Change handler factory scoped to the name field.
   */
  handleInputChange: (
    field: keyof FormData,
  ) => (e: React.ChangeEvent<HTMLInputElement>) => void
  /**
   * Optional validation error for the name field.
   */
  error?: string
}

/**
 * Controlled input for editing the token's display name.
 * @param props Component props container with field handlers.
 * @param props.name Current token name value.
 * @param props.handleInputChange Change handler factory for the name field.
 * @param props.error Optional validation error for the field.
 */
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
