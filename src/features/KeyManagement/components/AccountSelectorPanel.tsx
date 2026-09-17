import type { Ref } from "react"
import { useTranslation } from "react-i18next"

import { Heading3, SearchableSelect } from "~/components/ui"
import type { DisplaySiteData } from "~/types"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "../constants"
import { KEY_MANAGEMENT_TEST_IDS } from "../testIds"
import type { KeyManagementAggregateCounts } from "../types"

interface AccountSelectorPanelProps {
  selectedAccount: string
  setSelectedAccount: (value: string) => void
  displayData: DisplaySiteData[]
  selectorOpen?: boolean
  onSelectorOpenChange?: (open: boolean) => void
  selectorTriggerRef?: Ref<HTMLButtonElement>
  aggregateCounts: KeyManagementAggregateCounts
}

/**
 * AccountSelectorPanel block for selecting an account, filtering tokens, and summarizing counts.
 */
export function AccountSelectorPanel({
  selectedAccount,
  setSelectedAccount,
  displayData,
  selectorOpen,
  onSelectorOpenChange,
  selectorTriggerRef,
  aggregateCounts: counts,
}: AccountSelectorPanelProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <div className="mb-density-6 space-y-density-4">
      <div className="mb-density-2">
        <Heading3 className="mb-density-1">{t("selectAccount")}</Heading3>
        <SearchableSelect
          ref={selectorTriggerRef}
          data-testid={KEY_MANAGEMENT_TEST_IDS.accountScopeSelect}
          options={[
            ...(displayData.length > 0
              ? [
                  {
                    value: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
                    label: t("allAccounts"),
                  },
                ]
              : []),
            ...displayData.map((account) => ({
              value: account.id,
              label: account.name,
            })),
          ]}
          value={selectedAccount ?? ""}
          onChange={setSelectedAccount}
          open={selectorOpen}
          onOpenChange={onSelectorOpenChange}
          getOptionTestId={(option) =>
            option.value === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
              ? KEY_MANAGEMENT_TEST_IDS.accountScopeAllOption
              : undefined
          }
          placeholder={t("pleaseSelectAccount")}
        />
      </div>

      {selectedAccount && (
        <div className="gap-y-density-2 flex flex-col gap-x-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="dark:text-secondary-foreground text-muted-foreground gap-y-density-2 flex flex-wrap items-center gap-x-6 text-sm">
            {counts.total !== null ? (
              <span>{t("totalKeys", { count: counts.total })}</span>
            ) : counts.knownTotal > 0 ? (
              <span>{t("knownTotalKeys", { count: counts.knownTotal })}</span>
            ) : null}
            {counts.enabled !== null ? (
              <span>{t("enabledCount", { count: counts.enabled })}</span>
            ) : null}
            <span>
              {t("showingCount", {
                count: counts.showing ?? counts.knownShowing,
              })}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
