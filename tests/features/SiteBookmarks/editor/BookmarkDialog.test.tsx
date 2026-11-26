import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import BookmarkDialog from "~/features/SiteBookmarks/editor/BookmarkDialog"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { SiteBookmark } from "~/types"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "~~/tests/test-utils/render"

const loadAccountDataMock = vi.fn()

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

const {
  addBookmarkMock,
  getActiveTabMock,
  getAllTabsMock,
  getSiteNameMock,
  updateBookmarkMock,
  toastSuccessMock,
  toastErrorMock,
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  trackProductAnalyticsActionStartedMock,
} = vi.hoisted(() => ({
  addBookmarkMock: vi.fn().mockResolvedValue("bookmark-1"),
  getActiveTabMock: vi.fn(),
  getAllTabsMock: vi.fn(),
  getSiteNameMock: vi.fn(),
  updateBookmarkMock: vi.fn().mockResolvedValue(true),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage/bookmarkRepository", () => ({
  bookmarkRepository: {
    addBookmark: addBookmarkMock,
    updateBookmark: updateBookmarkMock,
  },
}))

vi.mock("~/lib/notify", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock("~/utils/browser/tabs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser/tabs")>()
  return {
    ...actual,
    getActiveTab: getActiveTabMock,
    getAllTabs: getAllTabsMock,
  }
})

vi.mock("~/services/accounts/identity/siteName", () => ({
  getSiteName: getSiteNameMock,
}))

vi.mock("~/features/AccountManagement/data/AccountDataContext", () => ({
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
  startProductAnalyticsAction: (...args: any[]) =>
    startProductAnalyticsActionMock(...args),
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

const expectBookmarkActionStarted = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
  surfaceId: (typeof PRODUCT_ANALYTICS_SURFACE_IDS)[keyof typeof PRODUCT_ANALYTICS_SURFACE_IDS],
) => {
  expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BookmarkManagement,
    actionId,
    surfaceId,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

/**
 * A submit button must not carry the same action id as the span its handler
 * opens, otherwise a single attempt emits `feature_action_started` twice.
 */
const expectNoDeclarativeStart = (actionId: string) => {
  expect(trackProductAnalyticsActionStartedMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ actionId }),
  )
}

const expectBookmarkActionCompleted = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
  result: (typeof PRODUCT_ANALYTICS_RESULTS)[keyof typeof PRODUCT_ANALYTICS_RESULTS],
  options: {
    errorCategory?: (typeof PRODUCT_ANALYTICS_ERROR_CATEGORIES)[keyof typeof PRODUCT_ANALYTICS_ERROR_CATEGORIES]
  } = {},
) => {
  expectBookmarkActionStarted(
    actionId,
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBookmarkManagementDialog,
  )
  expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
    result,
    ...(options.errorCategory
      ? [{ errorCategory: options.errorCategory }]
      : []),
  )
}

