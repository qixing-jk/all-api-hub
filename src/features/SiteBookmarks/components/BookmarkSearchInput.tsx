import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Input } from "~/components/ui"

interface BookmarkSearchInputProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
}

/**
 * Compact search field used to filter bookmark list entries.
 */
export default function BookmarkSearchInput({
  value,
  onChange,
  onClear,
}: BookmarkSearchInputProps) {
  const { t } = useTranslation(["bookmark", "common"])

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
        placeholder={t("bookmark:search.placeholder")}
        leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
        onClear={onClear}
        clearButtonLabel={t("common:actions.clear")}
      />
    </div>
  )
}
