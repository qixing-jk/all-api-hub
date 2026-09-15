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
      className="text-muted-foreground h-auto min-h-(--density-control-xs) justify-end px-0 py-0 text-xs"
      onClick={dismissControls.onRequestPermanentDismiss}
    >
      {dismissControls.permanentlyDismissLabel}
    </Button>
  ) : null

  return (
    <Card className="border-border/80 bg-card/95 shadow-border/60 dark:border-foreground/10 dark:shadow-shadow/20 relative overflow-hidden shadow-sm">
      <div
        className={cn(
          "gap-y-density-4 py-density-4 grid gap-x-4 px-4 lg:items-stretch",
          hasActionRail && "lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.45fr)]",
        )}
      >
        <div className="space-y-density-3 min-w-0">
          <div className="gap-y-density-2 flex min-w-0 items-start gap-x-2">
            <div className="gap-y-density-2 flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
              <Badge variant={badgeVariant} size="sm" className="shrink-0">
                {badge}
              </Badge>
              <h4 className="text-foreground min-w-0 flex-1 text-base leading-6 font-semibold break-words">
                {title}
              </h4>
            </div>
            {dismissControls ? (
              <div
                data-guidance-dismiss-action-header
                className="flex shrink-0"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  data-guidance-session-dismiss
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={dismissControls.dismissForSessionLabel}
                  title={dismissControls.dismissForSessionLabel}
                  onClick={dismissControls.onDismissForSession}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>

          <p className="dark:text-secondary-foreground text-muted-foreground max-w-4xl text-sm leading-6">
            {description}
          </p>

          {notes}
        </div>

        {hasActionRail ? (
          <div
            data-guidance-action-rail
            className="gap-y-density-3 flex min-w-0 flex-col gap-x-3"
          >
            {actions ? (
              <div
                data-guidance-action-panel
                className={cn(
                  "border-border/70 bg-surface-subtle/70 dark:border-foreground/10 dark:bg-foreground/[0.035] gap-y-density-3 py-density-3 flex min-w-0 flex-1 flex-col gap-x-3 rounded-lg border px-3",
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
    <div className="border-border/70 bg-card/70 text-muted-foreground dark:border-foreground/10 dark:bg-foreground/[0.035] dark:text-secondary-foreground gap-y-density-2-5 py-density-3 flex min-w-0 gap-x-2.5 rounded-md border px-3 text-sm leading-5">
      <Icon
        className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
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
          "border-border/70 bg-card/70 hover:border-theme-200 hover:bg-theme-50/40 dark:border-foreground/10 dark:bg-foreground/[0.035] dark:hover:border-theme-900/70 dark:hover:bg-theme-950/10",
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
