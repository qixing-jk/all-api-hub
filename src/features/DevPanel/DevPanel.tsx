import { Bug, ChevronRight, Copy, X } from "lucide-react"
import { useCallback, useState } from "react"

import Tooltip from "~/components/Tooltip"
import { Z_INDEX } from "~/constants/designTokens"
import toast from "~/lib/notify"
import { cn } from "~/lib/utils"
import { getDevIdentity } from "~/utils/browser/extensionIdentity"
import { formatDevInstanceLabel } from "~/utils/core/devBranding"
import type { DevIdentity } from "~/utils/core/devIdentity"
import { isDevelopmentMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"

import {
  useDevPanelSections,
  useDevPanelSurface,
  useRegisterDevPanelSection,
} from "./DevPanelSectionsContext"
import { useDialogDebugDevSection } from "./sections/dialogDebugSection"
import { useFixtureAccountsDevSection } from "./sections/fixtureAccountsSection"
import { useInstanceIdentityDevSection } from "./sections/instanceIdentitySection"
import {
  useBalanceHistoryDevSection,
  useDevPagesSection,
} from "./sections/miscSections"
import { useStarPromotionDevSection } from "./sections/starPromotionSection"
import {
  isDevPanelSectionVisible,
  type DevPanelInfoRow,
  type DevPanelSection,
} from "./types"

const PANEL_TRIGGER_LABEL = "Dev: Open dev panel"

/**
 * Tooltip for the floating ball: the action plus the build's directories, which
 * is the most this dev-only surface can say without opening the panel.
 */
function DevPanelTriggerTooltip({ identity }: { identity: DevIdentity }) {
  const directories = [identity.path, identity.outputPath].filter(
    (directory): directory is string => Boolean(directory),
  )

  if (directories.length === 0) return PANEL_TRIGGER_LABEL

  return (
    <span className="flex flex-col gap-y-0.5 text-left">
      <span>{PANEL_TRIGGER_LABEL}</span>
      {directories.map((directory) => (
        <span key={directory} className="font-mono text-xs break-all">
          {directory}
        </span>
      ))}
    </span>
  )
}

/**
 * One read-only fact, with its reliability and a copy affordance for values that
 * are meant to be pasted elsewhere (paths, ids).
 */
function DevPanelInfoRowView({ row }: { row: DevPanelInfoRow }) {
  const handleCopy = useCallback(async () => {
    if (!row.value) return

    try {
      await navigator.clipboard.writeText(row.value)
      toast.success(`Dev: copied ${row.label}`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }, [row.label, row.value])

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-x-2">
        <span className="text-muted-foreground text-xs">{row.label}</span>
        {row.tone && row.tone !== "stable" ? (
          <span className="text-muted-foreground shrink-0 text-xs italic">
            {row.tone}
          </span>
        ) : null}
      </div>
      <div className="flex items-start gap-x-1.5">
        <span
          className={cn(
            "min-w-0 flex-1 font-mono text-xs break-all",
            !row.value && "text-muted-foreground italic",
          )}
        >
          {row.value ?? "unavailable"}
        </span>
        {row.copyable && row.value ? (
          <button
            type="button"
            aria-label={`Copy ${row.label}`}
            onClick={() => void handleCopy()}
            className="text-muted-foreground hover:text-foreground shrink-0 rounded-sm p-0.5"
          >
            <Copy className="size-3.5" />
          </button>
        ) : null}
      </div>
      {row.hint ? (
        <p className="text-muted-foreground text-xs leading-snug">{row.hint}</p>
      ) : null}
    </div>
  )
}

/**
 * Renders one section's title, its facts and its action buttons.
 *
 * Collapsible sections keep their body mounted so a collapsed section still
 * reports live state, such as whether it is currently loading.
 */
function DevPanelSectionView({ section }: { section: DevPanelSection }) {
  const SectionIcon = section.icon
  const [isExpanded, setIsExpanded] = useState(!section.defaultCollapsed)
  // A section that asks for a collapsed default is collapsible by definition, so
  // the two flags cannot disagree.
  const isCollapsible = Boolean(section.collapsible || section.defaultCollapsed)
  const showsBody = !isCollapsible || isExpanded

  const header = (
    <>
      {SectionIcon ? <SectionIcon className="h-3.5 w-3.5 shrink-0" /> : null}
      <span className="shrink-0">{section.title}</span>
      {!showsBody && section.summary ? (
        <span className="text-muted-foreground min-w-0 truncate">
          {section.summary}
        </span>
      ) : null}
    </>
  )

  return (
    <div className="border-border rounded-lg border px-3 py-2.5">
      {isCollapsible ? (
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
          className="text-muted-foreground hover:text-foreground flex w-full items-center gap-x-1.5 text-left text-xs font-medium"
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              isExpanded && "rotate-90",
            )}
          />
          {header}
        </button>
      ) : (
        <div className="text-muted-foreground flex items-center gap-x-1.5 text-xs font-medium">
          {header}
        </div>
      )}
      {showsBody && section.description ? (
        <p className="text-muted-foreground mt-2 mb-2 text-xs leading-snug">
          {section.description}
        </p>
      ) : null}
      {showsBody && section.rows?.length ? (
        <div className="mt-2 mb-2 flex flex-col gap-2">
          {section.rows.map((row) => (
            <DevPanelInfoRowView key={row.id} row={row} />
          ))}
        </div>
      ) : null}
      {showsBody ? (
        <div
          className={cn(
            "flex flex-col items-stretch gap-1.5",
            !section.description && !section.rows?.length && "mt-2",
          )}
        >
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
      ) : null}
    </div>
  )
}

