import { beforeEach, describe, expect, it, vi } from "vitest"

import BookmarkDialog from "~/features/SiteBookmarks/components/BookmarkDialog"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type { SiteBookmark } from "~/types"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const loadAccountDataMock = vi.fn()

const {
  addBookmarkMock,
  getActiveTabMock,
  getSiteNameMock,
  updateBookmarkMock,
  toastSuccessMock,
  toastErrorMock,
  trackProductAnalyticsActionCompletedMock,
  trackProductAnalyticsActionStartedMock,
} = vi.hoisted(() => ({
  addBookmarkMock: vi.fn().mockResolvedValue("bookmark-1"),
  getActiveTabMock: vi.fn(),
  getSiteNameMock: vi.fn(),
  updateBookmarkMock: vi.fn().mockResolvedValue(true),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  trackProductAnalyticsActionCompletedMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage", () => ({
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

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getActiveTab: getActiveTabMock,
  }
})

vi.mock("~/services/accounts/accountOperations", () => ({
  getSiteName: getSiteNameMock,
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

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: (...args: any[]) =>
    trackProductAnalyticsActionCompletedMock(...args),
  trackProductAnalyticsActionStarted: (...args: any[]) =>
    trackProductAnalyticsActionStartedMock(...args),
}))

const expectBookmarkActionTracked = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
  surfaceId: (typeof PRODUCT_ANALYTICS_SURFACE_IDS)[keyof typeof PRODUCT_ANALYTICS_SURFACE_IDS],
) => {
  expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BookmarkManagement,
    actionId,
    surfaceId,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

const expectBookmarkActionCompleted = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
  result: (typeof PRODUCT_ANALYTICS_RESULTS)[keyof typeof PRODUCT_ANALYTICS_RESULTS],
  options: {
    errorCategory?: (typeof PRODUCT_ANALYTICS_ERROR_CATEGORIES)[keyof typeof PRODUCT_ANALYTICS_ERROR_CATEGORIES]
  } = {},
) => {
  expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BookmarkManagement,
    actionId,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBookmarkManagementDialog,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    result,
    ...(options.errorCategory ? { errorCategory: options.errorCategory } : {}),
    durationMs: expect.any(Number),
  })
}

beforeEach(() => {
  vi.useRealTimers()
  addBookmarkMock.mockClear()
  getActiveTabMock.mockReset()
  getActiveTabMock.mockResolvedValue({
    title: "Current Admin",
    url: "https://example.com/console",
  })
  getSiteNameMock.mockReset()
  getSiteNameMock.mockResolvedValue("Current Admin")
  updateBookmarkMock.mockClear()
  toastSuccessMock.mockClear()
  toastErrorMock.mockClear()
  trackProductAnalyticsActionCompletedMock.mockReset()
  trackProductAnalyticsActionStartedMock.mockReset()
  loadAccountDataMock.mockReset()
})

const renderAddDialog = () =>
  render(
    <BookmarkDialog
      isOpen={true}
      mode="add"
      bookmark={null}
      onClose={vi.fn()}
    />,
  )

