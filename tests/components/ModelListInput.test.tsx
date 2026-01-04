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

    expect(await screen.findByText(/Model List/i)).toBeInTheDocument()
    expect(
      await screen.findByPlaceholderText("Model name, e.g. claude"),
    ).toBeInTheDocument()
    expect(
      await screen.findByPlaceholderText("Model alias (optional)"),
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

    const addButton = await screen.findByRole("button", { name: "Add Model" })
    fireEvent.click(addButton)

    const modelNameInputs = await screen.findAllByPlaceholderText(
      "Model name, e.g. claude",
    )
    expect(modelNameInputs.length).toBe(2)

    const removeButtons = await screen.findAllByRole("button", {
      name: "Remove model",
    })
    fireEvent.click(removeButtons[0])

    const remainingNameInputs = await screen.findAllByPlaceholderText(
      "Model name, e.g. claude",
    )
    expect(remainingNameInputs.length).toBe(1)
  })
})
