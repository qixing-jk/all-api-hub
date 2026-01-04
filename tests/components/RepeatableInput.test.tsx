import React from "react"
import { describe, expect, it } from "vitest"

import { RepeatableInput } from "~/components/ui"
import { fireEvent, render, screen } from "~/tests/test-utils/render"

interface TestItem {
  id: string
  value: string
}

describe("RepeatableInput", () => {
  it("adds and removes rows", async () => {
    let nextId = 2

    const Wrapper = () => {
      const [items, setItems] = React.useState<TestItem[]>([
        { id: "1", value: "first" },
      ])

      return (
        <RepeatableInput
          items={items}
          onChange={setItems}
          addLabel="Add Row"
          removeLabel="Remove Row"
          createItem={() => ({ id: String(nextId++), value: "" })}
          renderItem={({ item, updateItem }) => (
            <input
              aria-label={`Row ${item.id}`}
              value={item.value}
              onChange={(event) =>
                updateItem((prev) => ({ ...prev, value: event.target.value }))
              }
            />
          )}
        />
      )
    }

    render(<Wrapper />)

    expect(await screen.findByLabelText("Row 1")).toBeInTheDocument()

    fireEvent.click(await screen.findByRole("button", { name: "Add Row" }))
    expect(await screen.findByLabelText("Row 2")).toBeInTheDocument()

    const removeButtons = await screen.findAllByRole("button", {
      name: "Remove Row",
    })
    fireEvent.click(removeButtons[0])

    expect(screen.queryByLabelText("Row 1")).not.toBeInTheDocument()
    expect(await screen.findByLabelText("Row 2")).toBeInTheDocument()
  })

  it("updates row content via updateItem", async () => {
    const Wrapper = () => {
      const [items, setItems] = React.useState<TestItem[]>([
        { id: "1", value: "" },
      ])

      return (
        <RepeatableInput
          items={items}
          onChange={setItems}
          createItem={() => ({ id: "2", value: "" })}
          renderItem={({ item, updateItem }) => (
            <input
              aria-label={`Row ${item.id}`}
              value={item.value}
              onChange={(event) =>
                updateItem((prev) => ({ ...prev, value: event.target.value }))
              }
            />
          )}
        />
      )
    }

    render(<Wrapper />)

    const input = await screen.findByLabelText("Row 1")
    fireEvent.change(input, { target: { value: "hello" } })

    expect(await screen.findByDisplayValue("hello")).toBeInTheDocument()
  })
})
