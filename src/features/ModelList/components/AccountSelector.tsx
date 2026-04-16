import type { Ref } from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Heading3, SearchableSelect } from "~/components/ui"
import type { AccountGroupOption } from "~/features/ModelList/hooks/useFilteredModels"
import {
  ALL_ACCOUNTS_SOURCE_VALUE,
  toAccountSourceValue,
  toProfileSourceValue,
} from "~/features/ModelList/modelManagementSources"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { tryParseUrl } from "~/utils/core/urlParsing"

import { AllAccountsGroupFilterMenu } from "./AllAccountsGroupFilterMenu"

interface AccountSelectorProps {
  selectedSourceValue: string
  setSelectedSourceValue: (sourceValue: string) => void
  accounts: DisplaySiteData[]
  profiles: ApiCredentialProfile[]
  showAllAccountsGroupFilter?: boolean
  availableAccountGroupsByAccountId?: Record<string, string[]>
  availableAccountGroupOptionsByAccountId?: Record<string, AccountGroupOption[]>
  allAccountsExcludedGroupsByAccountId?: Record<string, string[]>
  setAllAccountsExcludedGroupsByAccountId?: (
    next: Record<string, string[]>,
  ) => void
  selectorOpen?: boolean
  onSelectorOpenChange?: (open: boolean) => void
  selectorTriggerRef?: Ref<HTMLButtonElement>
}

/**
 * Dropdown selector for choosing which source's models to view.
 * @param props Component props.
 * @param props.selectedSourceValue Currently selected source value.
 * @param props.setSelectedSourceValue Setter to update the selected source.
 * @param props.accounts Available accounts to display.
 * @param props.profiles Available API credential profiles to display.
 * @param props.showAllAccountsGroupFilter Whether to show the all-accounts group filter menu.
 * @param props.availableAccountGroupsByAccountId Available group names keyed by account id for all-accounts mode.
 * @param props.availableAccountGroupOptionsByAccountId Available group metadata keyed by account id for all-accounts mode.
 * @param props.allAccountsExcludedGroupsByAccountId Currently excluded group names keyed by account id.
 * @param props.setAllAccountsExcludedGroupsByAccountId Setter for all-accounts excluded group names.
 * @param props.selectorOpen Controlled open state for the selector popover.
 * @param props.onSelectorOpenChange Callback fired when the selector open state changes.
 * @param props.selectorTriggerRef Ref forwarded to the selector trigger button.
 * @returns Searchable select control wrapped with heading.
 */
export function AccountSelector({
  selectedSourceValue,
  setSelectedSourceValue,
  accounts,
  profiles,
  showAllAccountsGroupFilter = false,
  availableAccountGroupsByAccountId = {},
  availableAccountGroupOptionsByAccountId = {},
  allAccountsExcludedGroupsByAccountId = {},
  setAllAccountsExcludedGroupsByAccountId,
  selectorOpen,
  onSelectorOpenChange,
  selectorTriggerRef,
}: AccountSelectorProps) {
  const { t } = useTranslation("modelList")
  const [isAccountGroupFilterOpen, setIsAccountGroupFilterOpen] =
    useState(false)

  return (
    <div className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Heading3 className="mb-0">{t("selectSource")}</Heading3>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="min-w-0 flex-1">
          <SearchableSelect
            ref={selectorTriggerRef}
            options={[
              ...(accounts.length > 0
                ? [
                    {
                      value: ALL_ACCOUNTS_SOURCE_VALUE,
                      label: t("allAccounts"),
                    },
                  ]
                : []),
              ...accounts.map((account) => ({
                value: toAccountSourceValue(account.id),
                label: account.name,
              })),
              ...profiles.map((profile) => ({
                value: toProfileSourceValue(profile.id),
                label: t("sourceLabels.profileOption", {
                  name: profile.name,
                  host:
                    tryParseUrl(profile.baseUrl)?.hostname ?? profile.baseUrl,
                }),
              })),
            ]}
            value={selectedSourceValue ?? ""}
            onChange={setSelectedSourceValue}
            open={selectorOpen}
            onOpenChange={onSelectorOpenChange}
            placeholder={t("pleaseSelectSource")}
          />
        </div>

        {showAllAccountsGroupFilter &&
          setAllAccountsExcludedGroupsByAccountId && (
            <AllAccountsGroupFilterMenu
              accounts={accounts}
              availableAccountGroupsByAccountId={
                availableAccountGroupsByAccountId
              }
              availableAccountGroupOptionsByAccountId={
                availableAccountGroupOptionsByAccountId
              }
              excludedGroupsByAccountId={allAccountsExcludedGroupsByAccountId}
              onExcludedGroupsChange={setAllAccountsExcludedGroupsByAccountId}
              open={isAccountGroupFilterOpen}
              onOpenChange={setIsAccountGroupFilterOpen}
            />
          )}
      </div>
    </div>
  )
}