describe("BookmarkDialog", () => {
  it("validates required fields before submitting", async () => {
    const onClose = vi.fn()

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
    expect(trackProductAnalyticsActionCompletedMock).not.toHaveBeenCalled()
  })

  it("creates a bookmark in add mode", async () => {
    const onClose = vi.fn()

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

    fireEvent.change(
      await screen.findByPlaceholderText("bookmark:form.urlPlaceholder"),
      { target: { value: "https://example.com/docs" } },
    )

    fireEvent.click(
      await screen.findByRole("button", { name: "bookmark:actions.add" }),
    )

    expectBookmarkActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.CreateBookmark,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBookmarkManagementDialog,
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
    expectBookmarkActionCompleted(
      PRODUCT_ANALYTICS_ACTION_IDS.CreateBookmark,
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "messages:toast.success.bookmarkAdded",
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("fills name and url from the current page helper in add mode", async () => {
    renderAddDialog()

    fireEvent.click(
      await screen.findByRole("button", {
        name: "bookmark:dialog.useCurrentPage",
      }),
    )

    expectBookmarkActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.UseCurrentPageForBookmark,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBookmarkManagementDialog,
    )
    await waitFor(() => {
      expect(
        screen.getByDisplayValue("https://example.com/console"),
      ).toBeInTheDocument()
    })

    expect(screen.getByDisplayValue("Current Admin")).toBeInTheDocument()
    expect(getActiveTabMock).toHaveBeenCalledTimes(1)
    expect(getSiteNameMock).toHaveBeenCalledTimes(1)
  })

  it("does not show unavailable text while current page data is still loading", async () => {
    let resolveTab:
      | ((value: { title: string; url: string }) => void)
      | undefined

    getActiveTabMock.mockReturnValue(
      new Promise((resolve) => {
        resolveTab = resolve
      }),
    )

    renderAddDialog()

    await waitFor(() => {
      expect(getActiveTabMock).toHaveBeenCalledTimes(1)
    })
    expect(
      screen.queryByText("bookmark:dialog.currentPageUnavailable"),
    ).not.toBeInTheDocument()

    resolveTab?.({
      title: "Current Admin",
      url: "https://example.com/console",
    })

    await waitFor(() => {
      const useCurrentPageButton = screen.getByRole("button", {
        name: "bookmark:dialog.useCurrentPage",
      })
      expect(useCurrentPageButton).not.toBeDisabled()
    })
  })

  it("disables current page helper when no active tab url is available", async () => {
    getActiveTabMock.mockResolvedValue(null)

    renderAddDialog()

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "bookmark:dialog.useCurrentPage",
        }),
      ).toBeDisabled()
    })

    expect(getSiteNameMock).not.toHaveBeenCalled()
    expect(
      screen.getAllByText("bookmark:dialog.currentPageUnavailable"),
    ).toHaveLength(2)
  })

  it("disables current page helper for non-http urls", async () => {
    getActiveTabMock.mockResolvedValue({
      title: "Extension Page",
      url: "chrome-extension://abc/options.html",
    })

    renderAddDialog()

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "bookmark:dialog.useCurrentPage",
        }),
      ).toBeDisabled()
    })

    expect(getSiteNameMock).not.toHaveBeenCalled()
    expect(
      screen.getAllByText("bookmark:dialog.currentPageUnavailable"),
    ).toHaveLength(2)
  })

  it("keeps the dialog usable when current page lookup fails", async () => {
    getActiveTabMock.mockRejectedValue(new Error("permission denied"))

    renderAddDialog()

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "bookmark:dialog.useCurrentPage",
        }),
      ).toBeDisabled()
    })

    fireEvent.change(
      await screen.findByPlaceholderText("bookmark:form.namePlaceholder"),
      { target: { value: "Docs" } },
    )
    fireEvent.change(
      await screen.findByPlaceholderText("bookmark:form.urlPlaceholder"),
      { target: { value: "https://example.com/docs" } },
    )
    fireEvent.click(
      await screen.findByRole("button", { name: "bookmark:actions.add" }),
    )

    await waitFor(() => {
      expect(addBookmarkMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Docs",
          url: "https://example.com/docs",
        }),
      )
    })

    expect(getSiteNameMock).not.toHaveBeenCalled()
    expect(
      screen.queryByText("bookmark:validation.nameRequired"),
    ).not.toBeInTheDocument()
  })

  it("disables current page helper when site name resolution fails", async () => {
    getSiteNameMock.mockRejectedValue(new Error("tab title blocked"))

    renderAddDialog()

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "bookmark:dialog.useCurrentPage",
        }),
      ).toBeDisabled()
    })

    expect(getActiveTabMock).toHaveBeenCalledTimes(1)
    expect(getSiteNameMock).toHaveBeenCalledTimes(1)
    expect(
      screen.getAllByText("bookmark:dialog.currentPageUnavailable"),
    ).toHaveLength(2)
  })

  it("does not show current page helper in edit mode", async () => {
    const bookmark: SiteBookmark = {
      id: "b1",
      name: "Existing",
      url: "https://example.com/existing",
      tagIds: [],
      notes: "",
      created_at: 0,
      updated_at: 0,
    }

    render(
      <BookmarkDialog
        isOpen={true}
        mode="edit"
        bookmark={bookmark}
        onClose={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole("button", {
        name: "bookmark:dialog.useCurrentPage",
      }),
    ).not.toBeInTheDocument()
    expect(getActiveTabMock).not.toHaveBeenCalled()
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

    expectBookmarkActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.UpdateBookmark,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBookmarkManagementDialog,
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
    expectBookmarkActionCompleted(
      PRODUCT_ANALYTICS_ACTION_IDS.UpdateBookmark,
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "messages:toast.success.bookmarkUpdated",
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("tracks create completion failure when bookmark persistence rejects", async () => {
    addBookmarkMock.mockRejectedValue(new Error("storage unavailable"))
    const onClose = vi.fn()

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

    fireEvent.change(
      await screen.findByPlaceholderText("bookmark:form.urlPlaceholder"),
      { target: { value: "https://example.com/docs" } },
    )

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

    expectBookmarkActionCompleted(
      PRODUCT_ANALYTICS_ACTION_IDS.CreateBookmark,
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
    expect(loadAccountDataMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith(
      "messages:toast.error.operationFailed",
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it("tracks update completion failure when bookmark persistence returns false", async () => {
    updateBookmarkMock.mockResolvedValue(false)
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

    render(
      <BookmarkDialog
        isOpen={true}
        mode="edit"
        bookmark={bookmark}
        onClose={onClose}
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.save" }),
    )

    await waitFor(() => {
      expect(updateBookmarkMock).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({
          name: "Old",
          url: "https://example.com/old",
          notes: "",
          tagIds: [],
        }),
      )
    })

    expectBookmarkActionCompleted(
      PRODUCT_ANALYTICS_ACTION_IDS.UpdateBookmark,
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
    expect(loadAccountDataMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith(
      "messages:toast.error.operationFailed",
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it("tracks update completion failure when bookmark persistence rejects", async () => {
    updateBookmarkMock.mockRejectedValue(new Error("storage unavailable"))
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

    render(
      <BookmarkDialog
        isOpen={true}
        mode="edit"
        bookmark={bookmark}
        onClose={onClose}
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.save" }),
    )

    await waitFor(() => {
      expect(updateBookmarkMock).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({
          name: "Old",
          url: "https://example.com/old",
          notes: "",
          tagIds: [],
        }),
      )
    })

    expectBookmarkActionCompleted(
      PRODUCT_ANALYTICS_ACTION_IDS.UpdateBookmark,
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
    expect(loadAccountDataMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith(
      "messages:toast.error.operationFailed",
    )
    expect(onClose).not.toHaveBeenCalled()
  })
})
