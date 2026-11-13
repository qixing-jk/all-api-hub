import { ChevronDown, ClipboardList } from "lucide-react"
import { useContext, useId, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { Button, Heading6 } from "~/components/ui"
import { cn } from "~/lib/utils"

import {
  VerificationDetailContext,
  VerificationSelectionContext,
} from "./VerificationSelectionContext"

/** Shared result surface; each test owns its conclusion and evidence. */
export function VerificationResultCard({
  title,
  status,
  summary,
  bodyHidden = false,
  onToggle,
  children,
}: {
  title?: ReactNode
  status?: ReactNode
  summary?: ReactNode
  bodyHidden?: boolean
  onToggle?: () => void
  children?: ReactNode
}) {
  const { t } = useTranslation("aiApiVerification")
  const id = useId()
  const workspace = useContext(VerificationSelectionContext)
  const inline = Boolean(workspace && !onToggle && !title)
  const detail = useContext(VerificationDetailContext)
  const headerTarget = inline ? detail?.headerTarget : null
  const headerActionsTarget = detail?.headerActionsTarget ?? headerTarget
  const headerSummary = headerTarget ? summary : null
  const icon = (
    <ClipboardList
      className="size-4 shrink-0 text-muted-foreground"
      aria-hidden="true"
    />
  )
  const label = title ?? t("verifyDialog.details.result")
  return (
    <section
      hidden={inline && Boolean(headerTarget) && bodyHidden}
      aria-labelledby={inline ? undefined : id}
      aria-label={inline ? t("verifyDialog.details.result") : undefined}
      data-slot="verification-result"
      className={cn(
        "flex flex-col overflow-hidden",
        !workspace &&
          "rounded-xl border border-border bg-card dark:bg-background",
        // Small dialogs scroll the outer pane instead of crushing evidence and
        // diagnostic controls into a viewport with no usable height.
        !bodyHidden &&
          "[@container(min-width:52rem)]:min-h-80 [@container(min-width:52rem)]:flex-1",
      )}
    >
      {inline ? (
        <>
          {headerTarget && headerSummary
            ? createPortal(
                <div
                  hidden={!detail?.selected}
                  className={cn(
                    "order-first min-w-0 flex-1 text-xs font-normal text-muted-foreground",
                    typeof summary === "string" && "truncate",
                  )}
                  title={typeof summary === "string" ? summary : undefined}
                >
                  {headerSummary}
                </div>,
                headerTarget,
                id,
              )
            : null}
          {headerTarget && status
            ? createPortal(
                <div
                  hidden={!detail?.selected}
                  data-verification-header-actions
                  className="order-last ml-auto flex shrink-0 flex-wrap items-center gap-2"
                >
                  {status}
                </div>,
                headerActionsTarget!,
                `${id}-actions`,
              )
            : null}
          {(summary && !headerTarget) || (status && !headerTarget) ? (
            <div className="shrink-0 space-y-3 pb-3 text-sm leading-relaxed text-foreground">
              {status && !headerTarget ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {status}
                </div>
              ) : null}
              {!headerSummary ? summary : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="shrink-0 space-y-3 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Heading6
              id={id}
              className="flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground"
            >
              {onToggle ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="-my-1 justify-start gap-x-2 px-0 text-left text-sm font-semibold whitespace-nowrap text-foreground"
                  leftIcon={icon}
                  rightIcon={
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "size-4 transition-transform motion-reduce:transition-none",
                        !bodyHidden && "rotate-180",
                      )}
                    />
                  }
                  aria-expanded={!bodyHidden}
                  aria-controls={`${id}-body`}
                  onClick={onToggle}
                >
                  {label}
                </Button>
              ) : (
                <>
                  {icon}
                  {label}
                </>
              )}
            </Heading6>
            {status ? (
              <div className="flex flex-wrap items-center gap-2">{status}</div>
            ) : null}
          </div>
          {summary ? (
            <div className="text-sm leading-relaxed text-foreground">
              {summary}
            </div>
          ) : null}
        </div>
      )}
      {children ? (
        <div
          id={`${id}-body`}
          hidden={bodyHidden}
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-density-3 [&>*:not(:first-child)]:shrink-0 [@container(min-width:52rem)]:overflow-y-auto",
            inline ? "p-1" : "border-t border-border p-3 sm:p-4",
          )}
        >
          {children}
        </div>
      ) : null}
    </section>
  )
}
