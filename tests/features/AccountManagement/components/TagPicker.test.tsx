import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { TagPicker } from "~/features/AccountManagement/components/TagPicker"
import type { Tag } from "~/types"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("TagPicker", () => {
  it("supports ArrowUp/ArrowDown navigation and Enter to toggle a tag", async () => {
    const user = userEvent.setup()

    const onSelectedTagIdsChange = vi.fn()
    const onCreateTag = vi.fn()
    const onRenameTag = vi.fn()
    const onDeleteTag = vi.fn()

    render(
      <TagPicker
        tags={[
          { id: "t1", name: "Work", createdAt: 1, updatedAt: 1 },
          { id: "t2", name: "Personal", createdAt: 1, updatedAt: 1 },
        ]}
        selectedTagIds={[]}
        onSelectedTagIdsChange={onSelectedTagIdsChange}
        onCreateTag={onCreateTag}
        onRenameTag={onRenameTag}
        onDeleteTag={onDeleteTag}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "form.tagsPlaceholder" }),
    )

    // Focus the search input, move the active option, then activate it via Enter.
    const input = screen.getByPlaceholderText("form.tagsSearchPlaceholder")
    await user.click(input)
    await user.keyboard("{ArrowDown}{Enter}")

    expect(onSelectedTagIdsChange).toHaveBeenCalledWith(["t1"])
  })

  it("creates a tag via Enter when create is available", async () => {
    const user = userEvent.setup()

    const onSelectedTagIdsChange = vi.fn()
    const onCreateTag = vi.fn().mockResolvedValue({
      id: "t-new",
      name: "NewTag",
      createdAt: 1,
      updatedAt: 1,
    } satisfies Tag)
    const onRenameTag = vi.fn()
    const onDeleteTag = vi.fn()

    render(
      <TagPicker
        tags={[]}
        selectedTagIds={[]}
        onSelectedTagIdsChange={onSelectedTagIdsChange}
        onCreateTag={onCreateTag}
        onRenameTag={onRenameTag}
        onDeleteTag={onDeleteTag}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "form.tagsPlaceholder" }),
    )
    const input = screen.getByPlaceholderText("form.tagsSearchPlaceholder")
    await user.type(input, "NewTag")
    await user.keyboard("{Enter}")

    expect(onCreateTag).toHaveBeenCalledWith("NewTag")
    expect(onSelectedTagIdsChange).toHaveBeenCalledWith(["t-new"])
  })

  it("creates a tag and selects it", async () => {
    const user = userEvent.setup()

    const onSelectedTagIdsChange = vi.fn()
    const onCreateTag = vi.fn().mockResolvedValue({
      id: "t-new",
      name: "NewTag",
      createdAt: 1,
      updatedAt: 1,
    } satisfies Tag)
    const onRenameTag = vi.fn()
    const onDeleteTag = vi.fn()

    render(
      <TagPicker
        tags={[]}
        selectedTagIds={[]}
        onSelectedTagIdsChange={onSelectedTagIdsChange}
        onCreateTag={onCreateTag}
        onRenameTag={onRenameTag}
        onDeleteTag={onDeleteTag}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "form.tagsPlaceholder" }),
    )
    await user.type(
      screen.getByPlaceholderText("form.tagsSearchPlaceholder"),
      "NewTag",
    )
    await user.click(screen.getByRole("button", { name: "form.tagsCreate" }))

    expect(onCreateTag).toHaveBeenCalledWith("NewTag")
    expect(onSelectedTagIdsChange).toHaveBeenCalledWith(["t-new"])
  })

  it("renames a tag inline", async () => {
    const user = userEvent.setup()

    const onSelectedTagIdsChange = vi.fn()
    const onCreateTag = vi.fn()
    const onRenameTag = vi.fn().mockResolvedValue({
      id: "t1",
      name: "Renamed",
      createdAt: 1,
      updatedAt: 2,
    } satisfies Tag)
    const onDeleteTag = vi.fn()

    render(
      <TagPicker
        tags={[{ id: "t1", name: "Work", createdAt: 1, updatedAt: 1 }]}
        selectedTagIds={["t1"]}
        onSelectedTagIdsChange={onSelectedTagIdsChange}
        onCreateTag={onCreateTag}
        onRenameTag={onRenameTag}
        onDeleteTag={onDeleteTag}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "form.tagsSelectedCount" }),
    )
    await user.click(screen.getByLabelText("form.tagsRename"))
    const input = screen.getByDisplayValue("Work")
    await user.clear(input)
    await user.type(input, "Renamed")
    await user.click(screen.getByLabelText("form.tagsRenameSave"))

    expect(onRenameTag).toHaveBeenCalledWith("t1", "Renamed")
  })

  it("deletes a tag and removes it from selection", async () => {
    const user = userEvent.setup()

    const onSelectedTagIdsChange = vi.fn()
    const onCreateTag = vi.fn()
    const onRenameTag = vi.fn()
    const onDeleteTag = vi.fn().mockResolvedValue({ updatedAccounts: 2 })

    render(
      <TagPicker
        tags={[{ id: "t1", name: "Work", createdAt: 1, updatedAt: 1 }]}
        selectedTagIds={["t1"]}
        onSelectedTagIdsChange={onSelectedTagIdsChange}
        onCreateTag={onCreateTag}
        onRenameTag={onRenameTag}
        onDeleteTag={onDeleteTag}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "form.tagsSelectedCount" }),
    )
    await user.click(screen.getByLabelText("form.tagsDelete"))
    expect(screen.getByText("form.tagsDeleteTitle")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "form.tagsDeleteConfirm" }),
    )

    expect(onDeleteTag).toHaveBeenCalledWith("t1")
    expect(onSelectedTagIdsChange).toHaveBeenCalledWith([])
  })
})
