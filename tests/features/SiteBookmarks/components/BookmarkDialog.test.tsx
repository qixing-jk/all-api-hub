import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~/tests/test-utils/render"
import type { SiteBookmark } from "~/types"

const loadAccountDataMock = vi.fn()

const {
  addBookmarkMock,
  updateBookmarkMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  addBookmarkMock: vi.fn().mockResolvedValue("bookmark-1"),
  updateBookmarkMock: vi.fn().mockResolvedValue(true),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock("~/services/accountStorage", () => ({
  accountStorage: {
    addBookmark: addBookmarkMock,
    updateBookmark: updateBookmarkMock,
  },
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    tags: [],
    createTag: vi.fn(),
    renameTag: vi.fn(),
    deleteTag: vi.fn(),
    loadAccountData: loadAccountDataMock,
  }),
}))

vi.mock("~/features/AccountManagement/components/TagPicker", () => ({
  TagPicker: () => <div data-testid="tag-picker" />,
}))

beforeEach(() => {
  vi.useRealTimers()
  addBookmarkMock.mockClear()
  updateBookmarkMock.mockClear()
  toastSuccessMock.mockClear()
  toastErrorMock.mockClear()
  loadAccountDataMock.mockReset()
})

describe("BookmarkDialog", () => {
  it("validates required fields before submitting", async () => {
    const onClose = vi.fn()
    const { default: BookmarkDialog } = await import(
      "~/features/SiteBookmarks/components/BookmarkDialog"
    )

    render(
      <BookmarkDialog
        isOpen={true}
        mode="add"
        bookmark={null}
        onClose={onClose}
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", { name: "bookmark:actions.add" }),
    )

    expect(
      await screen.findByText("bookmark:validation.nameRequired"),
    ).toBeInTheDocument()
    expect(
      await screen.findByText("bookmark:validation.urlRequired"),
    ).toBeInTheDocument()

    expect(addBookmarkMock).not.toHaveBeenCalled()
  })

  it("creates a bookmark in add mode", async () => {
    const onClose = vi.fn()
    const { default: BookmarkDialog } = await import(
      "~/features/SiteBookmarks/components/BookmarkDialog"
    )

    render(
      <BookmarkDialog
        isOpen={true}
        mode="add"
        bookmark={null}
        onClose={onClose}
      />,
    )

    fireEvent.change(
      await screen.findByPlaceholderText("bookmark:form.namePlaceholder"),
      { target: { value: "Docs" } },
    )

    const urlField = (
      await screen.findByText("bookmark:form.urlLabel")
    ).closest("div")
    if (!urlField) {
      throw new Error("Could not locate URL form field wrapper")
    }

    fireEvent.change(within(urlField).getByRole("textbox"), {
      target: { value: "https://example.com/docs" },
    })

    fireEvent.click(
      await screen.findByRole("button", { name: "bookmark:actions.add" }),
    )

    await waitFor(() => {
      expect(addBookmarkMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Docs",
          url: "https://example.com/docs",
          notes: "",
          tagIds: [],
        }),
      )
    })

    expect(loadAccountDataMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "messages:toast.success.bookmarkAdded",
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("updates a bookmark in edit mode", async () => {
    const onClose = vi.fn()
    const bookmark: SiteBookmark = {
      id: "b1",
      name: "Old",
      url: "https://example.com/old",
      tagIds: [],
      notes: "",
      created_at: 0,
      updated_at: 0,
    }

    const { default: BookmarkDialog } = await import(
      "~/features/SiteBookmarks/components/BookmarkDialog"
    )

    render(
      <BookmarkDialog
        isOpen={true}
        mode="edit"
        bookmark={bookmark}
        onClose={onClose}
      />,
    )

    fireEvent.change(
      await screen.findByPlaceholderText("bookmark:form.namePlaceholder"),
      { target: { value: "New" } },
    )

    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.save" }),
    )

    await waitFor(() => {
      expect(updateBookmarkMock).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({
          name: "New",
        }),
      )
    })

    expect(loadAccountDataMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "messages:toast.success.bookmarkUpdated",
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
