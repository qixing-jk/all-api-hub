import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { ResourceJsonField } from "~/features/ResourceEditor/ResourceJsonField"
import enManagedSiteChannels from "~/locales/en/managedSiteChannels.json"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { render } from "~~/tests/test-utils/render"

/** Supplies a controlled field so assertions follow actual user edits. */
function Harness({
  t,
  initial,
  onChange,
}: {
  t: TFunction
  initial: string
  onChange: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <ResourceJsonField
      t={t}
      label="Model mapping"
      value={value}
      stringMap
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe("structured JSON resource fields", () => {
  it("keeps duplicate rows recoverable instead of overwriting another mapping", async () => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({
      en: { managedSiteChannels: enManagedSiteChannels },
    })
    const onChange = vi.fn()
    render(
      <Harness t={i18n.t} initial='{"alias":"first"}' onChange={onChange} />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    const group = screen.getByRole("group", { name: "Model mapping" })
    await user.click(within(group).getByRole("button", { name: "Add row" }))
    await user.type(
      screen.getByRole("textbox", { name: "Model mapping: row 2 key" }),
      "alias",
    )
    await user.type(
      screen.getByRole("textbox", { name: "Model mapping: row 2 value" }),
      "second",
    )
    expect(
      screen.getByRole("textbox", { name: "Model mapping: row 1 value" }),
    ).toHaveValue("first")
    expect(
      screen.getByRole("textbox", { name: "Model mapping: row 2 value" }),
    ).toHaveValue("second")
    await user.clear(
      screen.getByRole("textbox", { name: "Model mapping: row 2 key" }),
    )
    await user.type(
      screen.getByRole("textbox", { name: "Model mapping: row 2 key" }),
      "other",
    )
    expect(JSON.parse(onChange.mock.lastCall![0])).toEqual({
      alias: "first",
      other: "second",
    })
    await user.click(
      screen.getByRole("button", { name: "Model mapping: remove row 1" }),
    )
    await user.click(
      screen.getByRole("button", { name: "Model mapping: remove row 1" }),
    )
    expect(JSON.parse(onChange.mock.lastCall![0])).toEqual({})
  })

  it("repairs malformed saved JSON and switches between paste and row editing without losing values", async () => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({
      en: { managedSiteChannels: enManagedSiteChannels },
    })
    const onChange = vi.fn()
    render(<Harness t={i18n.t} initial="{broken" onChange={onChange} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    expect(screen.getByRole("textbox", { name: "Model mapping" })).toHaveValue(
      "{broken",
    )
    expect(screen.getByRole("button", { name: "Format JSON" })).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
    const input = screen.getByRole("textbox", { name: "Model mapping" })
    await user.clear(input)
    await user.paste('{"alias":"corrected"}')
    // The repaired JSON can be viewed as rows, then edited as JSON again.
    await user.click(screen.getByRole("button", { name: "Edit rows" }))
    expect(
      screen.getByRole("textbox", { name: "Model mapping: row 1 value" }),
    ).toHaveValue("corrected")
    await user.click(screen.getByRole("button", { name: "Edit JSON" }))
    await user.click(screen.getByRole("button", { name: "Format JSON" }))
    expect(screen.getByRole("textbox", { name: "Model mapping" })).toHaveValue(
      '{\n  "alias": "corrected"\n}',
    )
  })
})
