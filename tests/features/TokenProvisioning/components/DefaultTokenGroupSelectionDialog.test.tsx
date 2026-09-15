import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DefaultTokenGroupSelectionDialog } from "~/features/TokenProvisioning/components/DefaultTokenGroupSelectionDialog"
import { render, screen } from "~~/tests/test-utils/render"

const defaultProps = {
  isOpen: true,
  requirements: [
    {
      requirementKey: "opaque-vip",
      displayName: "vip",
      provisioning: { kind: "automatic" as const },
    },
    {
      requirementKey: "opaque-default",
      displayName: "default",
      provisioning: { kind: "automatic" as const },
    },
  ],
  isCreating: false,
  error: null,
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
}

describe("DefaultTokenGroupSelectionDialog", () => {
  it("uses the provider-ordered default and unique accessible field ids", async () => {
    render(
      <>
        <DefaultTokenGroupSelectionDialog {...defaultProps} />
        <DefaultTokenGroupSelectionDialog
          {...defaultProps}
          requirements={[...defaultProps.requirements].reverse()}
        />
      </>,
    )
    const groupSelectors = await screen.findAllByRole("combobox", {
      hidden: true,
    })

    expect(groupSelectors).toHaveLength(2)
    expect(
      groupSelectors.some((selector) => selector.textContent?.includes("vip")),
    ).toBe(true)
    expect(
      groupSelectors.some((selector) =>
        selector.textContent?.includes("default"),
      ),
    ).toBe(true)
    expect(new Set(groupSelectors.map((selector) => selector.id)).size).toBe(2)
  })

  it("cancels when the dialog close control dismisses it", async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <DefaultTokenGroupSelectionDialog
        {...defaultProps}
        onCancel={onCancel}
      />,
    )

    await user.click(
      await screen.findByRole("button", { name: "common:actions.close" }),
    )

    expect(onCancel).toHaveBeenCalledTimes(1)
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
        name: "default",
      }),
    )
    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    expect(onConfirm).toHaveBeenCalledWith("opaque-default")
    expect(screen.getByText("Creation failed")).toBeVisible()
  })

  it("offers exactly the provider requirements without inventing group identities", async () => {
    const user = userEvent.setup()
    render(<DefaultTokenGroupSelectionDialog {...defaultProps} />)
    await user.click(
      await screen.findByRole("combobox", {
        name: /^keyManagement:dialog\.groupLabel/,
      }),
    )
    expect(await screen.findByRole("option", { name: "vip" })).toBeEnabled()
    expect(screen.getAllByRole("option")).toHaveLength(2)
  })

  it("cancels explicitly and resets to the latest provider-ordered default", async () => {
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
        name: "default",
      }),
    )

    rerender(
      <DefaultTokenGroupSelectionDialog
        {...defaultProps}
        isOpen={false}
        requirements={[...defaultProps.requirements].reverse()}
        onCancel={onCancel}
      />,
    )
    rerender(
      <DefaultTokenGroupSelectionDialog
        {...defaultProps}
        requirements={[...defaultProps.requirements].reverse()}
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
