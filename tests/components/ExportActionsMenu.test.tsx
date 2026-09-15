import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  EXPORT_ACTION_TARGETS,
  ExportActionsMenu,
} from "~/components/ExportActionsMenu"
import { Modal } from "~/components/ui/Dialog/Modal"
import { render } from "~~/tests/test-utils/render"

const allActions = Object.fromEntries(
  Object.values(EXPORT_ACTION_TARGETS).map((target) => [
    target,
    { onSelect: vi.fn() },
  ]),
)

describe("ExportActionsMenu", () => {
  it("keeps the export dialog focused after the menu finishes closing", async () => {
    vi.useFakeTimers()
    try {
      const ExportDialogHarness = () => {
        const [isOpen, setIsOpen] = useState(false)
        return (
          <>
            <ExportActionsMenu
              actions={{
                [EXPORT_ACTION_TARGETS.CCSwitch]: {
                  onSelect: () => setIsOpen(true),
                },
              }}
            />
            <Modal
              isOpen={isOpen}
              onClose={() => setIsOpen(false)}
              title="Export settings"
              showCloseButton={false}
            >
              <input aria-label="Export name" />
            </Modal>
          </>
        )
      }
      render(<ExportDialogHarness />, {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      })

      fireEvent.pointerDown(
        screen.getByRole("button", { name: "common:actions.export" }),
        { button: 0, ctrlKey: false },
      )
      await act(async () => {})
      fireEvent.click(
        screen.getByRole("menuitem", {
          name: "keyManagement:actions.exportToCCSwitch",
        }),
      )
      await act(async () => {})
      const input = screen.getByRole("textbox", { name: "Export name" })
      expect(input).toHaveFocus()

      await act(async () => vi.runOnlyPendingTimers())
      expect(input).toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })

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

    const trigger = screen.getByRole("button", {
      name: "common:actions.export",
    })
    await user.click(trigger)
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
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("returns focus to the trigger when Escape dismisses the menu", async () => {
    const user = userEvent.setup()
    render(<ExportActionsMenu actions={allActions} />, {
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })
    const trigger = screen.getByRole("button", {
      name: "common:actions.export",
    })
    await user.click(trigger)
    await user.keyboard("{Escape}")

    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })
})
