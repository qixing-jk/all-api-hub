import { ChevronDown, ClipboardList } from "lucide-react"
import { useId, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button, Heading6 } from "~/components/ui"
import { cn } from "~/lib/utils"

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
  const icon = (
    <ClipboardList
      className="text-muted-foreground size-4 shrink-0"
      aria-hidden="true"
    />
  )
  const label = title ?? t("verifyDialog.details.result")
  return (
    <section
      aria-labelledby={id}
      className="bg-card dark:bg-background border-border overflow-hidden rounded-xl border shadow-sm"
    >
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading6
            id={id}
            className="text-foreground flex shrink-0 items-center gap-2 text-sm font-semibold"
          >
            {onToggle ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-foreground -my-1 justify-start gap-x-2 px-0 text-left text-sm font-semibold whitespace-nowrap"
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
          <div className="text-foreground text-sm leading-relaxed">
            {summary}
          </div>
        ) : null}
      </div>
      {children ? (
        <div
          id={`${id}-body`}
          hidden={bodyHidden}
          className="border-border space-y-density-3 border-t p-4"
        >
          {children}
        </div>
      ) : null}
    </section>
  )
}
