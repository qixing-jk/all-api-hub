import { act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import BookmarkAccountImportDialog from "~/features/AccountManagement/components/BookmarkAccountImportDialog"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import enUiLocale from "~/locales/en/ui.json"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const {
  ensurePermissionsDetailedMock,
  getBrowserBookmarkTreeMock,
  runBookmarkAccountImportMock,
  loadAccountDataMock,
  openAddAccountMock,
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  accounts,
} = vi.hoisted(() => ({
  ensurePermissionsDetailedMock: vi.fn(),
  getBrowserBookmarkTreeMock: vi.fn(),
  runBookmarkAccountImportMock: vi.fn(),
  loadAccountDataMock: vi.fn(),
  openAddAccountMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  accounts: [] as ReturnType<typeof buildSiteAccount>[],
}))

vi.mock("~/services/permissions/permissionManager", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/permissions/permissionManager")
    >()
  return {
    ...actual,
    ensurePermissionsDetailed: (...args: unknown[]) =>
      ensurePermissionsDetailedMock(...args),
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getBrowserBookmarkTree: (...args: unknown[]) =>
      getBrowserBookmarkTreeMock(...args),
  }
})

vi.mock(
  "~/features/AccountManagement/bookmarkImport/importAccounts",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/features/AccountManagement/bookmarkImport/importAccounts")
      >()
    return {
      ...actual,
      runBookmarkAccountImport: (...args: unknown[]) =>
        runBookmarkAccountImportMock(...args),
    }
  },
)

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    accounts,
    loadAccountData: loadAccountDataMock,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openAddAccount: openAddAccountMock,
  }),
}))

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/actions")>()
  return {
    ...actual,
    startProductAnalyticsAction: (...args: unknown[]) =>
      startProductAnalyticsActionMock(...args),
  }
})

function renderDialog() {
  return render(
    <BookmarkAccountImportDialog isOpen={true} onClose={vi.fn()} />,
    {
      withReleaseUpdateStatusProvider: false,
    },
  )
}

async function selectAllBookmarkScopes(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    await screen.findByRole("button", {
      name: /Select all|ui:dialog\.bookmarkAccountImport\.actions\.selectAll/,
    }),
  )
}

async function allowBookmarksAndScanSelected(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    await screen.findByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
    ),
  )
  await selectAllBookmarkScopes(user)
  await user.click(
    await screen.findByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton,
    ),
  )
}

function bookmarkTreeWith(urls: string[]) {
  return [
    {
      id: "root",
      title: "Root",
      children: urls.map((url, index) => ({
        id: `node-${index}`,
        title: `Bookmark ${index}`,
        url,
      })),
    },
  ]
}

function bookmarkTreeWithFolders() {
  return [
    {
      id: "root",
      title: "Root",
      children: [
        {
          id: "folder-primary",
          title: "Primary folder",
          children: [
            {
              id: "primary-bookmark",
              title: "Primary bookmark",
              url: "https://primary.example.invalid/dashboard",
            },
          ],
        },
        {
          id: "folder-secondary",
          title: "Secondary folder",
          children: [
            {
              id: "secondary-bookmark",
              title: "Secondary bookmark",
              url: "https://secondary.example.invalid/dashboard",
            },
          ],
        },
      ],
    },
  ]
}

function bookmarkTreeWithNestedFolders() {
  return [
    {
      id: "root",
      title: "Bookmarks Bar",
      children: [
        {
          id: "folder-work",
          title: "Work",
          children: [
            {
              id: "work-relay",
              title: "Work relay",
              url: "https://work.example.invalid/dashboard",
            },
          ],
        },
        {
          id: "folder-personal",
          title: "Personal",
          children: [
            {
              id: "personal-docs",
              title: "Personal docs",
              url: "https://docs.example.invalid/",
            },
          ],
        },
      ],
    },
  ]
}

function bookmarkTreeWithFolderOnlySearchMatch() {
  return [
    {
      id: "root",
      title: "Bookmarks Bar",
      children: [
        {
          id: "folder-matched",
          title: "Matched folder",
          children: [
            {
              id: "hidden-bookmark",
              title: "Hidden relay",
              url: "https://hidden.example.invalid/dashboard",
            },
          ],
        },
      ],
    },
  ]
}

