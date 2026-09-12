import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { NativeResourceEditorBody } from "~/features/ResourceEditor/NativeResourceEditorBody"
import type { ResourceEditorFieldPolicy } from "~/features/ResourceEditor/resourceFieldPolicy"
import type { ResourceFieldIssue } from "~/services/apiAdapters/contracts/resourceNative"

const t = ((key: string) => key) as TFunction
const policy: ResourceEditorFieldPolicy<"models"> = {
  fields: [
    {
      fieldId: "models",
      section: "models",
      order: 0,
      renderer: "textarea",
      resolveLabel: () => "Model mappings",
      textEntries: {
        separator: "=",
        omitEmptyValue: true,
        resolveKeyLabel: () => "Model",
        resolveValueLabel: () => "Alias",
      },
    },
  ],
  hiddenFields: [],
  sections: { models: { resolveSummary: () => "Configured models" } },
}

function Harness({
  initial = "model-a = alias-a\nmodel-b",
  onChange = () => {},
  issues = [],
  fieldPolicy = policy,
}: {
  initial?: string
  onChange?: (value: string) => void
  issues?: ResourceFieldIssue[]
  fieldPolicy?: typeof policy
}) {
  const [value, setValue] = useState(initial)
  return (
    <NativeResourceEditorBody
      t={t}
      descriptors={[{ fieldId: "models", type: "textarea" }]}
      policy={fieldPolicy}
      sectionOrder={{ models: 0 }}
      sectionLabelResolvers={{ models: () => "Models" }}
      values={{ models: value }}
      fieldIssues={issues}
      onValueChange={(_, next) => {
        setValue(next as string)
        onChange(next as string)
      }}
    />
  )
}

describe("structured resource text entries", () => {
  it("edits aliases, adds optional aliases, and removes rows without rewriting untouched lines", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Harness initial={"model-a  =  alias-a\nmodel-b"} onChange={onChange} />,
    )
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Models" }))
    expect(onChange).not.toHaveBeenCalled()
    await user.type(screen.getByRole("textbox", { name: "Alias 2" }), "alias-b")
    expect(onChange).toHaveBeenLastCalledWith(
      "model-a  =  alias-a\nmodel-b = alias-b",
    )
    await user.clear(screen.getByRole("textbox", { name: "Alias 2" }))
    expect(onChange).toHaveBeenLastCalledWith("model-a  =  alias-a\nmodel-b")
    await user.click(screen.getByRole("button", { name: "ui:textEntries.add" }))
    await user.type(screen.getByRole("textbox", { name: "Model 3" }), "model-c")
    expect(screen.getByRole("textbox", { name: "Model 3" })).toHaveFocus()
    expect(onChange).toHaveBeenLastCalledWith(
      "model-a  =  alias-a\nmodel-b\nmodel-c",
    )
    await user.click(
      screen.getAllByRole("button", { name: "ui:textEntries.remove" })[1],
    )
    expect(onChange).toHaveBeenLastCalledWith("model-a  =  alias-a\nmodel-c")
  })

  it("keeps bulk text intact and displays incomplete mappings for correction", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await user.click(screen.getByRole("button", { name: "Models" }))
    await user.click(
      screen.getByRole("button", { name: "ui:textEntries.editText" }),
    )
    const text = screen.getByRole("textbox", { name: "Model mappings" })
    await user.clear(text)
    await user.type(text, "model-a =\nmodel-b = alias=invalid")
    onChange.mockClear()
    await user.click(
      screen.getByRole("button", { name: "ui:textEntries.editRows" }),
    )
    expect(screen.getByRole("textbox", { name: "Alias 1" })).toHaveValue("")
    expect(screen.getByRole("textbox", { name: "Alias 2" })).toHaveValue(
      "alias=invalid",
    )
    await user.click(
      screen.getByRole("button", { name: "ui:textEntries.editText" }),
    )
    expect(screen.getByRole("textbox", { name: "Model mappings" })).toHaveValue(
      "model-a =\nmodel-b = alias=invalid",
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it("preserves colons in header values and serializes explicitly empty values", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Harness
        initial={"Location: https://example.invalid:8443/v1\nX-Empty:"}
        onChange={onChange}
        fieldPolicy={{
          ...policy,
          fields: [
            {
              ...policy.fields[0],
              textEntries: {
                separator: ":",
                resolveKeyLabel: () => "Header",
                resolveValueLabel: () => "Value",
              },
            },
          ],
        }}
      />,
    )
    await user.click(screen.getByRole("button", { name: "Models" }))
    expect(screen.getByRole("textbox", { name: "Value 1" })).toHaveValue(
      "https://example.invalid:8443/v1",
    )
    await user.type(
      screen.getByRole("textbox", { name: "Header 2" }),
      "-Updated",
    )
    expect(onChange).toHaveBeenLastCalledWith(
      "Location: https://example.invalid:8443/v1\nX-Empty-Updated: ",
    )
  })

  it("reopens a collapsed invalid section and preserves drafts across toggles", async () => {
    const user = userEvent.setup()
    const view = render(<Harness />)
    const toggle = screen.getByRole("button", { name: "Models" })
    toggle.focus()
    await user.keyboard("{Enter}")
    await user.type(screen.getByRole("textbox", { name: "Alias 1" }), "-edited")
    await user.click(toggle)
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    view.rerender(
      <Harness issues={[{ fieldId: "models", code: "invalid_value" }]} />,
    )
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("textbox", { name: "Alias 1" })).toHaveValue(
      "alias-a-edited",
    )
    expect(screen.getByRole("textbox", { name: "Alias 1" })).toHaveAttribute(
      "aria-invalid",
      "true",
    )
    expect(
      within(screen.getByRole("group", { name: "Models" })).getByRole("alert"),
    ).toBeVisible()
    view.rerender(<Harness />)
    expect(screen.getByRole("textbox", { name: "Alias 1" })).toBeVisible()
    expect(toggle).toHaveAttribute("aria-expanded", "true")
  })
})
