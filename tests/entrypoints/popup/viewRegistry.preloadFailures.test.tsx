import { renderHook, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"

import { usePopupViewRegistry } from "~/entrypoints/popup/viewRegistry"

const { warn, error } = vi.hoisted(() => ({
  warn: vi.fn(),
  error: new Error("Chunk unavailable"),
}))
vi.mock("~/utils/core/logger", () => ({ createLogger: () => ({ warn }) }))
vi.mock("~/features/SiteBookmarks/list/BookmarksList", () => {
  throw error
})
vi.mock(
  "~/features/ApiCredentialProfiles/list/ApiCredentialProfilesPopupView",
  () => {
    throw error
  },
)
vi.mock("~/features/AccountManagement/data/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    accounts: [],
    bookmarks: [],
    isInitialLoad: false,
  }),
}))
vi.mock("~/features/AccountManagement/opening/useAddAccountHandler", () => ({
  useAddAccountHandler: () => ({ handleAddAccountClick: vi.fn() }),
}))
vi.mock("~/features/SiteBookmarks/editor/BookmarkDialogStateContext", () => ({
  useBookmarkDialogContext: () => ({
    openAddBookmark: vi.fn(),
    isBookmarkDialogOpen: false,
  }),
}))
vi.mock("~/features/AccountManagement/dialogs/useDialogStateContext", () => ({
  useDialogStateContext: () => ({
    isAddAccountOpen: false,
    isEditAccountOpen: false,
  }),
}))
vi.mock(
  "~/features/AccountManagement/sponsors/useSponsorWorkflowReceiver",
  () => ({ useSponsorWorkflowReceiver: vi.fn() }),
)

it.each([
  ["bookmarks", "Bookmark view preload failed"],
  ["apiCredentialProfiles", "Credential profile view preload failed"],
] as const)(
  "contains %s preload failures without rejecting the user's action",
  async (view, message) => {
    const { result } = renderHook(() => usePopupViewRegistry())
    expect(() => result.current[view].preload?.()).not.toThrow()
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        message,
        expect.objectContaining({ cause: error }),
      ),
    )
  },
)
