import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { CredentialAssociationMenu } from "~/components/CredentialAssociationMenu"

const labels = {
  saveAndAssociate: "Save and associate",
  associate: "Associate",
  open: "Open",
  confirm: "Confirm",
  unlink: "Remove",
}

describe("CredentialAssociationMenu", () => {
  it("renders nothing when no item has an available labeled action", () => {
    render(
      <CredentialAssociationMenu
        status="linked"
        items={[{ id: "empty", onConfirm: vi.fn() }]}
        labels={{ open: "Open" }}
        triggerAriaLabel="Association actions"
      />,
    )

    expect(
      screen.queryByRole("button", { name: "Association actions" }),
    ).not.toBeInTheDocument()
  })

  it("runs a single unlinked association directly", async () => {
    const user = userEvent.setup()
    const onAssociate = vi.fn()
    render(
      <CredentialAssociationMenu
        status="unlinked"
        items={[{ id: "direct", onAssociate }]}
        labels={labels}
        triggerLabel="Link credential"
        triggerAriaLabel="Link this credential"
        testId="association-trigger"
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "Link this credential" }),
    )

    expect(onAssociate).toHaveBeenCalledOnce()
    expect(screen.getByTestId("association-trigger")).toHaveTextContent(
      "Link credential",
    )
  })

  it("exposes every review action for grouped confirmation items", async () => {
    const user = userEvent.setup()
    const onAssociate = vi.fn()
    const onConfirm = vi.fn()
    const onOpen = vi.fn()
    const onSaveAndAssociate = vi
      .fn()
      .mockRejectedValue(new Error("save unavailable"))
    const onUnlink = vi.fn()
    render(
      <CredentialAssociationMenu
        status="needs-confirmation"
        items={[
          {
            id: "first",
            label: "First account",
            testId: "save-first",
            onAssociate,
            onConfirm,
            onOpen,
            onSaveAndAssociate,
            onUnlink,
          },
          {
            id: "second",
            label: "Second account",
            onOpen: vi.fn(),
          },
        ]}
        labels={labels}
        triggerLabel="Review links"
        triggerAriaLabel="Review two links"
        count={2}
      />,
    )
    const openMenu = () =>
      user.click(screen.getByRole("button", { name: "Review two links" }))
    const choose = async (name: string) => {
      await openMenu()
      await user.click(screen.getAllByRole("menuitem", { name })[0])
    }

    await choose(labels.saveAndAssociate)
    expect(onSaveAndAssociate).toHaveBeenCalledOnce()
    await choose(labels.confirm)
    expect(onConfirm).toHaveBeenCalledOnce()
    await choose(labels.associate)
    expect(onAssociate).toHaveBeenCalledOnce()
    await choose(labels.open)
    expect(onOpen).toHaveBeenCalledOnce()
    await choose(labels.unlink)
    expect(onUnlink).toHaveBeenCalledOnce()

    await openMenu()
    expect(screen.getByRole("group", { name: "First account" })).toBeVisible()
    expect(screen.getByText("Second account")).toBeVisible()
  })

  it("opens a linked association from an icon-only trigger", async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(
      <CredentialAssociationMenu
        status="linked"
        items={[{ id: "linked", onOpen }]}
        labels={labels}
        triggerAriaLabel="Linked credential"
      />,
    )

    await user.click(screen.getByRole("button", { name: "Linked credential" }))
    await user.click(screen.getByRole("menuitem", { name: labels.open }))

    expect(onOpen).toHaveBeenCalledOnce()
  })
})
