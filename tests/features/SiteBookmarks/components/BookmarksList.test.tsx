import { beforeEach, describe, expect, it, vi } from "vitest"

import BookmarksList from "~/features/SiteBookmarks/components/BookmarksList"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~/tests/test-utils/render"
import type { SiteBookmark, Tag, TagStore } from "~/types"

let bookmarksMock: SiteBookmark[] = []
let pinnedAccountIdsMock: string[] = []
let orderedAccountIdsMock: string[] = []
let tagsMock: Tag[] = []
let tagStoreMock: TagStore = { version: 1, tagsById: {} }

const togglePinAccountMock = vi.fn()
const handleBookmarkReorderMock = vi.fn()
const loadAccountDataMock = vi.fn()

const {
  mockCreateTab,
  mockCloseIfPopup,
  mockDeleteBookmark,
  toastSuccessMock,
  toastErrorMock,
  clipboardWriteTextMock,
  openAddBookmarkMock,
  openEditBookmarkMock,
} = vi.hoisted(() => ({
  mockCreateTab: vi.fn().mockResolvedValue(undefined),
  mockCloseIfPopup: vi.fn(),
  mockDeleteBookmark: vi.fn().mockResolvedValue(true),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  clipboardWriteTextMock: vi.fn().mockResolvedValue(undefined),
  openAddBookmarkMock: vi.fn(),
  openEditBookmarkMock: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    deleteBookmark: mockDeleteBookmark,
  },
}))

vi.mock("~/utils/browserApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browserApi")>()
  return {
    ...actual,
    createTab: mockCreateTab,
  }
})

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()
  return {
    ...actual,
    closeIfPopup: mockCloseIfPopup,
  }
})

vi.mock("react-hot-toast", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock("~/hooks/useMediaQuery", () => ({
  useIsSmallScreen: () => false,
  useIsDesktop: () => false,
}))

vi.mock("@headlessui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@headlessui/react")>()
  return {
    ...actual,
    Menu: ({ as: Component = "div", children, ...props }: any) => (
      <Component {...props}>{children}</Component>
    ),
    MenuButton: ({ as: Component = "button", children, ...props }: any) => (
      <Component {...props}>{children}</Component>
    ),
    MenuItems: ({ as: Component = "div", children, ...props }: any) => (
      <Component {...props}>{children}</Component>
    ),
    MenuItem: ({ children, disabled }: any) =>
      typeof children === "function" ? (
        <>{children({ close: () => {}, disabled: Boolean(disabled) })}</>
      ) : (
        <>{children}</>
      ),
  }
})

// DnD-kit mocks keep the bookmark list UI renderable without simulating drag events.
vi.mock("@dnd-kit/core", () => ({
  closestCenter: vi.fn(),
  DndContext: ({ children }: { children: any }) => children,
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => [],
}))

vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: (array: any[], from: number, to: number) => {
    const next = array.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  },
  SortableContext: ({ children }: { children: any }) => children,
  verticalListSortingStrategy: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    bookmarks: bookmarksMock,
    pinnedAccountIds: pinnedAccountIdsMock,
    orderedAccountIds: orderedAccountIdsMock,
    tags: tagsMock,
    tagStore: tagStoreMock,
    isAccountPinned: (id: string) => pinnedAccountIdsMock.includes(id),
    togglePinAccount: togglePinAccountMock,
    handleBookmarkReorder: handleBookmarkReorderMock,
    loadAccountData: loadAccountDataMock,
  }),
}))

vi.mock("~/features/SiteBookmarks/hooks/BookmarkDialogStateContext", () => ({
  useBookmarkDialogContext: () => ({
    openAddBookmark: openAddBookmarkMock,
    openEditBookmark: openEditBookmarkMock,
  }),
}))

beforeEach(() => {
  vi.useRealTimers()
  bookmarksMock = []
  pinnedAccountIdsMock = []
  orderedAccountIdsMock = []
  tagsMock = []
  tagStoreMock = { version: 1, tagsById: {} }

  togglePinAccountMock.mockReset()
  handleBookmarkReorderMock.mockReset()
  loadAccountDataMock.mockReset()

  mockCreateTab.mockClear()
  mockCloseIfPopup.mockClear()
  mockDeleteBookmark.mockClear()
  toastSuccessMock.mockClear()
  toastErrorMock.mockClear()
  clipboardWriteTextMock.mockClear()
  openAddBookmarkMock.mockClear()
  openEditBookmarkMock.mockClear()

  Object.assign(navigator, {
    clipboard: {
      writeText: clipboardWriteTextMock,
    },
  })
})