describe("BookmarkAccountImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    accounts.splice(0)
    ensurePermissionsDetailedMock.mockResolvedValue({
      success: true,
      results: [],
      requestedResults: [],
    })
    getBrowserBookmarkTreeMock.mockResolvedValue({
      success: true,
      tree: bookmarkTreeWith([
        "https://existing.example.invalid/dashboard",
        "https://new.example.invalid/path",
      ]),
    })
    runBookmarkAccountImportMock.mockResolvedValue({
      rows: [
        {
          candidateId: "bookmark-import:https://new.example.invalid",
          url: "https://new.example.invalid",
          status: "success",
          accountId: "account-new",
        },
      ],
      successCount: 1,
      failureCount: 0,
      skippedCount: 0,
    })
    loadAccountDataMock.mockResolvedValue(undefined)
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
  })

  it("explains the batch-import workflow before requesting bookmark access", async () => {
    testI18n.addResourceBundle("en", "ui", enUiLocale, true, true)

    try {
      renderDialog()

      expect(
        await screen.findByText(
          /Batch scan browser bookmarks and turn saved relay sites into account candidates/,
        ),
      ).toBeVisible()
      expect(screen.getByText("Choose bookmark folders")).toBeVisible()
      expect(screen.getByText("Review import candidates")).toBeVisible()
      expect(
        screen.getByText("Skip existing accounts by default"),
      ).toBeVisible()
      expect(
        screen.getByRole("button", {
          name: "Choose bookmarks and start batch import",
        }),
      ).toBeEnabled()
    } finally {
      testI18n.removeResourceBundle("en", "ui")
    }
  })

  it("uses grammar-safe duplicate status copy for any saved account count", () => {
    const duplicateStatus =
      enUiLocale.dialog.bookmarkAccountImport.status.duplicate_other

    expect(duplicateStatus.replace("{{count}}", "1")).toBe(
      "Skipped by default. Existing saved-account match count: 1",
    )
    expect(duplicateStatus.replace("{{count}}", "2")).toBe(
      "Skipped by default. Existing saved-account match count: 2",
    )
  })

  it("renders the selected import count in the primary action", async () => {
    const user = userEvent.setup()
    testI18n.addResourceBundle("en", "ui", enUiLocale, true, true)

    try {
      renderDialog()

      await allowBookmarksAndScanSelected(user)

      expect(
        await screen.findByRole("button", { name: "Import selected (2)" }),
      ).toBeEnabled()
    } finally {
      testI18n.removeResourceBundle("en", "ui")
    }
  })

  it("uses count interpolation for count-dependent import labels", async () => {
    const user = userEvent.setup()
    testI18n.addResourceBundle(
      "en",
      "ui",
      {
        dialog: {
          bookmarkAccountImport: {
            ...enUiLocale.dialog.bookmarkAccountImport,
            actions: {
              ...enUiLocale.dialog.bookmarkAccountImport.actions,
              importSelected_one: "Import selected count={{count}}",
              importSelected_other: "Import selected count={{count}}",
            },
            status: {
              ...enUiLocale.dialog.bookmarkAccountImport.status,
              duplicate_one: "Duplicate count={{count}}",
              duplicate_other: "Duplicate count={{count}}",
            },
          },
        },
      },
      true,
      true,
    )
    accounts.push(
      buildSiteAccount({
        id: "account-existing",
        site_url: "https://existing.example.invalid/settings",
      }),
    )

    try {
      renderDialog()

      await allowBookmarksAndScanSelected(user)

      expect(
        await screen.findByRole("button", {
          name: "Import selected count=1",
        }),
      ).toBeEnabled()
      expect(screen.getByText("Duplicate count=1")).toBeInTheDocument()
    } finally {
      testI18n.removeResourceBundle("en", "ui")
    }
  })

  it("does not select bookmark scopes by default after reading bookmarks", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWithFolders(),
    })

    renderDialog()

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )

    expect(await screen.findByText("Primary folder")).toBeVisible()
    expect(
      screen.getByTestId(
        `${ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeCheckbox}-folder-primary`,
      ),
    ).toHaveAttribute("aria-checked", "false")
    expect(
      screen.getByTestId(
        `${ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeCheckbox}-folder-secondary`,
      ),
    ).toHaveAttribute("aria-checked", "false")
    expect(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton,
      ),
    ).toBeDisabled()
  })

  it("scans only the bookmark folders selected by the user", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWithFolders(),
    })

    renderDialog()

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )

    await screen.findByText("Primary folder")
    await user.click(
      screen.getByTestId(
        `${ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeCheckbox}-folder-secondary`,
      ),
    )
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton,
      ),
    )

    expect(
      await screen.findByText("https://secondary.example.invalid"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("https://primary.example.invalid"),
    ).not.toBeInTheDocument()
  })

  it("shows bookmark scope details before scanning", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWithFolders(),
    })
    testI18n.addResourceBundle("en", "ui", enUiLocale, true, true)

    try {
      renderDialog()

      await user.click(
        await screen.findByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
        ),
      )

      expect(await screen.findByText("Primary folder")).toBeVisible()
      expect(screen.getAllByText("1 bookmark")[0]).toBeVisible()
      await user.click(
        screen.getAllByRole("button", { name: "Expand folder" })[0],
      )
      const bookmarkTitle = screen.getByText("Primary bookmark")
      const bookmarkSource = screen.getByText(
        "primary.example.invalid/dashboard",
      )
      expect(bookmarkSource).toBeVisible()
      expect(bookmarkTitle.parentElement).toContainElement(bookmarkSource)
      expect(
        screen.queryByText("https://primary.example.invalid/dashboard"),
      ).not.toBeInTheDocument()
    } finally {
      testI18n.removeResourceBundle("en", "ui")
    }
  })

  it("shows the selected bookmark count before scanning", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWithFolders(),
    })
    testI18n.addResourceBundle("en", "ui", enUiLocale, true, true)

    try {
      renderDialog()

      await user.click(
        await screen.findByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
        ),
      )

      expect(await screen.findByText("0 bookmarks selected")).toBeVisible()

      await user.click(
        screen.getByTestId(
          `${ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeCheckbox}-folder-primary`,
        ),
      )
      expect(screen.getByText("1 bookmark selected")).toBeVisible()

      await user.click(
        screen.getByTestId(
          `${ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeCheckbox}-folder-secondary`,
        ),
      )
      expect(screen.getByText("2 bookmarks selected")).toBeVisible()
    } finally {
      testI18n.removeResourceBundle("en", "ui")
    }
  })

  it("returns from preview to scope selection and rescans the adjusted bookmark selection", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWithFolders(),
    })
    testI18n.addResourceBundle("en", "ui", enUiLocale, true, true)

    try {
      renderDialog()

      await user.click(
        await screen.findByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
        ),
      )
      await user.click(
        screen.getByTestId(
          `${ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeCheckbox}-folder-primary`,
        ),
      )
      await user.click(
        screen.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton,
        ),
      )

      expect(
        await screen.findByText("https://primary.example.invalid"),
      ).toBeInTheDocument()
      expect(
        screen.queryByText("https://secondary.example.invalid"),
      ).not.toBeInTheDocument()

      await user.click(
        screen.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportBackToScopeButton,
        ),
      )

      expect(await screen.findByText("Primary folder")).toBeVisible()
      expect(screen.getByText("1 bookmark selected")).toBeVisible()
      await user.click(
        screen.getByTestId(
          `${ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeCheckbox}-folder-primary`,
        ),
      )
      await user.click(
        screen.getByTestId(
          `${ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeCheckbox}-folder-secondary`,
        ),
      )
      await user.click(
        screen.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton,
        ),
      )

      expect(
        await screen.findByText("https://secondary.example.invalid"),
      ).toBeInTheDocument()
      expect(
        screen.queryByText("https://primary.example.invalid"),
      ).not.toBeInTheDocument()
    } finally {
      testI18n.removeResourceBundle("en", "ui")
    }
  })

  it("sizes the bookmark scope tree from the available dialog space", async () => {
    const user = userEvent.setup()
    const originalResizeObserver = globalThis.ResizeObserver
    const observers: Array<{
      trigger: (height: number) => void
    }> = []

    class MockResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {
        observers.push({
          trigger: (height: number) => {
            this.callback(
              [
                {
                  contentRect: { height },
                } as ResizeObserverEntry,
              ],
              this as ResizeObserver,
            )
          },
        })
      }

      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver)

    try {
      getBrowserBookmarkTreeMock.mockResolvedValueOnce({
        success: true,
        tree: bookmarkTreeWithFolders(),
      })

      renderDialog()

      await user.click(
        await screen.findByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
        ),
      )

      const tree = await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeTree,
      )
      act(() => {
        observers.at(-1)?.trigger(512)
      })

      await waitFor(() => {
        expect(tree).toHaveStyle({ height: "512px" })
      })
    } finally {
      vi.stubGlobal("ResizeObserver", originalResizeObserver)
    }
  })

  it("filters the bookmark scope tree by folder title and bookmark source", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWithNestedFolders(),
    })
    testI18n.addResourceBundle("en", "ui", enUiLocale, true, true)

    try {
      renderDialog()

      await user.click(
        await screen.findByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
        ),
      )
      await user.type(
        await screen.findByPlaceholderText("Search bookmarks..."),
        "work",
      )

      expect(await screen.findByText("Work")).toBeVisible()
      expect(screen.getByText("Work relay")).toBeVisible()
      expect(screen.queryByText("Personal")).not.toBeInTheDocument()

      await user.clear(screen.getByPlaceholderText("Search bookmarks..."))
      await user.type(
        screen.getByPlaceholderText("Search bookmarks..."),
        "docs.example.invalid",
      )

      expect(await screen.findByText("Personal")).toBeVisible()
      expect(screen.getByText("Personal docs")).toBeVisible()
      expect(screen.queryByText("Work relay")).not.toBeInTheDocument()
    } finally {
      testI18n.removeResourceBundle("en", "ui")
    }
  })

  it("shows an empty bookmark scope search state when nothing matches", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWithNestedFolders(),
    })
    testI18n.addResourceBundle("en", "ui", enUiLocale, true, true)

    try {
      renderDialog()

      await user.click(
        await screen.findByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
        ),
      )
      await user.type(
        await screen.findByPlaceholderText("Search bookmarks..."),
        "missing",
      )

      expect(
        await screen.findByText("No matching bookmark scopes"),
      ).toBeVisible()
      expect(screen.queryByText("Work relay")).not.toBeInTheDocument()
    } finally {
      testI18n.removeResourceBundle("en", "ui")
    }
  })

  it("keeps nested bookmark folders collapsed until the user expands them", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWithNestedFolders(),
    })
    testI18n.addResourceBundle("en", "ui", enUiLocale, true, true)

    try {
      renderDialog()

      await user.click(
        await screen.findByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
        ),
      )

      expect(await screen.findByText("Work")).toBeVisible()
      expect(screen.queryByText("Work relay")).not.toBeInTheDocument()

      await user.click(
        screen.getAllByRole("button", { name: "Expand folder" })[0],
      )
      expect(await screen.findByText("Work relay")).toBeVisible()
    } finally {
      testI18n.removeResourceBundle("en", "ui")
    }
  })

  it("updates selection for the visible bookmark scope search results", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWithNestedFolders(),
    })
    testI18n.addResourceBundle("en", "ui", enUiLocale, true, true)

    try {
      renderDialog()

      await user.click(
        await screen.findByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
        ),
      )
      await user.type(
        await screen.findByPlaceholderText("Search bookmarks..."),
        "work",
      )

      const workCheckbox = screen.getByTestId(
        `${ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeCheckbox}-work-relay`,
      )
      expect(workCheckbox).toHaveAttribute("aria-checked", "false")

      await user.click(screen.getByRole("button", { name: "Select all" }))
      expect(workCheckbox).toHaveAttribute("aria-checked", "true")

      await user.click(screen.getByRole("button", { name: "Clear selected" }))
      expect(workCheckbox).toHaveAttribute("aria-checked", "false")

      await user.click(screen.getByRole("button", { name: "Invert selected" }))
      expect(workCheckbox).toHaveAttribute("aria-checked", "true")

      await user.clear(screen.getByPlaceholderText("Search bookmarks..."))
      await user.click(screen.getByRole("button", { name: "Expand all" }))
      expect(
        screen.getByTestId(
          `${ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeCheckbox}-personal-docs`,
        ),
      ).toHaveAttribute("aria-checked", "true")

      await user.click(screen.getByRole("button", { name: "Clear selected" }))
      expect(
        screen.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton,
        ),
      ).toBeDisabled()

      await user.click(screen.getByRole("button", { name: "Select all" }))
      expect(
        screen.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton,
        ),
      ).toBeEnabled()
      await user.click(
        screen.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton,
        ),
      )

      expect(
        await screen.findByText("https://work.example.invalid"),
      ).toBeInTheDocument()
      expect(
        screen.getByText("https://docs.example.invalid"),
      ).toBeInTheDocument()
    } finally {
      testI18n.removeResourceBundle("en", "ui")
    }
  })

  it("normalizes filtered bulk folder selection to hidden descendants before scanning", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWithFolderOnlySearchMatch(),
    })
    testI18n.addResourceBundle("en", "ui", enUiLocale, true, true)

    try {
      renderDialog()

      await user.click(
        await screen.findByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
        ),
      )
      await user.type(
        await screen.findByPlaceholderText("Search bookmarks..."),
        "matched",
      )

      expect(await screen.findByText("Matched folder")).toBeVisible()
      expect(screen.queryByText("Hidden relay")).not.toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: "Select all" }))
      await user.clear(screen.getByPlaceholderText("Search bookmarks..."))
      await user.click(screen.getByRole("button", { name: "Expand all" }))

      expect(
        screen.getByTestId(
          `${ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeCheckbox}-hidden-bookmark`,
        ),
      ).toHaveAttribute("aria-checked", "true")

      await user.click(
        screen.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton,
        ),
      )

      expect(
        await screen.findByText("https://hidden.example.invalid"),
      ).toBeInTheDocument()
    } finally {
      testI18n.removeResourceBundle("en", "ui")
    }
  })

  it("uses a single clear control for bookmark scope search", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWithNestedFolders(),
    })
    testI18n.addResourceBundle("en", "ui", enUiLocale, true, true)

    try {
      renderDialog()

      await user.click(
        await screen.findByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
        ),
      )

      const searchInput = await screen.findByPlaceholderText(
        "Search bookmarks...",
      )
      expect(searchInput).toHaveAttribute("type", "text")
    } finally {
      testI18n.removeResourceBundle("en", "ui")
    }
  })

  it("collapses and expands the full bookmark scope tree", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWithNestedFolders(),
    })
    testI18n.addResourceBundle("en", "ui", enUiLocale, true, true)

    try {
      renderDialog()

      await user.click(
        await screen.findByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
        ),
      )

      expect(await screen.findByText("Work")).toBeVisible()
      expect(screen.queryByText("Work relay")).not.toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: "Expand all" }))
      expect(await screen.findByText("Work relay")).toBeVisible()

      await user.click(screen.getByRole("button", { name: "Collapse all" }))
      expect(screen.queryByText("Work relay")).not.toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: "Expand all" }))
      expect(await screen.findByText("Work relay")).toBeVisible()
    } finally {
      testI18n.removeResourceBundle("en", "ui")
    }
  })

  it("requests bookmarks permission, scans candidates, skips duplicates by default, imports selected rows, and reloads account data", async () => {
    const user = userEvent.setup()
    accounts.push(
      buildSiteAccount({
        id: "account-existing",
        site_url: "https://existing.example.invalid/settings",
      }),
    )

    renderDialog()

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )

    await waitFor(() => {
      expect(ensurePermissionsDetailedMock).toHaveBeenCalledWith(["bookmarks"])
    })
    expect(getBrowserBookmarkTreeMock).toHaveBeenCalledTimes(1)
    await selectAllBookmarkScopes(user)
    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton,
      ),
    )
    expect(
      await screen.findByText("https://new.example.invalid"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("https://existing.example.invalid"),
    ).toBeInTheDocument()

    const rows = screen.getAllByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportCandidateRow,
    )
    expect(rows).toHaveLength(2)
    expect(
      within(
        rows.find((row) =>
          row.textContent?.includes("https://existing.example.invalid"),
        ) ?? rows[0],
      ).getByText("ui:dialog.bookmarkAccountImport.status.duplicate"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportImportButton,
      ),
    )

    await waitFor(() => {
      expect(runBookmarkAccountImportMock).toHaveBeenCalledTimes(1)
    })
    expect(runBookmarkAccountImportMock.mock.calls[0][0].candidates).toEqual([
      expect.objectContaining({
        id: "bookmark-import:https://new.example.invalid",
        url: "https://new.example.invalid",
        status: "ready",
      }),
    ])
    await waitFor(() => {
      expect(loadAccountDataMock).toHaveBeenCalledTimes(1)
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenLastCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({
        insights: expect.objectContaining({
          itemCount: 2,
          selectedCount: 1,
          successCount: 1,
          failureCount: 0,
          skippedCount: 0,
          readyCount: 1,
          blockedCount: 1,
        }),
      }),
    )
    expect(
      await screen.findByText("ui:dialog.bookmarkAccountImport.resultSummary"),
    ).toBeInTheDocument()
  })

  it("includes duplicate origins when include-existing override is enabled", async () => {
    const user = userEvent.setup()
    accounts.push(
      buildSiteAccount({
        id: "account-existing",
        site_url: "https://existing.example.invalid/settings",
      }),
    )

    renderDialog()

    await allowBookmarksAndScanSelected(user)
    await screen.findByText("https://new.example.invalid")

    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportIncludeExistingCheckbox,
      ),
    )
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportImportButton,
      ),
    )

    await waitFor(() => {
      expect(runBookmarkAccountImportMock).toHaveBeenCalledTimes(1)
    })
    expect(
      runBookmarkAccountImportMock.mock.calls[0][0].candidates.map(
        (candidate: { url: string }) => candidate.url,
      ),
    ).toEqual([
      "https://existing.example.invalid",
      "https://new.example.invalid",
    ])
  })

  it("toggles ready and duplicate candidates according to include-existing state", async () => {
    const user = userEvent.setup()
    accounts.push(
      buildSiteAccount({
        id: "account-existing",
        site_url: "https://existing.example.invalid/settings",
      }),
    )

    renderDialog()

    await allowBookmarksAndScanSelected(user)

    const readyCheckbox = await screen.findByRole("checkbox", {
      name: "https://new.example.invalid",
    })
    const duplicateCheckbox = screen.getByRole("checkbox", {
      name: "https://existing.example.invalid",
    })

    expect(readyCheckbox).toBeChecked()
    expect(duplicateCheckbox).toBeDisabled()

    await user.click(readyCheckbox)
    expect(readyCheckbox).not.toBeChecked()

    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportIncludeExistingCheckbox,
      ),
    )
    expect(duplicateCheckbox).toBeChecked()

    await user.click(duplicateCheckbox)
    expect(duplicateCheckbox).not.toBeChecked()

    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportIncludeExistingCheckbox,
      ),
    )
    expect(duplicateCheckbox).toBeDisabled()
    expect(duplicateCheckbox).not.toBeChecked()
  })

  it("recovers from permission denial and completes analytics as a permission failure", async () => {
    const user = userEvent.setup()
    ensurePermissionsDetailedMock.mockResolvedValueOnce({
      success: false,
      results: [],
      requestedResults: [],
    })

    renderDialog()

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )

    expect(
      await screen.findByText(
        "ui:dialog.bookmarkAccountImport.permissionDenied",
      ),
    ).toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
        insights: expect.objectContaining({
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionDenied,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Permission,
        }),
      }),
    )

    ensurePermissionsDetailedMock.mockResolvedValueOnce({
      success: true,
      results: [],
      requestedResults: [],
    })

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )
    await selectAllBookmarkScopes(user)
    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton,
      ),
    )

    expect(
      await screen.findByText("https://new.example.invalid"),
    ).toBeInTheDocument()
    expect(ensurePermissionsDetailedMock).toHaveBeenCalledTimes(2)
  })

  it("shows the unsupported browser fallback when bookmarks cannot be read", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: false,
      reason: "unavailable",
    })

    renderDialog()

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )

    expect(
      await screen.findByText("ui:dialog.bookmarkAccountImport.apiUnavailable"),
    ).toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
        insights: expect.objectContaining({
          failureReason:
            PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionUnavailable,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
        }),
      }),
    )
  })

  it("reports browser bookmark read failures separately from unsupported APIs", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: false,
      reason: "read-failed",
    })

    renderDialog()

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )

    expect(
      await screen.findByText("ui:dialog.bookmarkAccountImport.readFailed"),
    ).toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: expect.objectContaining({
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.StorageReadFailed,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
        }),
      }),
    )
  })

  it("settles unexpected bookmark read exceptions as read failures", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockRejectedValueOnce(new Error("read failed"))

    renderDialog()

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )

    expect(
      await screen.findByText("ui:dialog.bookmarkAccountImport.readFailed"),
    ).toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: expect.objectContaining({
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
        }),
      }),
    )
  })

  it("keeps the dialog recoverable when bookmark storage is empty", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: [],
    })

    renderDialog()

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )

    expect(
      await screen.findByText("ui:dialog.bookmarkAccountImport.empty"),
    ).toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        insights: expect.objectContaining({
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.EmptyResponse,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Response,
        }),
      }),
    )
  })

  it("reports selected bookmark scopes that contain no importable account sites", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWith(["mailto:owner@example.invalid"]),
    })

    renderDialog()

    await allowBookmarksAndScanSelected(user)

    expect(
      await screen.findByText("ui:dialog.bookmarkAccountImport.noCandidates"),
    ).toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
        insights: expect.objectContaining({
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.UnsupportedTarget,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
        }),
      }),
    )
  })

  it("keeps import results visible when account data reload fails", async () => {
    const user = userEvent.setup()
    loadAccountDataMock.mockRejectedValueOnce(new Error("reload failed"))

    renderDialog()

    await allowBookmarksAndScanSelected(user)
    await screen.findByText("https://new.example.invalid")
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportImportButton,
      ),
    )

    expect(
      await screen.findByText("ui:dialog.bookmarkAccountImport.reloadFailed"),
    ).toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        insights: expect.objectContaining({
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.StorageReadFailed,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
        }),
      }),
    )
  })

  it("exposes Add Account recovery actions for failed imports", async () => {
    const user = userEvent.setup()
    getBrowserBookmarkTreeMock.mockResolvedValueOnce({
      success: true,
      tree: bookmarkTreeWith(["https://failed.example.invalid/path"]),
    })
    runBookmarkAccountImportMock.mockResolvedValueOnce({
      rows: [
        {
          candidateId: "bookmark-import:https://failed.example.invalid",
          url: "https://failed.example.invalid",
          status: "failed",
          failureCategory: "detection",
          safeMessageKey: "ui:dialog.bookmarkAccountImport.failures.detection",
        },
      ],
      successCount: 0,
      failureCount: 1,
      skippedCount: 0,
    })

    renderDialog()

    await allowBookmarksAndScanSelected(user)
    await screen.findByText("https://failed.example.invalid")
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportImportButton,
      ),
    )

    await screen.findByText(
      "ui:dialog.bookmarkAccountImport.failures.detection",
    )
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportOpenFailedAddAccountButton,
      ),
    )

    expect(openAddAccountMock).toHaveBeenCalledWith({
      source: "bookmark-import",
      siteUrl: "https://failed.example.invalid",
    })
  })

  it("starts bookmark import analytics with account management context", async () => {
    const user = userEvent.setup()

    renderDialog()

    await allowBookmarksAndScanSelected(user)
    await screen.findByText("https://new.example.invalid")
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportImportButton,
      ),
    )

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountsFromBookmarks,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        entrypoint: "options",
      })
    })
  })
})
