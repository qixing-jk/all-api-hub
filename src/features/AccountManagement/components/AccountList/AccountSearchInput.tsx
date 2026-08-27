import { Search } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Input } from "~/components/ui"

interface AccountSearchInputProps {
  disabled?: boolean
  value: string
  onChange: (value: string) => void
  onClear: () => void
}

/**
 * Compact search field used to filter account list entries.
 * @param props Component props containing search value and handlers.
 * @param props.disabled Whether account reordering temporarily locks search.
 * @param props.value Current search string.
 * @param props.onChange Handler invoked when user types in the field.
 * @param props.onClear Handler clearing the current search string.
 */
export default function AccountSearchInput({
  disabled = false,
  value,
  onChange,
  onClear,
}: AccountSearchInputProps) {
  const { t } = useTranslation("account")

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      onClear()
    }
  }

  return (
    <div className="relative">
      <Input
        autoFocus={true}
        disabled={disabled}
        type="text"
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("search.placeholder")}
        leftIcon={<Search className="h-4 w-4" />}
        onClear={onClear}
        clearButtonLabel={t("common:actions.clear")}
      />
    </div>
  )
}
