import { useTranslation } from "react-i18next"

import { Heading3, SearchableSelect } from "~/components/ui"
import type { DisplaySiteData } from "~/types"

interface AccountSelectorProps {
  selectedAccount: string
  setSelectedAccount: (accountId: string) => void
  accounts: DisplaySiteData[]
}

/**
 * Dropdown selector for choosing which account's model pricing to view.
 * @param props Component props.
 * @param props.selectedAccount Currently selected account id.
 * @param props.setSelectedAccount Setter to update selected account.
 * @param props.accounts Available accounts to display.
 * @returns Searchable select control wrapped with heading.
 */
export function AccountSelector({
  selectedAccount,
  setSelectedAccount,
  accounts,
}: AccountSelectorProps) {
  const { t } = useTranslation("modelList")
  return (
    <div className="mb-6">
      <Heading3 className="mb-3">{t("selectAccount")}</Heading3>
      <SearchableSelect
        options={[
          { value: "all", label: t("allAccounts") },
          ...accounts.map((account) => ({
            value: account.id,
            label: account.name,
          })),
        ]}
        value={selectedAccount ?? ""}
        onChange={setSelectedAccount}
        placeholder={t("pleaseSelectAccount")}
      />
    </div>
  )
}
