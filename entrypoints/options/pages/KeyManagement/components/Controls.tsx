import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Heading3, Input, SearchableSelect } from "~/components/ui"
import type { DisplaySiteData } from "~/types"

interface ControlsProps {
  selectedAccount: string
  setSelectedAccount: (value: string) => void
  searchTerm: string
  setSearchTerm: (value: string) => void
  displayData: DisplaySiteData[]
  tokens: unknown[]
  filteredTokens: unknown[]
}

/**
 * Controls block for selecting an account, filtering tokens, and summarizing counts.
 * @param props Component props container.
 * @param props.selectedAccount Currently selected account identifier.
 * @param props.setSelectedAccount Setter for the selected account.
 * @param props.searchTerm Current token search keyword.
 * @param props.setSearchTerm Setter for the token search keyword.
 * @param props.displayData Accounts to show inside the searchable dropdown.
 * @param props.tokens Complete token list for the chosen account.
 * @param props.filteredTokens Tokens that match the current filters/search.
 */
export function Controls({
  selectedAccount,
  setSelectedAccount,
  searchTerm,
  setSearchTerm,
  displayData,
  tokens,
  filteredTokens,
}: ControlsProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <div className="mb-6 space-y-4">
      <div className="mb-2">
        <Heading3 className="mb-1">{t("selectAccount")}</Heading3>
        <SearchableSelect
          options={displayData.map((account) => ({
            value: account.id,
            label: account.name,
          }))}
          value={selectedAccount ?? ""}
          onChange={setSelectedAccount}
          placeholder={t("pleaseSelectAccount")}
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={!selectedAccount}
            leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
          />
        </div>
      </div>

      {selectedAccount && (
        <div className="dark:text-dark-text-secondary flex items-center space-x-6 text-sm text-gray-500">
          <span>{t("totalKeys", { count: tokens.length })}</span>
          <span>
            {t("enabledCount", {
              count: tokens.filter((t: any) => t.status === 1).length,
            })}
          </span>
          <span>{t("showingCount", { count: filteredTokens.length })}</span>
        </div>
      )}
    </div>
  )
}
