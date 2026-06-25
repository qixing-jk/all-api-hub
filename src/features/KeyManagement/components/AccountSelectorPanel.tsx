import type { Ref } from "react"
import { useTranslation } from "react-i18next"

import { Badge, Button, Heading3, SearchableSelect } from "~/components/ui"
import type { AccountToken, DisplaySiteData } from "~/types"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "../constants"
import { KEY_MANAGEMENT_TEST_IDS } from "../testIds"

interface AccountSelectorPanelProps {
  selectedAccount: string
  setSelectedAccount: (value: string) => void
  displayData: DisplaySiteData[]
  selectorOpen?: boolean
  onSelectorOpenChange?: (open: boolean) => void
  selectorTriggerRef?: Ref<HTMLButtonElement>
  tokens: AccountToken[]
  filteredTokens: AccountToken[]
  tokenLoadProgress?: {
    total: number
    loaded: number
    loading: number
    error: number
  } | null
  failedAccounts?: Array<{
    accountId: string
    accountName: string
    errorMessage?: string
  }>
  onRetryFailedAccounts?: () => void
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
  tokens,
  filteredTokens,
  tokenLoadProgress,
  failedAccounts = [],
  onRetryFailedAccounts,
}: AccountSelectorPanelProps) {
  const { t } = useTranslation("keyManagement")

  const isAllAccountsMode =
    selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
  const failedCount = isAllAccountsMode ? failedAccounts.length : 0
  const failedAccountNames = failedAccounts
    .map((account) => account.accountName)
    .join(", ")

  return (
    <div className="mb-6 space-y-4">
      <div className="mb-2">
        <Heading3 className="mb-1">{t("selectAccount")}</Heading3>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="dark:text-dark-text-secondary flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500">
            <span>{t("totalKeys", { count: tokens.length })}</span>
            <span>
              {t("enabledCount", {
                count: tokens.filter((token) => token.status === 1).length,
              })}
            </span>
            <span>{t("showingCount", { count: filteredTokens.length })}</span>
            {isAllAccountsMode && tokenLoadProgress ? (
              <span>
                {t("allAccountsProgress", {
                  loaded: tokenLoadProgress.loaded,
                  total: tokenLoadProgress.total,
                })}
                {tokenLoadProgress.loading > 0
                  ? ` · ${t("allAccountsLoading", {
                      count: tokenLoadProgress.loading,
                    })}`
                  : ""}
              </span>
            ) : null}
          </div>

          {failedCount > 0 ? (
            <div className="flex items-center gap-2">
              <Badge
                variant="warning"
                size="sm"
                title={
                  failedAccountNames
                    ? `${t("allAccountsFailed", { count: failedCount })}: ${failedAccountNames}`
                    : t("allAccountsFailed", { count: failedCount })
                }
              >
                {t("allAccountsFailed", { count: failedCount })}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={onRetryFailedAccounts}
                disabled={!onRetryFailedAccounts}
              >
                {t("actions.retryFailed")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
