import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import BookmarkAccountImportDevPreview from "~/features/AccountManagement/bookmarkImport/BookmarkAccountImportDevPreview"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  DevPanelProvider,
  useDevPanelSections,
} from "~/features/DevPanel/DevPanelSectionsContext"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  openAddAccount,
  loadAccountData,
  readBookmarks,
  requestPermissions,
  importAccounts,
  startAnalytics,
  development,
} = vi.hoisted(() => ({
  openAddAccount: vi.fn(),
  loadAccountData: vi.fn(),
  readBookmarks: vi.fn(),
  requestPermissions: vi.fn(),
  importAccounts: vi.fn(),
  startAnalytics: vi.fn(),
  development: { value: true },
}))
vi.mock("~/utils/core/environment", async (original) => ({
  ...(await original<typeof import("~/utils/core/environment")>()),
  isDevelopmentMode: () => development.value,
}))
vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({ accounts: [], loadAccountData }),
}))
vi.mock("~/features/AccountManagement/hooks/useDialogStateContext", () => ({
  useDialogStateContext: () => ({ openAddAccount }),
}))
vi.mock("~/services/permissions/permissionManager", async (original) => ({
  ...(await original<
    typeof import("~/services/permissions/permissionManager")
  >()),
  ensurePermissionsDetailed: requestPermissions,
}))
vi.mock("~/utils/browser/bookmarks", async (original) => ({
  ...(await original<typeof import("~/utils/browser/bookmarks")>()),
  getBrowserBookmarkTree: readBookmarks,
}))
vi.mock("~/features/AccountManagement/bookmarkImport/importAccounts", () => ({
  runBookmarkAccountImport: importAccounts,
}))
vi.mock("~/services/productAnalytics/actions", async (original) => ({
  ...(await original<typeof import("~/services/productAnalytics/actions")>()),
  startProductAnalyticsAction: startAnalytics,
}))

function Actions() {
  const sections = useDevPanelSections()
  return (
    <div data-testid="dev-fixture-actions">
      {sections.flatMap((section) =>
        section.actions.map((action) => (
          <button key={action.id} onClick={() => void action.run()}>
            {action.label}
          </button>
        )),
      )}
    </div>
  )
}
function mount() {
  render(
    <DevPanelProvider surface="options" page="account">
      <BookmarkAccountImportDevPreview />
      <Actions />
    </DevPanelProvider>,
  )
}

describe("bookmark import dev preview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    development.value = true
  })

  it("exercises the real dialog with local mixed results, recovery, retry and reset", async () => {
    const user = userEvent.setup()
    mount()
    await user.click(
      await screen.findByRole("button", {
        name: "Dev: Open bookmark import fixtures",
      }),
    )
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportSelectAllButton,
      ),
    )
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton,
      ),
    )
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportImportButton,
      ),
    )
    expect(
      await screen.findByText("ui:dialog.bookmarkAccountImport.failures.login"),
    ).toBeVisible()
    expect(
      screen.getByText("ui:dialog.bookmarkAccountImport.failures.verification"),
    ).toBeVisible()
    expect(
      screen.getByText("ui:dialog.bookmarkAccountImport.failures.save"),
    ).toBeVisible()
    expect(
      screen.getAllByText("ui:dialog.bookmarkAccountImport.status.imported"),
    ).toHaveLength(1)
    await user.click(
      atIndex(
        screen.getAllByRole("button", {
          name: "ui:dialog.bookmarkAccountImport.actions.openAddAccount",
        }),
        0,
      ),
    )
    expect(openAddAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "bookmark-import",
        siteUrl: expect.stringContaining(".invalid"),
        siteType: "new-api",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.bookmarkAccountImport.actions.retryFailed",
      }),
    )
    await waitFor(() =>
      expect(
        screen.getAllByText("ui:dialog.bookmarkAccountImport.status.imported"),
      ).toHaveLength(3),
    )
    expect(
      screen.getByText("ui:dialog.bookmarkAccountImport.failures.verification"),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.bookmarkAccountImport.actions.retryFailed",
      }),
    )
    await waitFor(() =>
      expect(
        screen.getAllByText("ui:dialog.bookmarkAccountImport.status.imported"),
      ).toHaveLength(4),
    )
    expect(
      screen.queryByRole("button", {
        name: "ui:dialog.bookmarkAccountImport.actions.retryFailed",
      }),
    ).not.toBeInTheDocument()
    await user.keyboard("{Escape}")
    await user.click(
      await screen.findByRole("button", {
        name: "Dev: Open bookmark import fixtures",
      }),
    )
    expect(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    ).toBeVisible()
    for (const external of [
      loadAccountData,
      readBookmarks,
      requestPermissions,
      importAccounts,
      startAnalytics,
    ])
      expect(external).not.toHaveBeenCalled()
  })

  it("does not register or expose fixtures outside development mode", async () => {
    development.value = false
    mount()
    await screen.findByTestId("dev-fixture-actions")
    expect(
      screen.queryByRole("button", {
        name: "Dev: Open bookmark import fixtures",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportDialog),
    ).not.toBeInTheDocument()
  })
})
