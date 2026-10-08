import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import FirefoxAddAccountWarningDialog from "~/features/AccountManagement/opening/FirefoxAddAccountWarningDialog"
import { render, screen } from "~~/tests/test-utils/render"

describe("Firefox add-account continuation", () => {
  it("offers sidebar continuation and cancellation when supported", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <FirefoxAddAccountWarningDialog
        isOpen
        onClose={onClose}
        onConfirm={vi.fn()}
        sidePanelSupported
      />,
    )
    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.firefox.openSidebar",
      }),
    ).toBeVisible()
    expect(screen.getByText("ui:dialog.firefox.howOpenSidebar")).toBeVisible()
    expect(
      screen.getByText("ui:dialog.firefox.sidebarInstruction"),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "ui:dialog.firefox.confirm" }),
    )
    expect(onClose).toHaveBeenCalledOnce()
  })
  it("recommends a full page when sidebar support is missing", async () => {
    render(
      <FirefoxAddAccountWarningDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        sidePanelSupported={false}
      />,
    )
    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.firefox.openOptions",
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "ui:dialog.firefox.openSidebar" }),
    ).not.toBeInTheDocument()
  })
  it("offers a retry when continuation fails", async () => {
    const user = userEvent.setup()
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(new Error("navigation failed"))
      .mockResolvedValueOnce(undefined)
    render(
      <FirefoxAddAccountWarningDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={onConfirm}
        sidePanelSupported={false}
      />,
    )
    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.firefox.openOptions",
      }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ui:dialog.firefox.openFailed",
    )
    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.firefox.openOptions",
      }),
    )
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })
})
