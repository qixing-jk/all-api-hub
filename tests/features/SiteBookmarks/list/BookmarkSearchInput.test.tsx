import { describe, expect, it, vi } from "vitest"

import BookmarkSearchInput from "~/features/SiteBookmarks/list/BookmarkSearchInput"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

describe("BookmarkSearchInput", () => {
  it("forwards typed values and clears from the inline clear button when text exists", async () => {
    const onChange = vi.fn()
    const onClear = vi.fn()

    render(
      <BookmarkSearchInput
        value="saved prompt"
        onChange={onChange}
        onClear={onClear}
      />,
    )

    const input = await screen.findByPlaceholderText(
      "bookmark:search.placeholder",
    )
    fireEvent.change(input, { target: { value: "updated prompt" } })

    expect(onChange).toHaveBeenCalledWith("updated prompt")

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
        <BookmarkSearchInput
          value="saved prompt"
          onChange={vi.fn()}
          onClear={onClear}
        />
      </div>,
    )

    const input = await screen.findByPlaceholderText(
      "bookmark:search.placeholder",
    )
    fireEvent.keyDown(input, { key: "Escape" })

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(parentKeyDown).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: "Enter" })

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(parentKeyDown).toHaveBeenCalledTimes(1)
  })

  it("hides the inline clear button when the search value is empty", async () => {
    render(
      <BookmarkSearchInput value="" onChange={vi.fn()} onClear={vi.fn()} />,
    )

    await screen.findByPlaceholderText("bookmark:search.placeholder")

    expect(
      screen.queryByRole("button", { name: "common:actions.clear" }),
    ).toBeNull()
  })
})
