import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Input } from "~/components/ui"

interface TokenSearchBarProps {
  selectedAccount: string
  searchTerm: string
  setSearchTerm: (value: string) => void
}

/**
 * Search input for filtering the token list.
 * Kept separate from the account selector so it can be positioned closer to results.
 */
export function TokenSearchBar({
  selectedAccount,
  searchTerm,
  setSearchTerm,
}: TokenSearchBarProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <div className="mb-4">
      <Input
        type="text"
        placeholder={t("searchPlaceholder")}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        disabled={!selectedAccount}
        leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
      />
    </div>
  )
}
