import { describe, expect, it, vi } from "vitest"

import { GuidanceCardLayout } from "~/features/UnifiedApiGuidance/components/GuidanceCardLayout"
import { render, screen } from "~~/tests/test-utils/render"

describe("GuidanceCardLayout", () => {
  it("renders guidance copy without an action rail when no controls are available", () => {
    const { container } = render(
      <GuidanceCardLayout
        badge="Badge"
        badgeVariant="info"
        title="Guidance title"
        description="Guidance description"
        notes={<div>Guidance notes</div>}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(screen.getByText("Guidance title")).toBeVisible()
    expect(screen.getByText("Guidance description")).toBeVisible()
    expect(screen.getByText("Guidance notes")).toBeVisible()
    expect(container.querySelector("[data-guidance-action-rail]")).toBeNull()
  })

  it("keeps dismissal controls in the right rail without creating an action panel when there are no business actions", () => {
    const { container } = render(
      <GuidanceCardLayout
        badge="Badge"
        badgeVariant="info"
        title="Guidance title"
        description="Guidance description"
        notes={<div>Guidance notes</div>}
        dismissControls={{
          dismissForSessionLabel: "Hide for now",
          permanentlyDismissLabel: "Do not show again",
          onDismissForSession: vi.fn(),
          onRequestPermanentDismiss: vi.fn(),
        }}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const permanentDismiss = screen.getByRole("button", {
      name: "Do not show again",
    })
    const actionRail = container.querySelector<HTMLElement>(
      "[data-guidance-action-rail]",
    )
    const sessionDismiss = container.querySelector<HTMLElement>(
      "[data-guidance-session-dismiss]",
    )

    expect(permanentDismiss).toBeVisible()
    expect(screen.getByRole("button", { name: "Hide for now" })).toBeVisible()
    expect(actionRail).toContainElement(sessionDismiss)
    expect(actionRail).toContainElement(permanentDismiss)
    expect(container.querySelector("[data-guidance-action-panel]")).toBeNull()
    expect(
      container.querySelector("[data-guidance-dismiss-standalone-footer]"),
    ).toBeNull()
  })

  it("uses dismissal controls to compress the right action panel without making them part of the panel", () => {
    const { container } = render(
      <GuidanceCardLayout
        badge="Badge"
        badgeVariant="info"
        title="Guidance title"
        description="Guidance description"
        notes={<div>Guidance notes</div>}
        actions={<button type="button">Business action</button>}
        dismissControls={{
          dismissForSessionLabel: "Hide for now",
          permanentlyDismissLabel: "Do not show again",
          onDismissForSession: vi.fn(),
          onRequestPermanentDismiss: vi.fn(),
        }}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const actionRail = container.querySelector<HTMLElement>(
      "[data-guidance-action-rail]",
    )
    const actionPanel = container.querySelector<HTMLElement>(
      "[data-guidance-action-panel]",
    )
    const businessAction = screen.getByRole("button", {
      name: "Business action",
    })
    const permanentDismiss = screen.getByRole("button", {
      name: "Do not show again",
    })
    const sessionDismiss = container.querySelector<HTMLElement>(
      "[data-guidance-session-dismiss]",
    )

    expect(actionRail).toContainElement(actionPanel)
    expect(actionRail).toContainElement(sessionDismiss)
    expect(actionRail).toContainElement(permanentDismiss)
    expect(actionPanel).toContainElement(businessAction)
    expect(actionPanel).not.toContainElement(sessionDismiss)
    expect(actionPanel).not.toContainElement(permanentDismiss)
    expect(
      container.querySelector("[data-guidance-dismiss-standalone-footer]"),
    ).toBeNull()
  })
})
