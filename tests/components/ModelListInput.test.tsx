import React from "react"
import { describe, expect, it } from "vitest"

import { ModelListInput } from "~/components/ui"
import { fireEvent, render, screen } from "~/tests/test-utils/render"

describe("ModelListInput", () => {
  it("renders model name and alias inputs", async () => {
    const Wrapper = () => {
      const [value, setValue] = React.useState<
        React.ComponentProps<typeof ModelListInput>["value"]
      >([{ id: "1", name: "", alias: "" }])
      return <ModelListInput value={value} onChange={setValue} />
    }

    render(<Wrapper />)

    expect(
      await screen.findByText("ui:modelListInput.title"),
    ).toBeInTheDocument()
    expect(
      await screen.findByPlaceholderText("ui:modelListInput.placeholders.name"),
    ).toBeInTheDocument()
    expect(
      await screen.findByPlaceholderText(
        "ui:modelListInput.placeholders.alias",
      ),
    ).toBeInTheDocument()
  })

  it("adds and removes model rows", async () => {
    const Wrapper = () => {
      const [value, setValue] = React.useState<
        React.ComponentProps<typeof ModelListInput>["value"]
      >([{ id: "1", name: "", alias: "" }])
      return <ModelListInput value={value} onChange={setValue} />
    }

    render(<Wrapper />)

    const addButton = await screen.findByRole("button", {
      name: "ui:modelListInput.actions.add",
    })
    fireEvent.click(addButton)

    const modelNameInputs = await screen.findAllByPlaceholderText(
      "ui:modelListInput.placeholders.name",
    )
    expect(modelNameInputs.length).toBe(2)

    const removeButtons = await screen.findAllByRole("button", {
      name: "ui:modelListInput.actions.remove",
    })
    fireEvent.click(removeButtons[0])

    const remainingNameInputs = await screen.findAllByPlaceholderText(
      "ui:modelListInput.placeholders.name",
    )
    expect(remainingNameInputs.length).toBe(1)
  })

  it("uses SearchableSelect when name suggestions are provided", async () => {
    const Wrapper = () => {
      const [value, setValue] = React.useState<
        React.ComponentProps<typeof ModelListInput>["value"]
      >([{ id: "1", name: "", alias: "" }])
      return (
        <ModelListInput
          value={value}
          onChange={setValue}
          nameSuggestions={["gpt-4", "claude-3-opus", "gpt-4"]}
        />
      )
    }

    render(<Wrapper />)

    const nameCombo = await screen.findByRole("combobox")
    fireEvent.click(nameCombo)
    expect(await screen.findByText("gpt-4")).toBeInTheDocument()
  })
})
