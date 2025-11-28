import React, { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import type { DisplaySiteData } from "~/types"

export interface RedemptionAccountSelectToastProps {
  title?: string
  message?: string
  accounts: DisplaySiteData[]
  onSelect: (account: DisplaySiteData | null) => void
}

export const RedemptionAccountSelectToast: React.FC<
  RedemptionAccountSelectToastProps
> = ({ title, message, accounts, onSelect }) => {
  const { t } = useTranslation("redemptionAssist")
  const [selectedId, setSelectedId] = useState<string | null>(
    accounts[0]?.id ?? null
  )

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation()
    const account = accounts.find((a) => a.id === selectedId) || null
    onSelect(account)
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(null)
  }

  return (
    <div
      data-all-api-hub="redemption-assist-account-select"
      className="border-border bg-background/95 flex w-[360px] max-w-[96vw] flex-col gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur">
      <div className="flex flex-col gap-1">
        <div className="text-foreground text-sm font-medium">
          {title || t("accountSelect.title")}
        </div>
        {message && (
          <div className="text-muted-foreground text-xs whitespace-pre-line">
            {message}
          </div>
        )}
      </div>

      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {accounts.map((account) => {
          const checkInUrl =
            account.checkIn?.customCheckInUrl || account.baseUrl
          return (
            <label
              key={account.id}
              className="border-border/60 hover:bg-muted/70 flex cursor-pointer flex-col gap-0.5 rounded-md border px-2 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  className="h-3 w-3"
                  checked={selectedId === account.id}
                  onChange={() => setSelectedId(account.id)}
                />
                <span className="text-foreground font-medium">
                  {account.name}
                </span>
              </div>
              {checkInUrl && (
                <div className="text-muted-foreground truncate pl-5 text-[11px]">
                  {checkInUrl}
                </div>
              )}
            </label>
          )
        })}
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={handleCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button disabled={!selectedId} onClick={handleConfirm}>
          {t("accountSelect.confirm")}
        </Button>
      </div>
    </div>
  )
}
