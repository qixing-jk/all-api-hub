import { act, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { SettingSection } from "~/components/SettingSection"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { render } from "~~/tests/test-utils/render"

function Example() {
  const [value, setValue] = useState("custom")
  return (
    <SettingSection
      title="Display"
      resetRequiresConfirmation={false}
      resetDisabled={value === "default"}
      onReset={async () => {
        setValue("default")
        return { ok: true } as const
      }}
    >
      <output>{value}</output>
    </SettingSection>
  )
}

describe("settings reset", () => {
  it("locks editing during reset and allows retry after a failed confirmed reset", async () => {
    const user = userEvent.setup()
    const pending = createDeferred<{
      ok: boolean
      reason?: { type: "storage-error"; error: Error }
    }>()
    const reset = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ ok: true })
    render(
      <SettingSection
        title="Connection"
        onReset={reset}
        resetDescription="Credentials will be cleared"
      >
        <input aria-label="Address" defaultValue="https://example.com" />
      </SettingSection>,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )
    await user.click(
      screen.getByRole("button", { name: "common:actions.reset" }),
    )
    expect(reset).not.toHaveBeenCalled()
    const dialog = screen.getByRole("dialog")
    expect(
      within(dialog).getByText("Credentials will be cleared"),
    ).toBeVisible()
    await user.click(
      within(dialog).getByRole("button", { name: "common:actions.reset" }),
    )
    expect(
      screen.getByRole("textbox", { name: "Address", hidden: true }),
    ).toBeDisabled()
    await act(async () =>
      pending.resolve({
        ok: false,
        reason: { type: "storage-error", error: new Error("disk full") },
      }),
    )
    expect(screen.getByRole("dialog")).toBeVisible()
    await user.click(
      within(dialog).getByRole("button", { name: "common:actions.reset" }),
    )
    expect(reset).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Address" })).toHaveValue(
      "https://example.com",
    )
  })

  it("immediately resets low-risk settings and disables reset at defaults", async () => {
    const user = userEvent.setup()
    render(<Example />, {
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })
    await user.click(
      screen.getByRole("button", { name: "common:actions.reset" }),
    )
    expect(screen.getByRole("status")).toHaveTextContent("default")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "common:actions.reset" }),
    ).toBeDisabled()
  })
})
