import { Info, X, type LucideIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

/** Contextual notice for injected pages; leaves page focus untouched. */
export function ContentNotice({
  title,
  titleId,
  children,
  actions,
  onClose,
  closeAnalyticsAction,
  icon: Icon = Info,
  iconClassName,
  className,
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  title: string
  titleId?: string
  children?: ReactNode
  actions?: ReactNode
  onClose?: () => void
  closeAnalyticsAction?: ComponentProps<typeof Button>["analyticsAction"]
  icon?: LucideIcon
  iconClassName?: string
}) {
  const { t } = useTranslation("common")
  return (
    <section
      {...props}
      aria-label={title}
      className={cn(
        "border-border bg-background text-foreground ring-border/50 pointer-events-auto min-w-0 overflow-hidden rounded-xl border text-sm break-words shadow-lg ring-1",
        className,
      )}
    >
      <header className="border-border/50 flex min-w-0 items-center gap-2 border-b px-4 py-2">
        <Icon
          aria-hidden="true"
          className={cn(
            "text-link size-4 shrink-0",
            iconClassName,
            props["aria-busy"] && "animate-spin motion-reduce:animate-none",
          )}
        />
        <h3 className="min-w-0 flex-1 text-sm leading-snug font-semibold">
          <span id={titleId}>{title}</span>
        </h3>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            analyticsAction={closeAnalyticsAction}
            aria-label={t("common:actions.close")}
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        )}
      </header>
      <div
        data-slot="notice-body"
        className="text-secondary-foreground flex min-w-0 flex-col gap-3 px-4 py-3"
      >
        {children}
      </div>
      {actions && (
        <footer className="border-border/50 flex flex-wrap items-center justify-end gap-2 border-t px-4 pt-2 pb-3">
          {actions}
        </footer>
      )}
    </section>
  )
}

/** Small buttons preserve action hierarchy without dominating injected notices. */
export function ContentNoticeAction({
  className,
  variant = "default",
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      type="button"
      variant={variant}
      size="sm"
      className={cn(
        variant === "link"
          ? "h-auto min-h-0 max-w-full p-0 text-left whitespace-normal"
          : "min-h-7 max-w-full px-2 py-1 text-xs leading-4 shadow-none",
        variant === "secondary" &&
          "border-border hover:bg-muted bg-transparent",
        className,
      )}
    />
  )
}
