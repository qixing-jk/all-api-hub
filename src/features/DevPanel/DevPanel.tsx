import { Bug, ChevronRight, Copy, Terminal, Wrench, X } from "lucide-react"
import { useCallback, useState } from "react"

import { HelpHintIcon } from "~/components/icons/productIcons"
import Tooltip from "~/components/Tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { Z_INDEX } from "~/constants/designTokens"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import toast from "~/lib/notify"
import { cn } from "~/lib/utils"
import { getDevIdentity } from "~/utils/browser/extensionIdentity"
import { formatDevInstanceLabel } from "~/utils/core/devBranding"
import type { DevIdentity } from "~/utils/core/devIdentity"
import { useDevUnlocked } from "~/utils/core/devMode"
import { getErrorMessage } from "~/utils/core/error"

import {
  useDevPanelSections,
  useDevPanelSurface,
  useRegisterDevPanelSection,
} from "./DevPanelSectionsContext"
import { DataCleanupSection } from "./sections/dataCleanupSection"
import { useDialogDebugDevSections } from "./sections/dialogDebugSection"
import { useFixtureAccountsDevSection } from "./sections/fixtureAccountsSection"
import { useFixtureApiCredentialsDevSection } from "./sections/fixtureApiCredentialsSection"
import { useInstanceIdentityDevSection } from "./sections/instanceIdentitySection"
import { KeyProvisioningPreviewSection } from "./sections/keyProvisioningPreviewSection"
import { useStarPromotionDevSection } from "./sections/starPromotionSection"
import { useTempContextDevSection } from "./sections/tempContextSection"
import { useUninstallSurveyDevSection } from "./sections/uninstallSurveySection"
import {
  isDevPanelSectionVisible,
  type DevPanelAction,
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
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-x-2">
        <span className="text-xs text-muted-foreground">{row.label}</span>
        {row.tone && row.tone !== "stable" ? (
          <span className="shrink-0 text-xs text-muted-foreground italic">
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
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          >
            <Copy className="size-3.5" />
          </button>
        ) : null}
      </div>
      {row.hint ? (
        <p className="text-xs leading-snug text-muted-foreground">{row.hint}</p>
      ) : null}
    </div>
  )
}

/** One command keeps identical interaction and icon treatment in every layout. */
function DevPanelActionView({
  action,
  standalone = false,
  sectionBusy = false,
}: {
  action: DevPanelAction
  standalone?: boolean
  sectionBusy?: boolean
}) {
  const ActionIcon = action.icon ?? Terminal
  return (
    <button
      type="button"
      aria-label={action.label}
      onClick={() => void action.run()}
      disabled={sectionBusy || action.disabled || action.loading}
      aria-busy={action.loading || undefined}
      className={cn(
        "flex min-w-0 flex-1 items-start gap-3 rounded-md px-3 py-2 text-left text-xs leading-5 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50",
        standalone && "min-h-11 items-center text-sm font-medium",
      )}
    >
      {action.loading ? (
        <span
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        />
      ) : (
        <ActionIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
      )}
      <span className="min-w-0 flex-1 wrap-break-word">
        {action.label.replace(/^Dev:\s*/, "")}
      </span>
    </button>
  )
}

/**
 * Renders one section's title, its facts and its action buttons.
 *
 * Page-relevant sections start open; general tools start folded individually.
 */
