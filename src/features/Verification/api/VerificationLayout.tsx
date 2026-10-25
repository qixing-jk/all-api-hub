import { Info } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { ExternalUrlText, Heading5 } from "~/components/ui"
import { VerificationHistorySummary } from "~/features/Verification/api/VerificationHistorySummary"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"
import { formatFullTime, formatRelativeTime } from "~/utils/core/formatters"

/** Shared source identity for account, credential and CLI verification headers. */
export function VerificationSourceSubtitle({
  baseUrl,
  name,
}: {
  baseUrl: string
  name: string
}) {
  return (
    <>
      <ExternalUrlText value={baseUrl} className="font-mono break-all" />
      <span aria-hidden="true" className="text-muted-foreground/50">
        ·
      </span>
      <span className="text-foreground/80 font-medium">{name}</span>
    </>
  )
}

/** Groups the request fields without coupling the entry points' form state. */
export function VerificationConfigSection({
  children,
}: {
  children: ReactNode
}) {
  const { t } = useTranslation("aiApiVerification")
  return (
    <section
      aria-label={t("verifyDialog.meta.configuration")}
      data-testid="verification-config"
      className="min-w-0"
    >
      {children}
    </section>
  )
}

/** Owns test separators and spacing; the dialog body owns the final inset. */
export function VerificationTestSection({ children }: { children: ReactNode }) {
  return (
    <div className="border-border pt-density-6 border-t">
      <div className="divide-border-subtle [&>*]:py-density-4 divide-y [&>:first-child]:pt-0 [&>:last-child]:pb-0">
        {children}
      </div>
    </div>
  )
}

/** Explains the scope of a probe; this is context, not a warning state. */
function VerificationTestNotice() {
  const { t } = useTranslation("aiApiVerification")
  return (
    <p
      role="note"
      className="text-muted-foreground/80 flex items-center gap-1.5 text-xs leading-normal"
    >
      <Info
        className="text-muted-foreground/70 size-3.5 shrink-0"
        aria-hidden="true"
      />
      <span>{t("verifyDialog.warning")}</span>
    </p>
  )
}

export type VerificationDialogHeaderProps = {
  title?: ReactNode
  subtitle?: ReactNode
  historySummary?: ApiVerificationHistorySummary | null
  summary?: ReactNode
  children?: ReactNode
}

/** Keeps test interpretation and existing history with the dialog identity. */
export function VerificationDialogHeader({
  title,
  subtitle,
  historySummary,
  summary,
  children,
}: VerificationDialogHeaderProps) {
  const { t } = useTranslation("aiApiVerification")

  const resolvedSummary =
    historySummary !== undefined ? (
      <VerificationHistorySummary summary={historySummary} hideTimestamp />
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
    <div className="space-y-density-1-5 w-full min-w-0 pr-8 sm:pr-10">
      {title ? (
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {typeof title === "string" ? (
              <Heading5 className="text-foreground truncate font-semibold">
                {title}
              </Heading5>
            ) : (
              title
            )}
            {resolvedSummary ? (
              <div className="flex shrink-0 items-center">
                {resolvedSummary}
              </div>
            ) : null}
          </div>
          {subtitle || verificationTimestamp ? (
            <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
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
                    className="text-muted-foreground cursor-default"
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
          {resolvedSummary ? (
            <div className="flex shrink-0 items-center">{resolvedSummary}</div>
          ) : null}
        </div>
      )}
      <VerificationTestNotice />
    </div>
  )
}
