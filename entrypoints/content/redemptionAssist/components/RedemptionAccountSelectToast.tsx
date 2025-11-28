import React, { useState } from "react"
import { useTranslation } from "react-i18next"

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

  const handleConfirm = () => {
    const account = accounts.find((a) => a.id === selectedId) || null
    onSelect(account)
  }

  const handleCancel = () => {
    onSelect(null)
  }

  return (
    <div
      data-all-api-hub="redemption-assist-account-select"
      className="border-border bg-background/95 flex w-[360px] max-w-[96vw] flex-col gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur">
      <div className="flex flex-col gap-1">
        <div className="text-foreground text-sm font-medium">
          {title ||
            t("accountSelect.title", {
              defaultValue: "选择要用于兑换的账号"
            })}
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
        <button
          type="button"
          onClick={handleCancel}
          className="border-border text-foreground hover:bg-muted inline-flex items-center rounded-md border bg-transparent px-3 py-1 text-xs font-medium">
          {t("common:actions.cancel", { defaultValue: "取消" })}
        </button>
        <button
          type="button"
          disabled={!selectedId}
          onClick={handleConfirm}
          className="bg-semantic-info-600 hover:bg-semantic-info-500 inline-flex items-center rounded-md border border-transparent px-3 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
          {t("accountSelect.confirm", { defaultValue: "确认兑换" })}
        </button>
      </div>
    </div>
  )
}
