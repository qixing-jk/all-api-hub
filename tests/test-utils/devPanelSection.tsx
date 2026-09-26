import { StrictMode } from "react"

import type { DevPanelSection } from "~/features/DevPanel/types"
import { render } from "~~/tests/test-utils/render"

/**
 * Render options shared by the dev panel section tests: the sections read no app
 * preferences, theme, or release state, so mounting those providers only slows
 * the tests down.
 */
const DEV_PANEL_SECTION_RENDER_OPTIONS = {
  withReleaseUpdateStatusProvider: false,
  withUserPreferencesProvider: false,
  withThemeProvider: false,
} as const

/**
 * Renders a section the way the floating panel consumes it: section metadata,
 * info rows, and action buttons with the panel's own disabled/loading wiring.
 * Section tests assert against this one shape instead of re-implementing it.
 */
function DevPanelSectionHarness({ section }: { section: DevPanelSection }) {
  return (
    <div>
      <p data-testid="section-meta">
        {[
          section.collapsible ?? false,
          section.defaultCollapsed ?? false,
          section.summary ?? "no-summary",
          section.order ?? "default-order",
        ].join("|")}
      </p>
      {section.rows?.map((row) => (
        <p key={row.id} data-testid={`row-${row.id}`}>
          {`${row.label}|${row.value ?? "unavailable"}|${row.tone ?? "none"}`}
        </p>
      ))}
      {section.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => void action.run()}
          disabled={action.disabled || action.loading}
          aria-busy={action.loading || undefined}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Renders one section hook through the harness. `strict` mounts it inside
 * StrictMode for the cases where React's development double-invocation of state
 * updaters and effects is part of what the test asserts.
 */
export function renderDevPanelSection(
  useSection: () => DevPanelSection,
  options?: { strict?: boolean },
) {
  function Harness() {
    return <DevPanelSectionHarness section={useSection()} />
  }

  return render(
    options?.strict ? (
      <StrictMode>
        <Harness />
      </StrictMode>
    ) : (
      <Harness />
    ),
    DEV_PANEL_SECTION_RENDER_OPTIONS,
  )
}
