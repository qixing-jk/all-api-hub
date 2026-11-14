import { Info } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { ExternalUrlText, Heading5, IconButton } from "~/components/ui"
import {
  VERIFICATION_SOURCE_KINDS,
  type VerificationSourceKind,
} from "~/features/Verification/api/types"
import { VerificationHistorySummary } from "~/features/Verification/api/VerificationHistorySummary"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"
import { formatFullTime, formatRelativeTime } from "~/utils/core/formatters"

/** Shared source identity for account, credential and CLI verification headers. */
export function VerificationSourceSubtitle({
  baseUrl,
  name,
  sourceKind,
}: {
  baseUrl: string
  name: string
  sourceKind: VerificationSourceKind
}) {
  const { t } = useTranslation("aiApiVerification")
  return (
    <>
      <ExternalUrlText value={baseUrl} className="font-mono break-all" />
      <span aria-hidden="true" className="text-muted-foreground/50">
        ·
      </span>
      <span className="min-w-0 font-medium break-words text-foreground/80">
        {sourceKind === VERIFICATION_SOURCE_KINDS.Account
          ? t("verifyDialog.source.account", { name })
          : t("verifyDialog.source.profile", { name })}
      </span>
    </>
  )
}

/** Shared contextual help works in document and shadow roots, including touch. */
function VerificationTestNotice({
  portalContainer,
}: {
  portalContainer?: HTMLElement
}) {
  const { t } = useTranslation("aiApiVerification")
  return (
    <Tooltip
      content={t("verifyDialog.warning")}
      portalContainer={portalContainer}
      anchorAsChild
      openOnClick
      className="max-w-[min(20rem,calc(100vw-2rem))] leading-relaxed"
    >
      <IconButton
        type="button"
        variant="ghost"
        size="none"
        className="size-6 shrink-0 text-muted-foreground"
        aria-label={t("verifyDialog.about")}
      >
        <Info className="size-3.5" aria-hidden="true" />
      </IconButton>
    </Tooltip>
  )
}

export type VerificationDialogHeaderProps = {
  title?: ReactNode
  subtitle?: ReactNode
  historySummary?: ApiVerificationHistorySummary | null
  summary?: ReactNode
  children?: ReactNode
  portalContainer?: HTMLElement
}

/** Keeps test interpretation and existing history with the dialog identity. */
export function VerificationDialogHeader({
  title,
  subtitle,
  historySummary,
  summary,
  children,
  portalContainer,
}: VerificationDialogHeaderProps) {
  const { t } = useTranslation("aiApiVerification")

  const resolvedSummary =
    historySummary !== undefined ? (
      historySummary ? (
        <VerificationHistorySummary summary={historySummary} hideTimestamp />
      ) : null
    ) : (
      summary
    )

  const date =
    historySummary?.verifiedAt != null
      ? new Date(historySummary.verifiedAt)
      : undefined
  const verificationTimestamp = date ? formatRelativeTime(date) : null
  const verificationTimestampIso = date ? date.toISOString() : undefined
  const fullTimestamp = date ? formatFullTime(date) : undefined

  return (
    <div className="w-full min-w-0 space-y-density-1-5 pr-8 sm:pr-10">
      {title ? (
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {typeof title === "string" ? (
              <Heading5 className="truncate font-semibold text-foreground">
                {title}
              </Heading5>
            ) : (
              title
            )}
            <VerificationTestNotice portalContainer={portalContainer} />
            {resolvedSummary ? (
              <div className="flex shrink-0 items-center">
                {resolvedSummary}
              </div>
            ) : null}
          </div>
          {subtitle || verificationTimestamp ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {subtitle}
              {verificationTimestamp ? (
                <>
                  {subtitle ? (
                    <span className="text-muted-foreground/50">·</span>
                  ) : null}
                  <time
                    dateTime={verificationTimestampIso}
                    title={
                      fullTimestamp ?? t("verifyDialog.history.lastVerified")
                    }
                    className="cursor-default text-muted-foreground"
                  >
                    {verificationTimestamp}
                  </time>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          <VerificationTestNotice portalContainer={portalContainer} />
          {resolvedSummary ? (
            <div className="flex shrink-0 items-center">{resolvedSummary}</div>
          ) : null}
        </div>
      )}
    </div>
  )
}
