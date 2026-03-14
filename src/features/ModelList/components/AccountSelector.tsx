import { useTranslation } from "react-i18next"

import { Heading3, SearchableSelect } from "~/components/ui"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { tryParseUrl } from "~/utils/core/urlParsing"

interface AccountSelectorProps {
  selectedSourceValue: string
  setSelectedSourceValue: (sourceValue: string) => void
  accounts: DisplaySiteData[]
  profiles: ApiCredentialProfile[]
}

/**
 * Dropdown selector for choosing which source's models to view.
 * @param props Component props.
 * @param props.selectedSourceValue Currently selected source value.
 * @param props.setSelectedSourceValue Setter to update the selected source.
 * @param props.accounts Available accounts to display.
 * @param props.profiles Available API credential profiles to display.
 * @returns Searchable select control wrapped with heading.
 */
export function AccountSelector({
  selectedSourceValue,
  setSelectedSourceValue,
  accounts,
  profiles,
}: AccountSelectorProps) {
  const { t } = useTranslation("modelList")
  return (
    <div className="mb-6">
      <Heading3 className="mb-3">{t("selectSource")}</Heading3>
      <SearchableSelect
        options={[
          { value: "all", label: t("allAccounts") },
          ...accounts.map((account) => ({
            value: `account:${account.id}`,
            label: account.name,
          })),
          ...profiles.map((profile) => ({
            value: `profile:${profile.id}`,
            label: t("sourceLabels.profileOption", {
              name: profile.name,
              host: tryParseUrl(profile.baseUrl)?.hostname ?? profile.baseUrl,
            }),
          })),
        ]}
        value={selectedSourceValue ?? ""}
        onChange={setSelectedSourceValue}
        placeholder={t("pleaseSelectSource")}
      />
    </div>
  )
}
