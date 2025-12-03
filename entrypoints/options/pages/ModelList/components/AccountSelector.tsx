import { useTranslation } from "react-i18next"

import {
  Heading3,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import type { DisplaySiteData } from "~/types"

interface AccountSelectorProps {
  selectedAccount: string
  setSelectedAccount: (accountId: string) => void
  accounts: DisplaySiteData[]
}

export function AccountSelector({
  selectedAccount,
  setSelectedAccount,
  accounts,
}: AccountSelectorProps) {
  const { t } = useTranslation("modelList")
  return (
    <div className="mb-6">
      <Heading3 className="mb-3">{t("selectAccount")}</Heading3>
      <Select value={selectedAccount ?? ""} onValueChange={setSelectedAccount}>
        <SelectTrigger className="w-full sm:w-80">
          <SelectValue placeholder={t("pleaseSelectAccount")} />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
