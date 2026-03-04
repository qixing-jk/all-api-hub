import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Input } from "~/components/ui"

interface AccountSearchInputProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
}

/**
 * Compact search field used to filter account list entries.
 * @param props Component props containing search value and handlers.
 * @param props.value Current search string.
 * @param props.onChange Handler invoked when user types in the field.
 * @param props.onClear Handler clearing the current search string.
 */
export default function AccountSearchInput({
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
        type="text"
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("search.placeholder")}
        leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
        rightIcon={
          value && (
            <button
              type="button"
              onClick={onClear}
              className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              aria-label={t("common:actions.clear")}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )
        }
      />
    </div>
  )
}
