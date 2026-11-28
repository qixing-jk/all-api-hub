import React from "react"
import { useTranslation } from "react-i18next"

import {
  ContentNotice,
  ContentNoticeAction,
} from "~/components/toast/ContentNotice"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import AccountSearchInput from "~/features/AccountManagement/components/AccountList/filtering/AccountSearchInput"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { RedemptionAccountCandidate } from "~/services/redemption/contracts"

import { useRedemptionAccountSelection } from "../useRedemptionAccountSelection"
import { RedemptionAccountOption } from "./RedemptionAccountOption"

export interface RedemptionAccountSelectToastProps {
  title?: string
  message?: string
  accounts: RedemptionAccountCandidate[]
  onSelect: (account: RedemptionAccountCandidate | null) => void
}

export const RedemptionAccountSelectToast: React.FC<
  RedemptionAccountSelectToastProps
> = ({ title, message, accounts, onSelect }) => {
  const { t } = useTranslation("redemptionAssist")
  const {
    query,
    setQuery,
    clearSearch,
    displayedAccounts,
    selectableAccounts,
    selectedAccount,
    setSelectedId,
    accountRefs,
    handleKeyDownCapture,
  } = useRedemptionAccountSelection(accounts, onSelect)
  const titleId = React.useId()

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(selectedAccount)
  }

  const handleCancel = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    onSelect(null)
  }

  return (
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Content}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist}
      surfaceId={
        PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionAccountSelectToast
      }
    >
      <ContentNotice
        title={title || t("accountSelect.title")}
        titleId={titleId}
        onClose={handleCancel}
        closeAnalyticsAction={
          PRODUCT_ANALYTICS_ACTION_IDS.CancelRedemptionAccountSelection
        }
        actions={
          <>
            <ContentNoticeAction
              variant="secondary"
              analyticsAction={
                PRODUCT_ANALYTICS_ACTION_IDS.CancelRedemptionAccountSelection
              }
              onClick={handleCancel}
            >
              {t("common:actions.cancel")}
            </ContentNoticeAction>
            <ContentNoticeAction
              disabled={!selectedAccount}
              analyticsAction={
                PRODUCT_ANALYTICS_ACTION_IDS.ConfirmRedemptionAccountSelection
              }
              onClick={handleConfirm}
            >
              {t("accountSelect.confirm")}
            </ContentNoticeAction>
          </>
        }
        onKeyDownCapture={handleKeyDownCapture}
      >
        {message && (
          <div className="text-xs whitespace-pre-line text-muted-foreground">
            {message}
          </div>
        )}

        <AccountSearchInput
          autoFocus={false}
          value={query}
          onChange={setQuery}
          onClear={clearSearch}
        />

        <div
          className="max-h-56 space-y-density-1 overflow-y-auto pr-1"
          role="radiogroup"
          aria-labelledby={titleId}
        >
          {displayedAccounts.length > 0 && selectableAccounts.length === 0 && (
            <div className="mb-density-2 rounded-md bg-muted px-2 py-density-1-5 text-xs text-muted-foreground">
              {t("accountSelect.noSupportedAccounts")}
            </div>
          )}
          {displayedAccounts.length === 0 ? (
            <div className="py-density-4 text-center text-xs text-muted-foreground">
              {t("accountSelect.noResults")}
            </div>
          ) : (
            displayedAccounts.map((account, index) => {
              return (
                <RedemptionAccountOption
                  key={account.id}
                  account={account}
                  index={index}
                  titleId={titleId}
                  selected={selectedAccount?.id === account.id}
                  onSelect={setSelectedId}
                  rowRef={(el) => {
                    if (el) accountRefs.current.set(account.id, el)
                    else accountRefs.current.delete(account.id)
                  }}
                />
              )
            })
          )}
        </div>
      </ContentNotice>
    </ProductAnalyticsScope>
  )
}
