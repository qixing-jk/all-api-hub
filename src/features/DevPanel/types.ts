import type { LucideIcon } from "lucide-react"

/** Entry points that can host the floating dev panel. */
export type DevPanelSurface = "options" | "popup" | "sidepanel"

/** Where the panel is currently shown, used to filter page-specific sections. */
export interface DevPanelContextValue {
  surface: DevPanelSurface
  /**
   * Page identifier of the active route (options menu id or popup view id).
   * Omitted on surfaces without page state.
   */
  page?: string
}

/** A single runnable command inside a dev panel section. */
export interface DevPanelAction {
  id: string
  label: string
  icon?: LucideIcon
  /** Shows a spinner and disables sibling actions while awaiting the handler. */
  loading?: boolean
  disabled?: boolean
  run: () => void | Promise<void>
}

/**
 * How much a row's value can be trusted, shown next to the value so the panel
 * never implies more certainty than the value has.
 */
export type DevPanelInfoTone = "stable" | "runtime" | "best-effort"

/** A read-only fact rendered inside a dev panel section. */
export interface DevPanelInfoRow {
  id: string
  label: string
  /** Rendered as unavailable when null, rather than hiding the row. */
  value: string | null
  tone?: DevPanelInfoTone
  /** Extra explanation shown under the value. */
  hint?: string
  /** Offers a copy button when the value exists. */
  copyable?: boolean
}

/** A titled group of dev actions rendered in the floating panel. */
export interface DevPanelSection {
  id: string
  title: string
  icon?: LucideIcon
  /** Optional one-line hint shown under the title. */
  description?: string
  /** Read-only facts shown between the description and the actions. */
  rows?: readonly DevPanelInfoRow[]
  /**
   * Allows collapsing the section. Sections that are reference material rather
   * than controls set this so they do not push the controls down the panel.
   */
  collapsible?: boolean
  /** Starts collapsed; only meaningful with `collapsible`. */
  defaultCollapsed?: boolean
  /** Shown in the header while collapsed, e.g. the value the section reports. */
  summary?: string
  /** Surfaces where the section is shown; omit to show on every surface. */
  surfaces?: readonly DevPanelSurface[]
  /** Page ids where the section is shown; omit to show on every page. */
  pages?: readonly string[]
  /** Pages where a globally available section belongs in the top group. */
  prominentPages?: readonly string[]
  /** Higher values render lower in the panel; defaults to `0`. */
  order?: number
  actions: readonly DevPanelAction[]
}

/**
 * Resolves whether a section should render for the current surface and page.
 */
export function isDevPanelSectionVisible(
  section: DevPanelSection,
  context: DevPanelContextValue,
): boolean {
  if (section.surfaces && !section.surfaces.includes(context.surface)) {
    return false
  }
  if (
    section.pages &&
    (context.page === undefined || !section.pages.includes(context.page))
  ) {
    return false
  }
  return true
}
