import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  EXPORT_ACTION_TARGETS,
  ExportActionsMenu,
} from "~/components/ExportActionsMenu"
import { render } from "~~/tests/test-utils/render"

const allActions = Object.fromEntries(
  Object.values(EXPORT_ACTION_TARGETS).map((target) => [
    target,
    { onSelect: vi.fn() },
  ]),
)

describe("ExportActionsMenu", () => {
  it("groups available targets in the canonical display order", async () => {
    const user = userEvent.setup()

    render(<ExportActionsMenu actions={allActions} />, {
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    await user.click(
      screen.getByRole("button", { name: "common:actions.export" }),
    )

    const expectedNames = [
      "keyManagement:actions.useInCherry",
      "keyManagement:actions.copyKelivoImportCode",
      "keyManagement:actions.exportToCCSwitch",
      "keyManagement:actions.exportToKiloCode",
      "keyManagement:actions.exportToCursorPlus",
      "keyManagement:actions.importToCliProxy",
      "keyManagement:actions.importToClaudeCodeRouter",
    ]
    const menuItems = screen.getAllByRole("menuitem")
    expect(menuItems).toHaveLength(expectedNames.length)
    menuItems.forEach((item, index) => {
      expect(item).toHaveAccessibleName(expectedNames[index])
    })
    expect(
      screen.getByText("keyManagement:exportMenu.groups.chatClients"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:exportMenu.groups.codingAgents"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:exportMenu.groups.gateways"),
    ).toBeInTheDocument()
  })

  it("omits unsupported targets and routes the selected action", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <ExportActionsMenu
        actions={{
          [EXPORT_ACTION_TARGETS.KiloCode]: { onSelect },
        }}
      />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.export" }),
    )
    expect(
      screen.queryByText("keyManagement:exportMenu.groups.chatClients"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:exportMenu.groups.codingAgents"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:exportMenu.groups.gateways"),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("menuitem", {
        name: "keyManagement:actions.exportToKiloCode",
      }),
    )
    expect(onSelect).toHaveBeenCalledOnce()
  })
})