describe("BookmarksList", () => {
  it("renders empty state and opens add bookmark dialog", async () => {
    render(<BookmarksList />)

    expect(await screen.findByText("bookmark:emptyState")).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("button", { name: "bookmark:addFirstBookmark" }),
    )

    expect(openAddBookmarkMock).toHaveBeenCalledTimes(1)
  })

  it("filters bookmarks by initialSearchQuery", async () => {
    const b1: SiteBookmark = {
      id: "b1",
      name: "Docs",
      url: "https://example.com/docs",
      tagIds: ["t1"],
      notes: "read me",
      created_at: 0,
      updated_at: 0,
    }
    const b2: SiteBookmark = {
      id: "b2",
      name: "Console",
      url: "https://example.com/admin",
      tagIds: ["t2"],
      notes: "",
      created_at: 0,
      updated_at: 0,
    }

    bookmarksMock = [b1, b2]
    tagsMock = [
      { id: "t1", name: "Tag One", createdAt: 0, updatedAt: 0 },
      { id: "t2", name: "Tag Two", createdAt: 0, updatedAt: 0 },
    ]
    tagStoreMock = {
      version: 1,
      tagsById: {
        t1: tagsMock[0],
        t2: tagsMock[1],
      },
    }

    render(<BookmarksList initialSearchQuery="docs" />)

    expect(await screen.findByText("Docs")).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText("Console")).not.toBeInTheDocument()
    })
  })

  it("filters bookmarks by selected tags", async () => {
    const b1: SiteBookmark = {
      id: "b1",
      name: "Docs",
      url: "https://example.com/docs",
      tagIds: ["t1"],
      notes: "read me",
      created_at: 0,
      updated_at: 0,
    }
    const b2: SiteBookmark = {
      id: "b2",
      name: "Console",
      url: "https://example.com/admin",
      tagIds: ["t2"],
      notes: "",
      created_at: 0,
      updated_at: 0,
    }

    bookmarksMock = [b1, b2]
    tagsMock = [
      { id: "t1", name: "Tag One", createdAt: 0, updatedAt: 0 },
      { id: "t2", name: "Tag Two", createdAt: 0, updatedAt: 0 },
    ]
    tagStoreMock = {
      version: 1,
      tagsById: {
        t1: tagsMock[0],
        t2: tagsMock[1],
      },
    }

    render(<BookmarksList />)

    expect(await screen.findByText("Docs")).toBeInTheDocument()
    expect(await screen.findByText("Console")).toBeInTheDocument()

    fireEvent.click(await screen.findByRole("button", { name: /Tag One/ }))

    await waitFor(() => {
      expect(screen.getByText("Docs")).toBeInTheDocument()
      expect(screen.queryByText("Console")).not.toBeInTheDocument()
    })
  })

  it("supports row actions (open/copy/edit)", async () => {
    const bookmark: SiteBookmark = {
      id: "b1",
      name: "Docs",
      url: "https://example.com/docs",
      tagIds: [],
      notes: "",
      created_at: 0,
      updated_at: 0,
    }

    bookmarksMock = [bookmark]
    togglePinAccountMock.mockResolvedValue(true)

    render(<BookmarksList />)

    fireEvent.click(
      await screen.findByRole("button", { name: "bookmark:actions.open" }),
    )

    await waitFor(() => {
      expect(mockCreateTab).toHaveBeenCalledWith(
        "https://example.com/docs",
        true,
      )
    })
    expect(mockCloseIfPopup).toHaveBeenCalledTimes(1)

    fireEvent.click(
      await screen.findByRole("button", { name: "bookmark:actions.copyUrl" }),
    )

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        "https://example.com/docs",
      )
    })
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "messages:toast.success.bookmarkUrlCopied",
    )

    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.edit" }),
    )
    expect(openEditBookmarkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "b1",
        name: "Docs",
        url: "https://example.com/docs",
      }),
    )
  })

  it("opens bookmark when clicking name or url", async () => {
    const bookmark: SiteBookmark = {
      id: "b1",
      name: "Docs",
      url: "https://example.com/docs",
      tagIds: [],
      notes: "",
      created_at: 0,
      updated_at: 0,
    }

    bookmarksMock = [bookmark]

    render(<BookmarksList />)

    fireEvent.click(await screen.findByRole("button", { name: "Docs" }))

    await waitFor(() => {
      expect(mockCreateTab).toHaveBeenCalledWith(
        "https://example.com/docs",
        true,
      )
    })
    expect(mockCloseIfPopup).toHaveBeenCalledTimes(1)

    mockCreateTab.mockClear()
    mockCloseIfPopup.mockClear()

    fireEvent.click(
      await screen.findByRole("button", { name: "https://example.com/docs" }),
    )

    await waitFor(() => {
      expect(mockCreateTab).toHaveBeenCalledWith(
        "https://example.com/docs",
        true,
      )
    })
    expect(mockCloseIfPopup).toHaveBeenCalledTimes(1)
  })

  it("shows drag handles only when not filtering", async () => {
    const bookmark: SiteBookmark = {
      id: "b1",
      name: "Docs",
      url: "https://example.com/docs",
      tagIds: [],
      notes: "",
      created_at: 0,
      updated_at: 0,
    }

    bookmarksMock = [bookmark]

    const { unmount } = render(<BookmarksList />)
    expect(
      await screen.findByRole("button", { name: "bookmark:list.dragHandle" }),
    ).toBeInTheDocument()

    unmount()

    render(<BookmarksList initialSearchQuery="docs" />)
    expect(
      screen.queryByRole("button", { name: "bookmark:list.dragHandle" }),
    ).not.toBeInTheDocument()
  })

  it("supports pin and delete actions", async () => {
    const bookmark: SiteBookmark = {
      id: "b1",
      name: "Docs",
      url: "https://example.com/docs",
      tagIds: [],
      notes: "",
      created_at: 0,
      updated_at: 0,
    }

    bookmarksMock = [bookmark]
    togglePinAccountMock.mockResolvedValue(true)
    loadAccountDataMock.mockResolvedValue(undefined)
    mockDeleteBookmark.mockResolvedValue(true)

    render(<BookmarksList />)

    // Pin
    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.more" }),
    )
    fireEvent.click(
      await screen.findByRole("button", { name: "bookmark:actions.pin" }),
    )

    expect(togglePinAccountMock).toHaveBeenCalledWith("b1")
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "messages:toast.success.bookmarkPinned",
      )
    })

    // Delete
    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.more" }),
    )
    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.delete" }),
    )

    const dialog = await screen.findByRole("dialog")
    fireEvent.click(
      await within(dialog).findByRole("button", {
        name: "common:actions.delete",
      }),
    )

    await waitFor(() => {
      expect(mockDeleteBookmark).toHaveBeenCalledWith("b1")
    })
    expect(loadAccountDataMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "messages:toast.success.bookmarkDeleted",
    )
  })
})
