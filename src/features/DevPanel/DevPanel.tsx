import { Bug, ChevronRight, X } from "lucide-react"
import { useState } from "react"

import Tooltip from "~/components/Tooltip"
import { Z_INDEX } from "~/constants/designTokens"
import { cn } from "~/lib/utils"
import { isDevelopmentMode } from "~/utils/core/environment"

import {
  useDevPanelSections,
  useDevPanelSurface,
  useRegisterDevPanelSection,
} from "./DevPanelSectionsContext"
import { useDialogDebugDevSection } from "./sections/dialogDebugSection"
import { useFixtureAccountsDevSection } from "./sections/fixtureAccountsSection"
import {
  useBalanceHistoryDevSection,
  useDevPagesSection,
} from "./sections/miscSections"
import { isDevPanelSectionVisible, type DevPanelSection } from "./types"

const PANEL_TRIGGER_LABEL = "Dev: Open dev panel"

/**
 * Renders one section's title and its action buttons.
 */
function DevPanelSectionView({ section }: { section: DevPanelSection }) {
  const SectionIcon = section.icon

  return (
    <div className="border-border rounded-lg border px-3 py-2.5">
      <div className="text-muted-foreground mb-2 flex items-center gap-x-1.5 text-xs font-medium">
        {SectionIcon ? <SectionIcon className="h-3.5 w-3.5" /> : null}
        <span>{section.title}</span>
      </div>
      {section.description ? (
        <p className="text-muted-foreground mb-2 text-xs leading-snug">
          {section.description}
        </p>
      ) : null}
      <div className="flex flex-col items-stretch gap-1.5">
        {section.actions.map((action) => {
          const ActionIcon = action.icon
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => void action.run()}
              disabled={action.disabled || action.loading}
              aria-busy={action.loading || undefined}
              className={cn(
                "border-border bg-background hover:bg-accent text-foreground hover:text-accent-foreground focus-visible:ring-ring flex items-center gap-x-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {action.loading ? (
                <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : ActionIcon ? (
                <ActionIcon className="size-3.5 shrink-0" />
              ) : (
                <span className="size-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{action.label}</span>
              <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Static sections owned by the panel itself; page-scoped sections register
 * from their own features.
 */
function DevPanelStaticSections({ isPanelOpen }: { isPanelOpen: boolean }) {
  useRegisterDevPanelSection(useDialogDebugDevSection())
  useRegisterDevPanelSection(useFixtureAccountsDevSection(isPanelOpen))
  useRegisterDevPanelSection(useBalanceHistoryDevSection())
  useRegisterDevPanelSection(useDevPagesSection())
  return null
}

/**
 * The floating ball and its panel sheet. Renders nothing outside development.
 */
function DevPanelBall() {
  const [isOpen, setIsOpen] = useState(false)
  const { surface, page } = useDevPanelSurface()
  const registeredSections = useDevPanelSections()

  if (!isDevelopmentMode()) {
    return null
  }

  const visibleSections = registeredSections.filter((section) =>
    isDevPanelSectionVisible(section, { surface, page }),
  )

  const surfaceLabel =
    surface === "options"
      ? "Options"
      : surface === "sidepanel"
        ? "Side panel"
        : "Popup"

  return (
    <>
      <DevPanelStaticSections isPanelOpen={isOpen} />
      <Tooltip content={PANEL_TRIGGER_LABEL}>
        <button
          type="button"
          aria-label={PANEL_TRIGGER_LABEL}
          data-testid="dev-panel-trigger"
          onClick={() => setIsOpen(true)}
          className={cn(
            Z_INDEX.floating,
            "bg-popover text-popover-foreground border-border fixed top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border opacity-60 shadow-md transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:outline-hidden",
          )}
        >
          <Bug className="size-4" />
        </button>
      </Tooltip>
      {isOpen ? (
        <div
          className={cn(
            Z_INDEX.modal,
            "bg-popover text-popover-foreground border-border fixed inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col border-l shadow-lg",
          )}
          role="dialog"
          aria-label="Dev panel"
          data-testid="dev-panel"
        >
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-foreground text-sm font-semibold">Dev panel</p>
              <p className="text-muted-foreground text-xs">{surfaceLabel}</p>
            </div>
            <Tooltip content="Dev: Close dev panel">
              <button
                type="button"
                aria-label="Close dev panel"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1"
              >
                <X className="size-4" />
              </button>
            </Tooltip>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
            {visibleSections.length === 0 ? (
              <p className="text-muted-foreground px-1 py-4 text-center text-xs">
                No dev sections registered on this page.
              </p>
            ) : (
              visibleSections.map((section) => (
                <DevPanelSectionView key={section.id} section={section} />
              ))
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}

/**
 * Dev-only floating panel ball + sheet. Mount inside a DevPanelProvider;
 * renders nothing outside development mode.
 */
export function DevPanel() {
  return <DevPanelBall />
}
