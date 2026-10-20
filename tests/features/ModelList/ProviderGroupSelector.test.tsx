import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ProviderGroupSelector } from "~/features/ModelList/presentation/ModelItem/ProviderGroupSelector"
import modelList from "~/locales/en/modelList.json"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render, screen } from "~~/tests/test-utils/render"

const group = {
  selected: "standard",
  options: [
    { value: "standard", available: true },
    { value: "premium", available: true, multiplier: 1.5 },
    { value: "blocked", available: false },
  ],
}
describe("provider routing group", () => {
  testI18n.addResourceBundle("en", "modelList", modelList, true, true)
  it("requires an explicit apply and waits for confirmation", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ProviderGroupSelector group={group} onSave={onSave} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: "Change official routing group" }),
    )
    await user.click(
      screen.getByRole("combobox", { name: "Official routing group" }),
    )
    expect(screen.getByRole("option", { name: /blocked/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
    await user.click(screen.getByRole("option", { name: "premium · ×1.5" }))
    expect(onSave).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole("button", { name: "Save to official site" }),
    )
    expect(onSave).toHaveBeenCalledWith("premium")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
  it("lets users dismiss routing edits without changing the official site", async () => {
    const onSave = vi.fn()
    render(<ProviderGroupSelector group={group} onSave={onSave} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: "Change official routing group" }),
    )
    await user.click(screen.getByRole("combobox"))
    await user.click(screen.getByRole("option", { name: "premium · ×1.5" }))
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole("button", { name: "Change official routing group" }),
    )
    expect(screen.getByRole("combobox")).toHaveTextContent("standard")
  })
  it("does not allow changes while an active session locks routing", () => {
    render(
      <ProviderGroupSelector
        group={{ ...group, locked: true }}
        onSave={vi.fn()}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    expect(
      screen.getByRole("button", { name: "Change official routing group" }),
    ).toBeDisabled()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  })
  it("keeps a failed write visible and requires refresh before another write", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("connection lost"))
    render(<ProviderGroupSelector group={group} onSave={onSave} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: "Change official routing group" }),
    )
    await user.click(screen.getByRole("combobox"))
    await user.click(screen.getByRole("option", { name: "premium · ×1.5" }))
    await user.click(
      screen.getByRole("button", { name: "Save to official site" }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "connection lost",
    )
    expect(
      screen.getByRole("button", { name: "Save to official site" }),
    ).toBeDisabled()
  })
})