function DevPanelSectionView({
  section,
  isCurrentPage,
}: {
  section: DevPanelSection
  isCurrentPage: boolean
}) {
  const SectionIcon = section.icon ?? Wrench
  const [isExpanded, setIsExpanded] = useState(
    isCurrentPage && !section.defaultCollapsed,
  )
  const isCollapsible = Boolean(
    section.collapsible || section.defaultCollapsed || !isCurrentPage,
  )
  const showsBody = !isCollapsible || isExpanded
  const sectionBusy = section.actions.some((action) => action.loading)

  const singleAction =
    section.actions.length === 1 ? section.actions[0] : undefined
  const isSingleCommand =
    singleAction &&
    !section.rows?.length &&
    !section.collapsible &&
    !section.defaultCollapsed
  if (isSingleCommand) {
    return (
      <div className="flex min-h-11 items-center gap-1">
        <DevPanelActionView action={singleAction} standalone />
        {section.description ? (
          <Tooltip
            content={section.description}
            anchorAsChild
            position="left"
            positionStrategy="fixed"
          >
            <button
              type="button"
              aria-label={`About ${section.title}`}
              className="mr-1 shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              <HelpHintIcon aria-hidden="true" className="size-3.5" />
            </button>
          </Tooltip>
        ) : null}
      </div>
    )
  }

  const header = (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        <SectionIcon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-snug font-medium wrap-break-word text-foreground">
          {section.title}
        </span>
        {!showsBody && section.summary ? (
          <span
            className="mt-0.5 block truncate text-xs font-normal text-muted-foreground"
            title={section.summary}
          >
            {section.summary}
          </span>
        ) : null}
      </span>
    </>
  )

  return (
    <div className="min-w-0">
      {isCollapsible ? (
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
          className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden focus-visible:ring-inset"
        >
          {header}
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              isExpanded && "rotate-90",
            )}
          />
        </button>
      ) : (
        <div className="flex min-h-11 items-center gap-3 px-3 py-2">
          {header}
        </div>
      )}
      {showsBody ? (
        <div className="mr-3 mb-2 ml-5 flex min-w-0 flex-col gap-3 border-l border-border pt-1 pl-3">
          {section.description ? (
            <p className="px-3 text-xs leading-relaxed text-muted-foreground">
              {section.description}
            </p>
          ) : null}
          {section.rows?.length ? (
            <div className="flex min-w-0 flex-col gap-3 px-3 py-2">
              {section.rows.map((row) => (
                <DevPanelInfoRowView key={row.id} row={row} />
              ))}
            </div>
          ) : null}
          {section.actions.length ? (
            <div className="flex flex-col">
              {section.actions.map((action) => {
                return (
                  <DevPanelActionView
                    key={action.id}
                    action={action}
                    sectionBusy={sectionBusy}
                  />
                )
              })}
            </div>
          ) : null}
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
  const { surface, page } = useDevPanelSurface()
  useRegisterDevPanelSection(useInstanceIdentityDevSection())
  const { previews, diagnostics } = useDialogDebugDevSections()
  useRegisterDevPanelSection(previews)
  useRegisterDevPanelSection(diagnostics)
  useRegisterDevPanelSection(
    useFixtureAccountsDevSection(
      isPanelOpen &&
        surface === "options" &&
        (page === MENU_ITEM_IDS.ACCOUNT ||
          page === MENU_ITEM_IDS.OVERVIEW ||
          page === MENU_ITEM_IDS.AUTO_CHECKIN),
    ),
  )
  useRegisterDevPanelSection(
    useFixtureApiCredentialsDevSection(
      isPanelOpen &&
        surface === "options" &&
        page === MENU_ITEM_IDS.API_CREDENTIAL_PROFILES,
    ),
  )
  useRegisterDevPanelSection(useStarPromotionDevSection(isPanelOpen))
  useRegisterDevPanelSection(useUninstallSurveyDevSection())
  useRegisterDevPanelSection(useTempContextDevSection())
  return (
    <>
      <KeyProvisioningPreviewSection />
      <DataCleanupSection />
    </>
  )
}

const TOOLBOX_CATEGORIES = [
  { id: "preview", label: "Interface previews" },
  { id: "diagnostics", label: "Extension diagnostics" },
  { id: "data", label: "Data maintenance" },
] as const

/** Page tools and global tools have separate navigation; build facts stay pinned. */
function DevPanelSectionGroups({
  sections,
  page,
}: {
  sections: readonly DevPanelSection[]
  page?: string
}) {
  const footerSections = sections.filter(
    (section) => section.placement === "footer",
  )
  const tools = sections.filter((section) => section.placement !== "footer")
  const belongsToCurrentPage = (section: DevPanelSection) =>
    Boolean(
      page &&
      (section.pages?.includes(page) || section.prominentPages?.includes(page)),
    )
  const currentSections = tools.filter(belongsToCurrentPage)
  const otherSections = tools.filter(
    (section) => !belongsToCurrentPage(section),
  )
  const [selectedTab, setSelectedTab] = useState("current")
  // Registrations arrive after mount; derive the fallback without locking out late page tools.
  const activeTab = currentSections.length === 0 ? "toolbox" : selectedTab

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={setSelectedTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList
          aria-label="Dev tools"
          className="grid shrink-0 grid-cols-2 gap-1 border-b border-border px-3 py-2"
        >
          {[
            {
              id: "current",
              label: "Current page",
              disabled: currentSections.length === 0,
            },
            { id: "toolbox", label: "Toolbox", disabled: false },
          ].map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              disabled={tab.disabled}
              className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden disabled:opacity-40 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <TabsContent
            value="current"
            className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          >
            <div
              role="group"
              aria-label="Current page"
              className="flex flex-col divide-y divide-border"
            >
              {currentSections.map((section) => (
                <DevPanelSectionView
                  key={section.id}
                  section={section}
                  isCurrentPage
                />
              ))}
            </div>
          </TabsContent>
          <TabsContent
            value="toolbox"
            className="flex flex-col gap-4 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          >
            {otherSections.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No global tools available on this surface.
              </p>
            ) : null}
            {TOOLBOX_CATEGORIES.map((category) => {
              const categorySections = otherSections.filter(
                (section) =>
                  (section.category ?? "diagnostics") === category.id,
              )
              if (!categorySections.length) return null
              return (
                <div
                  key={category.id}
                  role="group"
                  aria-label={category.label}
                  className="flex flex-col"
                >
                  <p className="mb-1 flex items-center gap-3 px-3 text-xs font-medium text-muted-foreground">
                    <span>{category.label}</span>
                    <span
                      aria-hidden="true"
                      className="h-px min-w-4 flex-1 bg-border"
                    />
                  </p>
                  {categorySections.map((section) => (
                    <DevPanelSectionView
                      key={section.id}
                      section={section}
                      isCurrentPage={false}
                    />
                  ))}
                </div>
              )
            })}
          </TabsContent>
        </div>
      </Tabs>
      {footerSections.length ? (
        <div
          role="group"
          aria-label="Build information"
          className="max-h-[40%] shrink-0 overflow-y-auto border-t border-border px-3 py-2"
        >
          {footerSections.map((section) => (
            <DevPanelSectionView
              key={section.id}
              section={section}
              isCurrentPage={false}
            />
          ))}
        </div>
      ) : null}
    </>
  )
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

  const isDevActive = useDevUnlocked()

  if (!isDevActive) {
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
            className="flex size-8 items-center justify-center rounded-full border-2 border-border bg-popover text-popover-foreground shadow-md"
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
                "pointer-events-none absolute top-full right-0 mt-1 rounded-full border border-border bg-popover px-1.5 font-mono text-xs leading-none whitespace-nowrap text-foreground shadow-sm",
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
            "fixed inset-y-0 right-0 flex w-96 max-w-full flex-col border-l border-border bg-popover text-popover-foreground shadow-xl",
          )}
          role="dialog"
          aria-label="Dev panel"
          data-testid="dev-panel"
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Bug aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Dev panel</p>
              <p className="text-xs text-muted-foreground">{surfaceLabel}</p>
            </div>
            <Tooltip content="Dev: Close dev panel">
              <button
                type="button"
                aria-label="Close dev panel"
                onClick={() => setIsOpen(false)}
                className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
              >
                <X className="size-4" />
              </button>
            </Tooltip>
          </div>
          <DevPanelSectionGroups
            key={`${surface}:${page ?? ""}`}
            sections={visibleSections}
            page={page}
          />
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
