import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { showFirefoxWarningDialog } from "~/entrypoints/popup/components/FirefoxAddAccountWarningDialog/showFirefoxWarningDialog"

import "~~/tests/test-utils/i18n"

const { openSidePanelPage, getSidePanelSupport } = vi.hoisted(() => ({
  openSidePanelPage: vi.fn().mockResolvedValue(undefined),
  getSidePanelSupport: vi.fn(() => ({ supported: true })),
}))

vi.mock("~/utils/navigation/sidepanel", () => ({ openSidePanelPage }))
vi.mock("~/utils/browser/browserApi", () => ({ getSidePanelSupport }))

describe("showFirefoxWarningDialog", () => {
  afterEach(async () => {
    const cancel = screen.queryByRole("button", {
      name: "ui:dialog.firefox.confirm",
    })
    if (cancel) await userEvent.setup().click(cancel)
    vi.clearAllMocks()
  })

  it("waits for continuation before removing its independently mounted dialog", async () => {
    const user = userEvent.setup()
    let complete!: () => void
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve
        }),
    )
    act(() => showFirefoxWarningDialog(onConfirm, false))
    const open = await screen.findByRole("button", {
      name: "ui:dialog.firefox.openOptions",
    })
    await user.click(open)
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(open).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "ui:dialog.firefox.confirm" }),
    ).toBeDisabled()
    await act(async () => complete())
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
  })

  it("retains the dialog after failure and removes it after a successful retry", async () => {
    const user = userEvent.setup()
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(new Error("opening failed"))
      .mockResolvedValueOnce(undefined)
    act(() => showFirefoxWarningDialog(onConfirm, false))
    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.firefox.openOptions",
      }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ui:dialog.firefox.openFailed",
    )
    await user.click(
      screen.getByRole("button", { name: "ui:dialog.firefox.openOptions" }),
    )
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })

  it("uses detected support and the default sidebar opener", async () => {
    const user = userEvent.setup()
    act(() => showFirefoxWarningDialog())
    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.firefox.openSidebar",
      }),
    )
    expect(getSidePanelSupport).toHaveBeenCalledOnce()
    expect(openSidePanelPage).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
  })

  it("removes the dialog when cancelled without starting navigation", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    act(() => showFirefoxWarningDialog(onConfirm, false))
    await user.click(
      await screen.findByRole("button", { name: "ui:dialog.firefox.confirm" }),
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