/**
 * Static sections owned by the panel itself; page-scoped sections register
 * from their own features.
 */
function DevPanelStaticSections({ isPanelOpen }: { isPanelOpen: boolean }) {
  useRegisterDevPanelSection(useInstanceIdentityDevSection())
  useRegisterDevPanelSection(useDialogDebugDevSection())
  useRegisterDevPanelSection(useFixtureAccountsDevSection(isPanelOpen))
  useRegisterDevPanelSection(useBalanceHistoryDevSection())
  useRegisterDevPanelSection(useDevPagesSection())
  useRegisterDevPanelSection(useStarPromotionDevSection(isPanelOpen))
  return null
}

/**
 * The floating ball and its panel sheet. Renders nothing outside development.
 *
 * The ball doubles as the build's identity marker: the instance color and the
 * same code the toolbar badge shows, so a page can be matched to its icon
 * without touching any of the extension's own layout.
 */
function DevPanelBall() {
  const [isOpen, setIsOpen] = useState(false)
  const { surface, page } = useDevPanelSurface()
  const registeredSections = useDevPanelSections()
  const identity = getDevIdentity()

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
      <Tooltip content={<DevPanelTriggerTooltip identity={identity} />}>
        <button
          type="button"
          aria-label={PANEL_TRIGGER_LABEL}
          data-testid="dev-panel-trigger"
          onClick={() => setIsOpen(true)}
          className={cn(
            Z_INDEX.floating,
            "group fixed top-1/2 right-2 flex -translate-y-1/2 flex-col items-center opacity-60 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:outline-hidden",
          )}
        >
          <span
            className="bg-popover text-popover-foreground border-border flex size-8 items-center justify-center rounded-full border-2 shadow-md"
            style={identity.color ? { borderColor: identity.color } : undefined}
          >
            <Bug className="size-4" />
          </span>
          {identity.color ? (
            // Absolutely positioned so the ball keeps its footprint and hit area:
            // the path is wider than the ball and must not become a click target
            // floating over the page.
            <span
              data-testid="dev-panel-identity"
              className={cn(
                "bg-popover text-foreground border-border pointer-events-none absolute top-full right-0 mt-1 rounded-full border px-1.5 font-mono text-xs leading-none whitespace-nowrap shadow-sm",
                "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
              )}
            >
              {formatDevInstanceLabel(identity)}
            </span>
          ) : null}
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
