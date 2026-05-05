import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { OptionsSearchDialog } from "~/entrypoints/options/search/OptionsSearchDialog"
import type { OptionsSearchContext } from "~/entrypoints/options/search/types"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const baseContext: OptionsSearchContext = {
  autoCheckinEnabled: true,
  hasOptionalPermissions: true,
  managedSiteType: "new-api",
  showTodayCashflow: true,
  sidePanelSupported: true,
}

describe("OptionsSearchDialog", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("shows an idle state before the user types a query", async () => {
    render(
      <OptionsSearchDialog
        open
        onOpenChange={vi.fn()}
        onPageNavigate={vi.fn()}
        context={baseContext}
      />,
    )

    await screen.findByRole("dialog")

    expect(screen.getByText("ui:optionsSearch.idleTitle")).toBeInTheDocument()
    expect(
      screen.getByText("ui:optionsSearch.idleDescription"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("group", { name: "ui:optionsSearch.groups.page" }),
    ).not.toBeInTheDocument()
  })

  it("shows recently selected settings when reopened without a query", async () => {
    const user = userEvent.setup()

    const { rerender } = render(
      <OptionsSearchDialog
        open
        onOpenChange={vi.fn()}
        onPageNavigate={vi.fn()}
        context={baseContext}
      />,
    )

    await screen.findByRole("dialog")
    await user.type(screen.getByRole("combobox"), "clipboard")
    await user.click(
      screen.getByText("settings:permissions.items.clipboardRead.title"),
    )

    rerender(
      <OptionsSearchDialog
        open
        onOpenChange={vi.fn()}
        onPageNavigate={vi.fn()}
        context={baseContext}
      />,
    )

    await screen.findByRole("dialog")

    await waitFor(() => {
      expect(
        screen.getByRole("group", { name: "ui:optionsSearch.groups.recent" }),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByText("settings:permissions.items.clipboardRead.title"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("ui:optionsSearch.idleTitle"),
    ).not.toBeInTheDocument()
  })

  it("groups page, tab, and control results and matches technical aliases", async () => {
    const user = userEvent.setup()
    const onPageNavigate = vi.fn()

    render(
      <OptionsSearchDialog
        open
        onOpenChange={vi.fn()}
        onPageNavigate={onPageNavigate}
        context={baseContext}
      />,
    )

    await screen.findByRole("dialog")
    const input = screen.getByRole("combobox")
    await user.type(input, "webdav")

    expect(
      screen.getByRole("group", { name: "ui:optionsSearch.groups.control" }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText("importExport:webdav.title").length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText("importExport:webdav.autoSync.title").length,
    ).toBeGreaterThan(0)
  })

  it("finds newly indexed localized settings across options pages", async () => {
    const user = userEvent.setup()

    render(
      <OptionsSearchDialog
        open
        onOpenChange={vi.fn()}
        onPageNavigate={vi.fn()}
        context={baseContext}
      />,
    )

    await screen.findByRole("dialog")
    const input = screen.getByRole("combobox")
    await user.type(input, "upload")

    expect(
      screen.getAllByText("importExport:webdav.uploadBackup").length,
    ).toBeGreaterThan(0)
  })

  it("finds newly indexed settings that were previously missing", async () => {
    const user = userEvent.setup()

    render(
      <OptionsSearchDialog
        open
        onOpenChange={vi.fn()}
        onPageNavigate={vi.fn()}
        context={baseContext}
      />,
    )

    await screen.findByRole("dialog")
    const input = screen.getByRole("combobox")
    await user.type(input, "clipboard")

    expect(
      screen.getByText("settings:permissions.items.clipboardRead.title"),
    ).toBeInTheDocument()
  })

  it("finds individual sorting priority rules", async () => {
    const user = userEvent.setup()

    render(
      <OptionsSearchDialog
        open
        onOpenChange={vi.fn()}
        onPageNavigate={vi.fn()}
        context={baseContext}
      />,
    )

    await screen.findByRole("dialog")
    const input = screen.getByRole("combobox")
    await user.type(input, "pinned")

    expect(
      screen.getByText("settings:sorting.pinnedPriority"),
    ).toBeInTheDocument()
  })

  it("finds individual WebDAV sync data options", async () => {
    const user = userEvent.setup()

    render(
      <OptionsSearchDialog
        open
        onOpenChange={vi.fn()}
        onPageNavigate={vi.fn()}
        context={baseContext}
      />,
    )

    await screen.findByRole("dialog")
    const input = screen.getByRole("combobox")
    await user.type(input, "bookmarks")

    expect(
      screen.getAllByText("importExport:webdav.syncData.bookmarks").length,
    ).toBeGreaterThan(0)
  })

  it("navigates through page results and closes after selection", async () => {
    const user = userEvent.setup()
    const onPageNavigate = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <OptionsSearchDialog
        open
        onOpenChange={onOpenChange}
        onPageNavigate={onPageNavigate}
        context={baseContext}
      />,
    )

    await screen.findByRole("dialog")
    await user.type(screen.getByRole("combobox"), "book")
    await user.click(screen.getByText("ui:navigation.bookmark"))

    expect(onPageNavigate).toHaveBeenCalledWith("bookmark")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("clears the query when the clear button is used", async () => {
    const user = userEvent.setup()

    render(
      <OptionsSearchDialog
        open
        onOpenChange={vi.fn()}
        onPageNavigate={vi.fn()}
        context={baseContext}
      />,
    )

    await screen.findByRole("dialog")
    const input = screen.getByRole("combobox")
    await user.type(input, "webdav")
    await user.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )

    expect(input).toHaveValue("")
  })

  it("closes through dialog dismissal and resets the query", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <OptionsSearchDialog
        open
        onOpenChange={onOpenChange}
        onPageNavigate={vi.fn()}
        context={baseContext}
      />,
    )

    await screen.findByRole("dialog")
    const input = screen.getByRole("combobox")
    await user.type(input, "webdav")
    await user.keyboard("{Escape}")

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(input).toHaveValue("")
  })

  it("renders nothing when closed until reopened", async () => {
    const { rerender } = render(
      <OptionsSearchDialog
        open={false}
        onOpenChange={vi.fn()}
        onPageNavigate={vi.fn()}
        context={baseContext}
      />,
    )

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    rerender(
      <OptionsSearchDialog
        open
        onOpenChange={vi.fn()}
        onPageNavigate={vi.fn()}
        context={baseContext}
      />,
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })

  it("unmounts cleanly while closed", () => {
    const { unmount } = render(
      <OptionsSearchDialog
        open={false}
        onOpenChange={vi.fn()}
        onPageNavigate={vi.fn()}
        context={baseContext}
      />,
    )

    unmount()
  })

  it("lets the user open a recent item after reopening the dialog", async () => {
    const user = userEvent.setup()
    const onPageNavigate = vi.fn()

    const { rerender } = render(
      <OptionsSearchDialog
        open
        onOpenChange={vi.fn()}
        onPageNavigate={onPageNavigate}
        context={baseContext}
      />,
    )

    await screen.findByRole("dialog")
    await user.type(screen.getByRole("combobox"), "clipboard")
    await user.click(
      screen.getByText("settings:permissions.items.clipboardRead.title"),
    )

    rerender(
      <OptionsSearchDialog
        open
        onOpenChange={vi.fn()}
        onPageNavigate={onPageNavigate}
        context={baseContext}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByRole("group", { name: "ui:optionsSearch.groups.recent" }),
      ).toBeInTheDocument()
    })

    await user.click(
      screen.getByText("settings:permissions.items.clipboardRead.title"),
    )

    expect(onPageNavigate).toHaveBeenLastCalledWith("basic", {
      anchor: "clipboardRead",
      highlight: "clipboardRead",
      tab: "permissions",
    })
  })

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup()

    render(
      <OptionsSearchDialog
        open
        onOpenChange={vi.fn()}
        onPageNavigate={vi.fn()}
        context={baseContext}
      />,
    )

    await screen.findByRole("dialog")
    await user.type(screen.getByRole("combobox"), "no-such-setting")

    expect(screen.getByText("ui:optionsSearch.emptyTitle")).toBeInTheDocument()
    expect(
      screen.getByText("ui:optionsSearch.emptyDescription"),
    ).toBeInTheDocument()
  })
})
