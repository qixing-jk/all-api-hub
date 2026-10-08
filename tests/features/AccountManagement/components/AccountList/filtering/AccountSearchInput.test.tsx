import { describe, expect, it, vi } from "vitest"

import AccountSearchInput from "~/features/AccountManagement/components/AccountList/filtering/AccountSearchInput"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

describe("AccountSearchInput", () => {
  it("forwards typed values and clears from the inline clear button when text exists", async () => {
    const onChange = vi.fn()
    const onClear = vi.fn()

    render(
      <AccountSearchInput
        value="alpha"
        onChange={onChange}
        onClear={onClear}
      />,
    )

    const input = await screen.findByPlaceholderText(
      "account:search.placeholder",
    )
    fireEvent.change(input, { target: { value: "beta" } })

    expect(onChange).toHaveBeenCalledWith("beta")

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it("clears on Escape and stops the key event from bubbling to parent shortcuts", async () => {
    const onClear = vi.fn()
    const parentKeyDown = vi.fn()

    render(
      <div onKeyDown={parentKeyDown}>
        <AccountSearchInput
          value="alpha"
          onChange={vi.fn()}
          onClear={onClear}
        />
      </div>,
    )

    const input = await screen.findByPlaceholderText(
      "account:search.placeholder",
    )
    fireEvent.keyDown(input, { key: "Escape" })

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(parentKeyDown).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: "Enter" })

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(parentKeyDown).toHaveBeenCalledTimes(1)
  })

  it("hides the inline clear button when the search value is empty", async () => {
    render(<AccountSearchInput value="" onChange={vi.fn()} onClear={vi.fn()} />)

    await screen.findByPlaceholderText("account:search.placeholder")

    expect(
      screen.queryByRole("button", { name: "common:actions.clear" }),
    ).toBeNull()
  })
})
