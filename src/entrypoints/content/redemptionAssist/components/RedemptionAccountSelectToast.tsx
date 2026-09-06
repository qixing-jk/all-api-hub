import React, { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import AccountSearchInput from "~/features/AccountManagement/components/AccountList/AccountSearchInput"
import { useAccountSearch } from "~/features/AccountManagement/hooks/useAccountSearch"
import { cn } from "~/lib/utils"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  REDEMPTION_ACCOUNT_SUPPORT_STATUSES,
  type RedemptionAccountCandidate,
} from "~/services/redemption/accountCandidate"

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
  const { query, setQuery, clearSearch, searchResults, inSearchMode } =
    useAccountSearch(accounts)

  const displayedAccounts = useMemo<RedemptionAccountCandidate[]>(() => {
    if (!inSearchMode) return accounts
    if (searchResults.length === 0) return []
    return searchResults
      .map((result) =>
        accounts.find((account) => account.id === result.account.id),
      )
      .filter((account): account is RedemptionAccountCandidate =>
        Boolean(account),
      )
  }, [accounts, inSearchMode, searchResults])

  const selectableAccounts = useMemo(
    () =>
      displayedAccounts.filter(
        (account) =>
          account.automaticRedemptionSupport.status ===
          REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported,
      ),
    [displayedAccounts],
  )

  const [selectedId, setSelectedId] = useState<string | null>(
    selectableAccounts[0]?.id ?? null,
  )

  const selectedAccount = useMemo(() => {
    if (!selectedId) return selectableAccounts[0] ?? null
    return (
      selectableAccounts.find((account) => account.id === selectedId) ??
      selectableAccounts[0] ??
      null
    )
  }, [selectableAccounts, selectedId])

  const accountRefs = useRef(new Map<string, HTMLDivElement>())
  const titleId = React.useId()

  useEffect(() => {
    if (!selectableAccounts.some((account) => account.id === selectedId)) {
      setSelectedId(selectableAccounts[0]?.id ?? null)
    }
  }, [selectableAccounts, selectedId])

  useEffect(() => {
    if (!selectedAccount) return
    const el = accountRefs.current.get(selectedAccount.id)
    el?.scrollIntoView?.({ block: "nearest" })
  }, [selectedAccount])

  const confirmSelected = () => {
    onSelect(selectedAccount)
  }

  const moveSelection = (direction: -1 | 1) => {
    if (selectableAccounts.length === 0) return

    const currentIndex = selectableAccounts.findIndex(
      (account) => account.id === selectedAccount?.id,
    )
    const startIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex =
      (startIndex + direction + selectableAccounts.length) %
      selectableAccounts.length

    setSelectedId(selectableAccounts[nextIndex]?.id ?? null)
  }

  const handleKeyDownCapture = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented) return
    if (e.altKey || e.ctrlKey || e.metaKey) return

    if (
      e.key === "Enter" &&
      e.target instanceof HTMLElement &&
      e.target.closest("a, button")
    ) {
      return
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      e.stopPropagation()
      moveSelection(1)
      return
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      e.stopPropagation()
      moveSelection(-1)
      return
    }

    if (e.key === "Enter" && selectedAccount) {
      e.preventDefault()
      e.stopPropagation()
      confirmSelected()
    }
  }

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation()
    confirmSelected()
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
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
      <div
        className="border-border bg-background text-foreground pointer-events-auto flex w-full flex-col gap-3 rounded-lg border px-3 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm"
        onKeyDownCapture={handleKeyDownCapture}
      >
        <div className="flex flex-col gap-1">
          <div id={titleId} className="text-foreground text-sm font-medium">
            {title || t("accountSelect.title")}
          </div>
          {message && (
            <div className="text-muted-foreground text-xs whitespace-pre-line">
              {message}
            </div>
          )}
        </div>

        <AccountSearchInput
          value={query}
          onChange={setQuery}
          onClear={clearSearch}
        />

        <div
          className="max-h-56 space-y-1 overflow-y-auto pr-1"
          role="radiogroup"
          aria-labelledby={titleId}
        >
          {accounts.length > 0 &&
            accounts.every(
              (account) =>
                account.automaticRedemptionSupport.status ===
                REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported,
            ) && (
              <div className="bg-muted text-muted-foreground mb-2 rounded-md px-2 py-1.5 text-xs">
                {t("accountSelect.noSupportedAccounts")}
              </div>
            )}
          {displayedAccounts.length === 0 ? (
            <div className="text-muted-foreground py-4 text-center text-xs">
              {t("accountSelect.noResults")}
            </div>
          ) : (
            displayedAccounts.map((account, index) => {
              const isSupported =
                account.automaticRedemptionSupport.status ===
                REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported
              const checkInUrl =
                account.checkIn?.customCheckIn?.url || account.baseUrl
              const unsupportedReasonId = !isSupported
                ? `${titleId}-unsupported-${index}`
                : undefined
              return (
                <div
                  key={account.id}
                  ref={(el) => {
                    if (el) {
                      accountRefs.current.set(account.id, el)
                    } else {
                      accountRefs.current.delete(account.id)
                    }
                  }}
                  className={cn(
                    "border-border/60 flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-xs",
                    isSupported
                      ? "hover:bg-muted/70"
                      : "bg-muted/40 opacity-70",
                  )}
                >
                  <label
                    className={cn(
                      "flex flex-col gap-0.5",
                      isSupported ? "cursor-pointer" : "cursor-not-allowed",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        className="h-3 w-3"
                        disabled={!isSupported}
                        aria-describedby={unsupportedReasonId}
                        checked={selectedAccount?.id === account.id}
                        onChange={() => {
                          if (isSupported) setSelectedId(account.id)
                        }}
                      />
                      <span className="text-foreground font-medium">
                        {account.name}
                      </span>
                    </span>
                    {checkInUrl && (
                      <div className="text-muted-foreground truncate pl-5 text-[11px]">
                        {checkInUrl}
                      </div>
                    )}
                  </label>
                  {!isSupported && (
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-[11px]">
                      <span id={unsupportedReasonId}>
                        {t("accountSelect.unsupported")}
                      </span>
                      {checkInUrl ? (
                        <a
                          href={checkInUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline underline-offset-2"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {t("accountSelect.openSiteManual")}
                        </a>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button
            variant="secondary"
            analyticsAction={
              PRODUCT_ANALYTICS_ACTION_IDS.CancelRedemptionAccountSelection
            }
            onClick={handleCancel}
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            disabled={!selectedAccount}
            analyticsAction={
              PRODUCT_ANALYTICS_ACTION_IDS.ConfirmRedemptionAccountSelection
            }
            onClick={handleConfirm}
          >
            {t("accountSelect.confirm")}
          </Button>
        </div>
      </div>
    </ProductAnalyticsScope>
  )
}
