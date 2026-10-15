import userEvent from "@testing-library/user-event"
import { KeyRound, Wrench } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import { ActionMenu, type ActionMenuGroup } from "~/components/ActionMenu"
import { render, screen } from "~~/tests/test-utils/render"

const renderOptions = {
  withUserPreferencesProvider: false,
  withThemeProvider: false,
}

describe("ActionMenu", () => {
  it("automatically switches between hidden, direct, and menu actions as available groups change", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const group: ActionMenuGroup = {
      id: "keys",
      actions: [{ id: "check", label: "Check keys", icon: KeyRound, onSelect }],
    }
    const view = render(
      <ActionMenu label="Key tools" icon={Wrench} groups={[]} />,
      renderOptions,
    )
    expect(screen.queryByRole("button")).not.toBeInTheDocument()

    view.rerender(
      <ActionMenu label="Key tools" icon={Wrench} groups={[group]} />,
    )
    const direct = screen.getByRole("button", { name: "Check keys" })
    expect(direct.querySelector("svg")).toBeInTheDocument()
    expect(direct).not.toHaveAttribute("aria-haspopup")
    await user.click(direct)
    expect(onSelect).toHaveBeenCalledTimes(1)

    view.rerender(
      <ActionMenu
        label="Key tools"
        icon={Wrench}
        groups={[
          group,
          {
            id: "other",
            label: "Completion",
            actions: [
              {
                id: "create",
                label: "Complete keys",
                icon: KeyRound,
                onSelect,
              },
            ],
          },
        ]}
      />,
    )
    expect(
      screen.queryByRole("button", { name: "Check keys" }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Key tools" }))
    expect(screen.getAllByRole("menuitem")).toHaveLength(2)
    expect(
      screen
        .getByRole("menuitem", { name: "Complete keys" })
        .querySelector("svg"),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("menuitem", { name: "Complete keys" }))
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it("preserves disabled actions without treating them as absent", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const disabled = {
      id: "check",
      label: "Check keys",
      icon: KeyRound,
      onSelect,
      disabled: true,
    }
    const view = render(
      <ActionMenu
        label="Key tools"
        icon={Wrench}
        groups={[{ id: "keys", actions: [disabled] }]}
      />,
      renderOptions,
    )
    expect(screen.getByRole("button", { name: "Check keys" })).toBeDisabled()
    view.rerender(
      <ActionMenu
        label="Key tools"
        icon={Wrench}
        groups={[
          {
            id: "keys",
            actions: [
              disabled,
              {
                ...disabled,
                id: "create",
                label: "Complete keys",
                disabled: false,
              },
            ],
          },
        ]}
      />,
    )
    await user.click(screen.getByRole("button", { name: "Key tools" }))
    expect(
      screen.getByRole("menuitem", { name: "Check keys" }),
    ).toHaveAttribute("aria-disabled", "true")
    await user.click(screen.getByRole("menuitem", { name: "Complete keys" }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
