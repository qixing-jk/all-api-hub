import type { Ref } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "~/lib/utils"
import {
  REDEMPTION_ACCOUNT_SUPPORT_STATUSES,
  type RedemptionAccountCandidate,
} from "~/services/redemption/contracts"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"
import {
  getSiteSupportRequestUrl,
  SITE_SUPPORT_ERROR_TYPES,
} from "~/utils/navigation/feedbackLinks"

/** Renders a receiving account and its supported recovery actions. */
export function RedemptionAccountOption({
  account,
  index,
  titleId,
  selected,
  onSelect,
  rowRef,
}: {
  account: RedemptionAccountCandidate
  index: number
  titleId: string
  selected: boolean
  onSelect: (id: string) => void
  rowRef: Ref<HTMLDivElement>
}) {
  const { t } = useTranslation("redemptionAssist")
  const isSupported =
    account.automaticRedemptionSupport.status ===
    REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported
  const unsupportedReasonId = !isSupported
    ? `${titleId}-unsupported-${index}`
    : undefined
  return (
    <div
      ref={rowRef}
      className={cn(
        "flex flex-col gap-0.5 rounded-md border border-border/60 px-2 py-density-1-5 text-xs",
        isSupported ? "hover:bg-muted/70" : "bg-muted/40",
      )}
    >
      <label
        className={cn(
          "flex flex-col gap-0.5",
          isSupported ? "cursor-pointer" : "cursor-not-allowed opacity-70",
        )}
      >
        <span className="flex items-center gap-x-2 gap-y-density-2">
          <input
            type="radio"
            className="h-3 w-3"
            disabled={!isSupported}
            aria-describedby={unsupportedReasonId}
            checked={selected}
            onChange={() => {
              if (isSupported) onSelect(account.id)
            }}
          />
          <span className="font-medium text-foreground">{account.name}</span>
        </span>
        {account.baseUrl && (
          <div className="truncate pl-5 text-2xs text-muted-foreground">
            {account.baseUrl}
          </div>
        )}
      </label>
      {!isSupported && (
        <div className="flex flex-col gap-y-density-1 pl-5 text-2xs text-muted-foreground">
          <span id={unsupportedReasonId}>{t("accountSelect.unsupported")}</span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-density-1">
            {account.manualRedemptionUrl ? (
              <a
                href={account.manualRedemptionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link underline underline-offset-2"
                onClick={(event) => event.stopPropagation()}
              >
                {t("accountSelect.openSiteManual")}
              </a>
            ) : null}
            <a
              href={getSiteSupportRequestUrl({
                siteUrl: tryParseHttpUrl(account.baseUrl)?.origin,
                errorType: SITE_SUPPORT_ERROR_TYPES.RedemptionUnsupported,
                errorMessage: t("accountSelect.supportRequestMessage", {
                  siteType: account.siteType,
                }),
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link underline underline-offset-2"
              onClick={(event) => event.stopPropagation()}
            >
              {t("accountSelect.requestSupport")}
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
