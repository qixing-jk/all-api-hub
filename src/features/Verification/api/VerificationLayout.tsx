import { Info } from "lucide-react"
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
  ExternalUrlText,
  Heading5,
  Heading6,
  IconButton,
} from "~/components/ui"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import {
  VERIFICATION_SOURCE_KINDS,
  type VerificationSourceKind,
} from "~/features/Verification/api/types"
import { useVerificationWorkspaceHeight } from "~/features/Verification/api/useVerificationWorkspaceHeight"
import { VerificationHistorySummary } from "~/features/Verification/api/VerificationHistorySummary"
import { VerificationSelectionContext } from "~/features/Verification/api/VerificationSelectionContext"
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
      <span className="text-foreground/80 min-w-0 font-medium break-words">
        {sourceKind === VERIFICATION_SOURCE_KINDS.Account
          ? t("verifyDialog.source.account", { name })
          : t("verifyDialog.source.profile", { name })}
      </span>
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

/** One persistent test tree: a scrolling list and detail pane, or inline details on narrow screens. */
export function VerificationTestSection({
  children,
  tools,
}: {
  children: ReactNode
  tools: ReactNode
}) {
  const { t } = useTranslation("aiApiVerification")
  const [selectedId, select] = useState<string | null>(null)
  const { frameRef, isWide, availableHeight } =
    useVerificationWorkspaceHeight(selectedId)
  const items = useRef(new Set<string>())
  const register = useCallback((id: string) => {
    items.current.add(id)
    select((current) => current ?? id)
    return () => {
      items.current.delete(id)
      select((current) =>
        current === id ? items.current.values().next().value ?? null : current,
      )
    }
  }, [])
  const selection = useMemo(
    () => ({ selectedId, select, register, isWide, availableHeight }),
    [selectedId, register, isWide, availableHeight],
  )
  return (
    <VerificationSelectionContext.Provider value={selection}>
      <div
        className="pt-density-1 sm:pt-density-2 @container"
        data-testid="verification-workspace"
      >
        <div
          ref={frameRef}
          className="relative min-w-0 [--verification-list-width:21rem] [@container(min-width:52rem)]:h-(--verification-workspace-height)"
        >
          <div
            aria-hidden="true"
            className="bg-surface-subtle pointer-events-none absolute inset-y-0 right-0 left-[calc(var(--verification-list-width)+1.25rem)] hidden rounded-xl [@container(min-width:52rem)]:block"
          />
          <div
            data-verification-list
            className="overscroll-y-contain [@container(min-width:52rem)]:h-full [@container(min-width:52rem)]:w-(--verification-list-width) [@container(min-width:52rem)]:overflow-y-auto"
          >
            <div data-verification-list-content className="space-y-4">
              <section
                aria-label={t("verifyDialog.sections.routine")}
                className="min-w-0 space-y-2"
              >
                <Heading6 className="text-foreground/80 px-2 text-xs font-semibold [@container(min-width:52rem)]:px-3">
                  {t("verifyDialog.sections.routine")}
                </Heading6>
                <div className="[@container(min-width:52rem)]:space-y-1">
                  {children}
                </div>
              </section>
              <section
                aria-label={t("verifyDialog.sections.onDemand")}
                className="border-border min-w-0 space-y-2 border-t pt-4"
              >
                <Heading6 className="text-foreground/80 px-2 text-xs font-semibold [@container(min-width:52rem)]:px-3">
                  {t("verifyDialog.sections.onDemand")}
                </Heading6>
                <div className="[@container(min-width:52rem)]:space-y-1">
                  {tools}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </VerificationSelectionContext.Provider>
  )
}

/** Native hover text and a keyboard/touch disclosure work in both document and shadow roots. */
function VerificationTestNotice({
  portalContainer,
}: {
  portalContainer?: HTMLElement
}) {
  const { t } = useTranslation("aiApiVerification")
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton
          type="button"
          variant="ghost"
          size="none"
          className="text-muted-foreground size-6 shrink-0"
          aria-label={t("verifyDialog.about")}
          title={t("verifyDialog.warning")}
          disableAutoTooltip
        >
          <Info className="size-3.5" aria-hidden="true" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        container={portalContainer}
        aria-label={t("verifyDialog.about")}
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] p-3 text-xs leading-relaxed"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        {t("verifyDialog.warning")}
      </PopoverContent>
    </Popover>
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
            <VerificationTestNotice portalContainer={portalContainer} />
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
          <VerificationTestNotice portalContainer={portalContainer} />
          {resolvedSummary ? (
            <div className="flex shrink-0 items-center">{resolvedSummary}</div>
          ) : null}
        </div>
      )}
    </div>
  )
}
