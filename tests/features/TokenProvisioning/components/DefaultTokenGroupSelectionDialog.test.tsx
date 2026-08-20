import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DefaultTokenGroupSelectionDialog } from "~/features/TokenProvisioning/components/DefaultTokenGroupSelectionDialog"
import { render, screen } from "~~/tests/test-utils/render"

const defaultProps = {
  isOpen: true,
  allowedGroups: ["default", "vip"],
  groups: {
    default: { desc: "Default", ratio: 1 },
    vip: { desc: "Premium", ratio: 2 },
    internal: { desc: "Internal", ratio: 0.5 },
  },
  suggestedGroup: "vip",
  isCreating: false,
  error: null,
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
}

describe("DefaultTokenGroupSelectionDialog", () => {
  it("uses the policy-suggested group and unique accessible field ids", async () => {
    const firstDialog = render(
      <DefaultTokenGroupSelectionDialog {...defaultProps} />,
    )
    const firstGroupSelector = await screen.findByRole("combobox", {
      name: /^keyManagement:dialog\.groupLabel/,
    })
    const firstId = firstGroupSelector.id

    expect(firstGroupSelector).toHaveTextContent("vip")
    firstDialog.unmount()

    render(
      <DefaultTokenGroupSelectionDialog
        {...defaultProps}
        suggestedGroup="default"
      />,
    )
    const secondGroupSelector = await screen.findByRole("combobox", {
      name: /^keyManagement:dialog\.groupLabel/,
    })

    expect(secondGroupSelector).toHaveTextContent("default")
    expect(secondGroupSelector.id).not.toBe(firstId)
  })

  it("removes dismissal controls while creation is in progress", async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <DefaultTokenGroupSelectionDialog
        {...defaultProps}
        isCreating={true}
        onCancel={onCancel}
      />,
    )

    expect(
      screen.queryByRole("button", { name: "common:actions.close" }),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole("button", { name: "common:actions.cancel" }),
    ).toBeDisabled()

    await user.keyboard("{Escape}")
    expect(onCancel).not.toHaveBeenCalled()
  })

  it("submits the selected group and exposes creation errors", async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <DefaultTokenGroupSelectionDialog
        {...defaultProps}
        error="Creation failed"
        onConfirm={onConfirm}
      />,
    )

    await user.click(
      await screen.findByRole("combobox", {
        name: /^keyManagement:dialog\.groupLabel/,
      }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "default - Default (keyManagement:dialog.groupRate 1)",
      }),
    )
    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    expect(onConfirm).toHaveBeenCalledWith("default")
    expect(screen.getByText("Creation failed")).toBeVisible()
  })

  it("shows the same group details and restriction guidance as the full token editor", async () => {
    const user = userEvent.setup()
    render(<DefaultTokenGroupSelectionDialog {...defaultProps} />)

    expect(
      await screen.findByText("keyManagement:dialog.groupRestrictedNote"),
    ).toBeVisible()

    await user.click(
      await screen.findByRole("combobox", {
        name: /^keyManagement:dialog\.groupLabel/,
      }),
    )

    expect(
      await screen.findByRole("option", {
        name: "vip - Premium (keyManagement:dialog.groupRate 2)",
      }),
    ).toBeEnabled()
    expect(
      screen.getByRole("option", {
        name: "internal - Internal (keyManagement:dialog.groupRate 0.5)",
      }),
    ).toHaveAttribute("aria-disabled", "true")
  })

  it("cancels explicitly and resets to the latest suggested group", async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <DefaultTokenGroupSelectionDialog
        {...defaultProps}
        onCancel={onCancel}
      />,
    )

    const groupSelector = await screen.findByRole("combobox", {
      name: /^keyManagement:dialog\.groupLabel/,
    })
    await user.click(groupSelector)
    await user.click(
      await screen.findByRole("option", {
        name: "default - Default (keyManagement:dialog.groupRate 1)",
      }),
    )

    rerender(
      <DefaultTokenGroupSelectionDialog
        {...defaultProps}
        isOpen={false}
        suggestedGroup="default"
        onCancel={onCancel}
      />,
    )
    rerender(
      <DefaultTokenGroupSelectionDialog
        {...defaultProps}
        suggestedGroup="default"
        onCancel={onCancel}
      />,
    )
    expect(
      await screen.findByRole("combobox", {
        name: /^keyManagement:dialog\.groupLabel/,
      }),
    ).toHaveTextContent("default")

    await user.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    )
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
