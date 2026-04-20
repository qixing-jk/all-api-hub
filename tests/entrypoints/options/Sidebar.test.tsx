import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import Sidebar from "~/entrypoints/options/components/Sidebar"
import { fireEvent, render, screen, within } from "~~/tests/test-utils/render"

const { useUserPreferencesContextMock } = vi.hoisted(() => ({
  useUserPreferencesContextMock: vi.fn(),
}))

vi.mock("framer-motion", () => ({
  motion: {
    aside: ({
      children,
      animate: _animate,
      initial: _initial,
      ...props
    }: React.ComponentPropsWithoutRef<"aside"> & {
      animate?: unknown
      children: ReactNode
      initial?: unknown
    }) => <aside {...props}>{children}</aside>,
  },
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => useUserPreferencesContextMock(),
  }
})

describe("Options Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUserPreferencesContextMock.mockReturnValue({
      preferences: {
        autoCheckin: {
          globalEnabled: true,
        },
      },
    })
    document.body.style.overflow = ""
  })

  afterEach(() => {
    document.body.style.overflow = ""
  })

  it("renders the expanded desktop navigation and routes menu clicks", () => {
    const onMenuItemClick = vi.fn()
    const onCollapseToggle = vi.fn()

    render(
      <Sidebar
        activeMenuItem={MENU_ITEM_IDS.BASIC}
        onMenuItemClick={onMenuItemClick}
        isCollapsed={false}
        onCollapseToggle={onCollapseToggle}
      />,
    )

    const nav = screen.getByRole("navigation", {
      name: "ui:navigation.settingsOptions",
    })

    expect(
      within(nav).getByRole("button", { name: "ui:navigation.basic" }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole("button", { name: "ui:navigation.autoCheckin" }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole("button", {
        name: "ui:navigation.managedSiteChannels",
      }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole("button", {
        name: "ui:navigation.managedSiteModelSync",
      }),
    ).toBeInTheDocument()

    fireEvent.click(
      within(nav).getByRole("button", { name: "ui:navigation.models" }),
    )

    expect(onMenuItemClick).toHaveBeenCalledWith(MENU_ITEM_IDS.MODELS)

    const collapseButtons = screen.getAllByRole("button", {
      name: "ui:navigation.collapseSidebar",
    })
    fireEvent.click(collapseButtons[0]!)

    expect(onCollapseToggle).toHaveBeenCalledTimes(1)
  })

  it("uses collapsed desktop labels and keeps managed-site pages visible when config is missing", () => {
    useUserPreferencesContextMock.mockReturnValue({
      preferences: {
        autoCheckin: {
          globalEnabled: false,
        },
      },
    })

    render(
      <Sidebar
        activeMenuItem={MENU_ITEM_IDS.BASIC}
        onMenuItemClick={vi.fn()}
        isCollapsed={true}
        onCollapseToggle={vi.fn()}
      />,
    )

    const nav = screen.getByRole("navigation", {
      name: "ui:navigation.sidebarCollapsedHint",
    })

    const basicButton = within(nav).getByRole("button", {
      name: "ui:navigation.basic",
    })
    expect(basicButton).toHaveAttribute("title", "ui:navigation.basic")

    expect(
      within(nav).queryByRole("button", { name: "ui:navigation.autoCheckin" }),
    ).toBeNull()
    expect(
      within(nav).getByRole("button", {
        name: "ui:navigation.managedSiteChannels",
      }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole("button", {
        name: "ui:navigation.managedSiteModelSync",
      }),
    ).toBeInTheDocument()

    expect(
      screen.getAllByRole("button", {
        name: "ui:navigation.expandSidebar",
      }),
    ).toHaveLength(2)
  })

  it("opens mobile mode with an overlay, locks body scroll, and closes through mobile actions", () => {
    const onMobileClose = vi.fn()
    const onCollapseToggle = vi.fn()

    const { container, rerender, unmount } = render(
      <Sidebar
        activeMenuItem={MENU_ITEM_IDS.BASIC}
        onMenuItemClick={vi.fn()}
        isMobileOpen={true}
        onMobileClose={onMobileClose}
        isCollapsed={false}
        onCollapseToggle={onCollapseToggle}
      />,
    )

    expect(document.body.style.overflow).toBe("hidden")

    const overlay = container.querySelector("div.fixed.inset-0")
    expect(overlay).not.toBeNull()
    fireEvent.click(overlay!)

    expect(onMobileClose).toHaveBeenCalledTimes(1)
    expect(onCollapseToggle).not.toHaveBeenCalled()

    const closeButtons = screen.getAllByRole("button", {
      name: "ui:navigation.collapseSidebar",
    })
    fireEvent.click(closeButtons[closeButtons.length - 1]!)

    expect(onMobileClose).toHaveBeenCalledTimes(2)
    expect(onCollapseToggle).not.toHaveBeenCalled()

    rerender(
      <Sidebar
        activeMenuItem={MENU_ITEM_IDS.BASIC}
        onMenuItemClick={vi.fn()}
        isMobileOpen={false}
        onMobileClose={onMobileClose}
        isCollapsed={false}
        onCollapseToggle={onCollapseToggle}
      />,
    )

    expect(document.body.style.overflow).toBe("")

    unmount()
    expect(document.body.style.overflow).toBe("")
  })
})
