import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "wxt/browser"

import { clearDevData } from "~/features/DevPanel/dataCleanup"
import {
  DevPanelProvider,
  useDevPanelSections,
} from "~/features/DevPanel/DevPanelSectionsContext"
import { DataCleanupSection } from "~/features/DevPanel/sections/dataCleanupSection"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/features/DevPanel/dataCleanup", () => ({ clearDevData: vi.fn() }))

function Actions() {
  const sections = useDevPanelSections()
  return (
    <>
      {sections.flatMap((s) =>
        s.actions.map((action) => (
          <button
            key={action.id}
            onClick={() => void action.run()}
            disabled={action.disabled}
          >
            {action.label}
          </button>
        )),
      )}
    </>
  )
}

function mount() {
  return render(
    <DevPanelProvider surface="options">
      <DataCleanupSection />
      <Actions />
    </DevPanelProvider>,
    {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    },
  )
}

describe("development data cleanup dialog", () => {
  beforeEach(() => {
    vi.stubEnv("MODE", "development")
    vi.mocked(clearDevData).mockResolvedValue(undefined)
    vi.spyOn(browser.runtime, "reload").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("requires a scope and confirmation before clearing, then reloads", async () => {
    const user = userEvent.setup()
    mount()
    await user.click(
      await screen.findByRole("button", { name: "Dev: Clear saved data" }),
    )
    expect(
      screen.getByRole("heading", { name: "Clear development data" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("dialog", { name: "Clear development data" }),
    ).toBeInTheDocument()
    for (const name of [
      "Test fixtures",
      "Saved accounts",
      "History and preferences",
      "Full reset",
    ]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument()
    }
    expect(
      screen.getByRole("button", { name: "Review cleanup" }),
    ).toBeDisabled()
    await user.click(screen.getByRole("checkbox", { name: "Settings" }))
    expect(
      screen.getByRole("checkbox", { name: "Settings" }),
    ).toHaveAccessibleDescription(
      "Restore application preferences. Keeps analytics opt-out, accounts, credentials and history.",
    )
    await user.click(screen.getByRole("button", { name: "Review cleanup" }))
    expect(clearDevData).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole("button", { name: "Clear selected data and reload" }),
    )
    await waitFor(() => expect(clearDevData).toHaveBeenCalledWith(["settings"]))
    expect(browser.runtime.reload).toHaveBeenCalledOnce()
  })

  it.each(["production", "test"])(
    "does not register cleanup controls in %s mode",
    (mode) => {
      vi.stubEnv("MODE", mode)
      mount()
      expect(
        screen.queryByRole("button", { name: "Dev: Clear saved data" }),
      ).not.toBeInTheDocument()
    },
  )

  it("allows returning from confirmation without clearing", async () => {
    const user = userEvent.setup()
    mount()
    await user.click(
      await screen.findByRole("button", { name: "Dev: Clear saved data" }),
    )
    await user.click(screen.getByRole("checkbox", { name: "Settings" }))
    await user.click(screen.getByRole("button", { name: "Review cleanup" }))
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(
      await screen.findByRole("checkbox", { name: "Settings" }),
    ).toBeChecked()
    expect(clearDevData).not.toHaveBeenCalled()
    expect(browser.runtime.reload).not.toHaveBeenCalled()
  })

  it.each(["Cancel", "Escape"])(
    "dismisses scope selection with %s without deleting data",
    async (method) => {
      const user = userEvent.setup()
      mount()
      await user.click(
        await screen.findByRole("button", { name: "Dev: Clear saved data" }),
      )
      await user.click(screen.getByRole("checkbox", { name: "Settings" }))
      if (method === "Escape") await user.keyboard("{Escape}")
      else await user.click(screen.getByRole("button", { name: "Cancel" }))
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      )
      expect(clearDevData).not.toHaveBeenCalled()
      expect(browser.runtime.reload).not.toHaveBeenCalled()
      await user.click(
        screen.getByRole("button", { name: "Dev: Clear saved data" }),
      )
      expect(
        screen.getByRole("checkbox", { name: "Settings" }),
      ).not.toBeChecked()
      expect(
        screen.getByRole("button", { name: "Review cleanup" }),
      ).toBeDisabled()
    },
  )

  it("removes deselected scopes while preserving the remaining selection", async () => {
    const user = userEvent.setup()
    mount()
    await user.click(
      await screen.findByRole("button", { name: "Dev: Clear saved data" }),
    )
    await user.click(
      screen.getByRole("checkbox", { name: "All saved extension data" }),
    )
    await user.click(
      screen.getByRole("checkbox", { name: "All saved extension data" }),
    )
    expect(screen.getByRole("checkbox", { name: "Settings" })).toBeEnabled()
    expect(
      screen.getByRole("button", { name: "Review cleanup" }),
    ).toBeDisabled()
    await user.click(screen.getByRole("checkbox", { name: "Settings" }))
    await user.click(screen.getByRole("checkbox", { name: "History and logs" }))
    await user.click(screen.getByRole("checkbox", { name: "Settings" }))
    await user.click(screen.getByRole("button", { name: "Review cleanup" }))
    await user.click(
      screen.getByRole("button", { name: "Clear selected data and reload" }),
    )
    await waitFor(() => expect(clearDevData).toHaveBeenCalledWith(["history"]))
  })

  it("keeps an admitted cleanup pending until it finishes without duplicate execution", async () => {
    const pending = createDeferred<void>()
    vi.mocked(clearDevData).mockReturnValueOnce(pending.promise)
    const user = userEvent.setup()
    mount()
    await user.click(
      await screen.findByRole("button", { name: "Dev: Clear saved data" }),
    )
    await user.click(screen.getByRole("checkbox", { name: "Settings" }))
    await user.click(screen.getByRole("button", { name: "Review cleanup" }))
    await user.click(
      screen.getByRole("button", { name: "Clear selected data and reload" }),
    )
    expect(screen.getByRole("button", { name: "Clearing…" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled()
    await user.keyboard("{Escape}")
    expect(
      screen.getByRole("dialog", { name: "Clear selected development data?" }),
    ).toBeVisible()
    expect(clearDevData).toHaveBeenCalledOnce()
    expect(browser.runtime.reload).not.toHaveBeenCalled()
    pending.resolve()
    await waitFor(() => expect(browser.runtime.reload).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
  })

  it("distinguishes all accounts from mock-only cleanup and all saved data", async () => {
    const user = userEvent.setup()
    mount()
    await user.click(
      await screen.findByRole("button", { name: "Dev: Clear saved data" }),
    )
    await user.click(
      screen.getByRole("checkbox", { name: "Test accounts and credentials" }),
    )
    await user.click(
      screen.getByRole("checkbox", { name: "All accounts and credentials" }),
    )
    expect(
      screen.getByRole("checkbox", { name: "Test accounts and credentials" }),
    ).not.toBeChecked()
    expect(
      screen.getByRole("checkbox", { name: "Test accounts and credentials" }),
    ).toBeDisabled()
    await user.click(
      screen.getByRole("checkbox", { name: "All saved extension data" }),
    )
    expect(
      screen.getByRole("checkbox", { name: "All accounts and credentials" }),
    ).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Settings" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Review cleanup" }))
    expect(
      screen.getByRole("heading", { name: "Clear all saved extension data?" }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "Clear selected data and reload" }),
    )
    await waitFor(() => expect(clearDevData).toHaveBeenCalledWith(["all"]))
  })

  it("keeps failures visible and does not reload when cleanup fails", async () => {
    vi.mocked(clearDevData).mockRejectedValueOnce(
      new Error("storage unavailable"),
    )
    const user = userEvent.setup()
    mount()
    await user.click(
      await screen.findByRole("button", { name: "Dev: Clear saved data" }),
    )
    await user.click(screen.getByRole("checkbox", { name: "Settings" }))
    await user.click(screen.getByRole("button", { name: "Review cleanup" }))
    await user.click(
      screen.getByRole("button", { name: "Clear selected data and reload" }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some selected data may already have been removed",
    )
    expect(screen.getByRole("alert")).toHaveTextContent("storage unavailable")
    expect(browser.runtime.reload).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", { name: "Clear selected data and reload" }),
    ).toBeEnabled()
    await user.click(
      screen.getByRole("button", { name: "Clear selected data and reload" }),
    )
    await waitFor(() => expect(browser.runtime.reload).toHaveBeenCalledOnce())
  })

  it("reports when data was cleared but the runtime could not reload", async () => {
    vi.spyOn(browser.runtime, "reload").mockImplementation(() => {
      throw new Error("reload unavailable")
    })
    const user = userEvent.setup()
    mount()
    await user.click(
      await screen.findByRole("button", { name: "Dev: Clear saved data" }),
    )
    await user.click(screen.getByRole("checkbox", { name: "Settings" }))
    await user.click(screen.getByRole("button", { name: "Review cleanup" }))
    await user.click(
      screen.getByRole("button", { name: "Clear selected data and reload" }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Data was cleared, but the extension could not reload",
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Reload it manually")
    expect(clearDevData).toHaveBeenCalledWith(["settings"])
  })
})
