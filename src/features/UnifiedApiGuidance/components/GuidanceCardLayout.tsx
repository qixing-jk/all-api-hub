import { ArrowRight, KeyRound, ServerCog, X } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

import { Badge, Button, Card, Spinner } from "~/components/ui"
import { cn } from "~/lib/utils"

type GuidanceCardBadgeVariant = ComponentProps<typeof Badge>["variant"]
type GuidanceCardActionPanelJustify = "start" | "between"
type GuidanceCardNoteIcon = "key" | "managedSite"

interface GuidanceCardLayoutProps {
  badge: ReactNode
  badgeVariant: GuidanceCardBadgeVariant
  title: ReactNode
  description: ReactNode
  notes: ReactNode
  actions?: ReactNode
  actionPanelJustify?: GuidanceCardActionPanelJustify
  dismissControls?: {
    dismissForSessionLabel: string
    permanentlyDismissLabel: string
    onDismissForSession: () => void
    onRequestPermanentDismiss: () => void
  }
}

/**
 * Shared visual shell for unified-API guidance cards.
 */
export function GuidanceCardLayout({
  badge,
  badgeVariant,
  title,
  description,
  notes,
  actions,
  actionPanelJustify = "between",
  dismissControls,
}: GuidanceCardLayoutProps) {
  const hasActionRail = Boolean(actions || dismissControls)
  const permanentDismissButton = dismissControls ? (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto justify-end px-0 py-0 text-xs text-slate-500 dark:text-slate-400"
      onClick={dismissControls.onRequestPermanentDismiss}
    >
      {dismissControls.permanentlyDismissLabel}
    </Button>
  ) : null

  return (
    <Card className="dark:bg-dark-bg-secondary/95 relative overflow-hidden border-slate-200/80 bg-white/95 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:shadow-black/20">
      <div
        className={cn(
          "grid gap-4 p-4 lg:items-stretch",
          dismissControls && "pr-10 lg:pr-4",
          hasActionRail && "lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.45fr)]",
        )}
      >
        <div className="min-w-0 space-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant={badgeVariant} size="sm" className="shrink-0">
              {badge}
            </Badge>
            <h4 className="min-w-0 text-base leading-6 font-semibold break-words text-slate-950 dark:text-white">
              {title}
            </h4>
          </div>

          <p className="dark:text-dark-text-secondary max-w-4xl text-sm leading-6 text-slate-600">
            {description}
          </p>

          {notes}
        </div>

        {hasActionRail ? (
          <div
            data-guidance-action-rail
            className="flex min-w-0 flex-col gap-3"
          >
            {dismissControls ? (
              <div
                data-guidance-dismiss-action-header
                className="contents lg:flex lg:justify-end"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  data-guidance-session-dismiss
                  className="absolute top-3 right-3 text-slate-500 hover:text-slate-900 lg:static dark:text-slate-400 dark:hover:text-white"
                  aria-label={dismissControls.dismissForSessionLabel}
                  title={dismissControls.dismissForSessionLabel}
                  onClick={dismissControls.onDismissForSession}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            ) : null}
            {actions ? (
              <div
                data-guidance-action-panel
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-slate-200/70 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.035]",
                  actionPanelJustify === "between"
                    ? "justify-between"
                    : "justify-start",
                )}
              >
                {actions}
              </div>
            ) : null}
            {permanentDismissButton ? (
              <div
                data-guidance-dismiss-action-footer
                className="mt-auto flex justify-end"
              >
                {permanentDismissButton}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  )
}

/**
 * Compact explanatory note used inside guidance cards.
 */
export function GuidanceCardNote({
  icon,
  children,
}: {
  icon: GuidanceCardNoteIcon
  children: ReactNode
}) {
  const Icon = icon === "key" ? KeyRound : ServerCog

  return (
    <div className="flex min-w-0 gap-2.5 rounded-md border border-slate-200/70 bg-white/70 p-3 text-sm leading-5 text-slate-600 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300">
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400"
        aria-hidden
      />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

/**
 * CTA button style shared by guidance card action panels.
 */
export function GuidanceCardActionButton({
  children,
  onClick,
  primary = false,
  busy = false,
  testId,
}: {
  children: ReactNode
  onClick: () => void
  primary?: boolean
  busy?: boolean
  testId?: string
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={primary ? "default" : "outline"}
      className={cn(
        "w-full justify-between whitespace-normal",
        !primary &&
          "border-slate-200/70 bg-white/70 hover:border-blue-200 hover:bg-blue-50/40 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-blue-900/70 dark:hover:bg-blue-950/10",
      )}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      data-testid={testId}
      rightIcon={
        busy ? (
          <Spinner size="sm" />
        ) : (
          <ArrowRight className="h-4 w-4" aria-hidden />
        )
      }
      onClick={() => {
        if (!busy) onClick()
      }}
    >
      <span className="min-w-0 text-left break-words">{children}</span>
    </Button>
  )
}