beforeEach(() => {
  vi.useRealTimers()
  addBookmarkMock.mockClear()
  getActiveTabMock.mockReset()
  getAllTabsMock.mockReset().mockResolvedValue([])
  getActiveTabMock.mockResolvedValue({
    title: "Current Admin",
    url: "https://example.com/console",
  })
  getSiteNameMock.mockReset()
  getSiteNameMock.mockResolvedValue("Current Admin")
  updateBookmarkMock.mockClear()
  toastSuccessMock.mockClear()
  toastErrorMock.mockClear()
  startProductAnalyticsActionMock.mockReset()
  completeProductAnalyticsActionMock.mockReset()
  trackProductAnalyticsActionStartedMock.mockReset()
  startProductAnalyticsActionMock.mockReturnValue({
    complete: completeProductAnalyticsActionMock,
  })
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

/**
 * The dialog must release the user before the background account reload, so a
 * slow `loadAccountData()` cannot hold the modal open after a successful save.
 */
const expectDialogClosedBeforeReload = (onClose: ReturnType<typeof vi.fn>) => {
  const closeOrder = onClose.mock.invocationCallOrder[0]
  const reloadOrder = loadAccountDataMock.mock.invocationCallOrder[0]
  if (closeOrder === undefined || reloadOrder === undefined) {
    throw new Error("Expected both the close callback and the reload to run")
  }
  expect(closeOrder).toBeLessThan(reloadOrder)
}

describe("BookmarkDialog", () => {
  it.each([
    { title: "  Tab Guide  ", initialName: "  ", expectedName: "Tab Guide" },
    { title: "  ", initialName: "", expectedName: "docs.example" },
    { title: "Tab Guide", initialName: "My docs", expectedName: "My docs" },
  ])(
    "picks the full tab URL and saves it as $expectedName",
    async ({ title, initialName, expectedName }) => {
      const url = "https://docs.example:8443/guide?language=en#start"
      getAllTabsMock.mockResolvedValue([
        { url, title, favIconUrl: "https://docs.example/icon.png" },
      ])
      const user = userEvent.setup()
      renderAddDialog()

      const nameInput = await screen.findByPlaceholderText(
        "bookmark:form.namePlaceholder",
      )
      const submit = screen.getByRole("button", {
        name: "bookmark:actions.add",
      })
      await user.click(submit)
      expect(screen.getByText("bookmark:validation.nameRequired")).toBeVisible()
      expect(screen.getByText("bookmark:validation.urlRequired")).toBeVisible()
      fireEvent.change(nameInput, { target: { value: initialName } })
      await user.click(
        await screen.findByRole("button", {
          name: "bookmark:form.recentTabSites",
        }),
      )
      const option = await screen.findByRole("option", {
        name: /https:\/\/docs\.example:8443/,
      })
      expect(option.querySelector("img")).toHaveAttribute(
        "src",
        "https://docs.example/icon.png",
      )
      await user.click(option)

      expect(nameInput).toHaveValue(expectedName)
      expect(
        screen.getByRole("combobox", { name: /bookmark:form.urlLabel/ }),
      ).toHaveValue(url)
      expect(screen.queryByText("bookmark:validation.nameRequired")).toBeNull()
      expect(screen.queryByText("bookmark:validation.urlRequired")).toBeNull()
      await user.click(submit)
      await waitFor(() =>
        expect(addBookmarkMock).toHaveBeenCalledWith(
          expect.objectContaining({ name: expectedName, url }),
        ),
      )
    },
  )

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
    expect(completeProductAnalyticsActionMock).not.toHaveBeenCalled()
  })

  it("creates a bookmark in add mode", async () => {
    const onClose = vi.fn()
    const addDeferred = createDeferred<string>()
    addBookmarkMock.mockReturnValueOnce(addDeferred.promise)

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

    const creatingButton = screen.getByRole("button", {
      name: "common:status.creating",
    })
    expect(creatingButton).toHaveAttribute("aria-busy", "true")
    expect(creatingButton).toBeDisabled()
    const cancelButton = screen.getByRole("button", {
      name: "common:actions.cancel",
    })
    expect(cancelButton).toBeDisabled()
    expect(cancelButton).not.toHaveAttribute("aria-busy")

    fireEvent.click(creatingButton)
    expect(addBookmarkMock).toHaveBeenCalledTimes(1)

    expectBookmarkActionStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.CreateBookmark,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBookmarkManagementDialog,
    )
    expectNoDeclarativeStart(PRODUCT_ANALYTICS_ACTION_IDS.CreateBookmark)
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

    await act(async () => {
      addDeferred.resolve("bookmark-1")
    })

    await waitFor(() => {
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
    expectDialogClosedBeforeReload(onClose)
  })

  it("fills name and url from the current page helper in add mode", async () => {
    renderAddDialog()

    const useCurrentPageButton = await screen.findByRole("button", {
      name: "bookmark:dialog.useCurrentPage",
    })
    await waitFor(() => expect(useCurrentPageButton).toBeEnabled())
    fireEvent.click(useCurrentPageButton)

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

  it("lets bookmarks use the current page or choose another page on the same site", async () => {
    const user = userEvent.setup()
    const otherUrl = "https://example.com/guide?view=full#setup"
    getAllTabsMock.mockResolvedValue([
      {
        title: "Current Admin",
        url: "https://example.com/console",
        lastAccessed: 2,
      },
      { title: "Guide", url: otherUrl, lastAccessed: 1 },
    ])
    renderAddDialog()

    const chooser = await screen.findByRole("button", {
      name: "bookmark:form.recentTabSites",
    })
    const currentPage = screen.getByRole("button", {
      name: "bookmark:dialog.useCurrentPage",
    })
    await waitFor(() => expect(currentPage).toBeEnabled())
    await user.click(currentPage)
    const url = screen.getByRole("combobox", {
      name: /^bookmark:form.urlLabel/,
    })
    expect(url).toHaveValue("https://example.com/console")

    await user.click(chooser)
    await user.click(
      await screen.findByRole("option", { name: `Guide — ${otherUrl}` }),
    )
    expect(url).toHaveValue(otherUrl)
    expect(screen.getByDisplayValue("Current Admin")).toBeInTheDocument()

    await user.click(currentPage)
    expect(url).toHaveValue("https://example.com/console")
  })

  it("does not show unavailable text while current page data is still loading", async () => {
    let resolveTab:
      ((value: { title: string; url: string }) => void) | undefined

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
    expect(
      screen.getByRole("button", { name: "bookmark:dialog.useCurrentPage" }),
    ).toHaveAttribute("aria-busy", "true")

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
      await screen.findAllByText("bookmark:dialog.currentPageUnavailable"),
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
      await screen.findAllByText("bookmark:dialog.currentPageUnavailable"),
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
      await screen.findAllByText("bookmark:dialog.currentPageUnavailable"),
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
    const updateDeferred = createDeferred<boolean>()
    updateBookmarkMock.mockReturnValueOnce(updateDeferred.promise)
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

    const savingButton = screen.getByRole("button", {
      name: "common:status.saving",
    })
    expect(savingButton).toHaveAttribute("aria-busy", "true")
    expect(savingButton).toBeDisabled()
    const cancelButton = screen.getByRole("button", {
      name: "common:actions.cancel",
    })
    expect(cancelButton).toBeDisabled()
    expect(cancelButton).not.toHaveAttribute("aria-busy")

    fireEvent.click(savingButton)
    expect(updateBookmarkMock).toHaveBeenCalledTimes(1)

    expectBookmarkActionStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.UpdateBookmark,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBookmarkManagementDialog,
    )
    expectNoDeclarativeStart(PRODUCT_ANALYTICS_ACTION_IDS.UpdateBookmark)
    await waitFor(() => {
      expect(updateBookmarkMock).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({
          name: "New",
        }),
      )
    })

    await act(async () => {
      updateDeferred.resolve(true)
    })

    await waitFor(() => {
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
    expectDialogClosedBeforeReload(onClose)
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
