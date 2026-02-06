import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react"

import BookmarkDialog from "~/features/SiteBookmarks/components/BookmarkDialog"
import type { BookmarkDialogMode } from "~/features/SiteBookmarks/components/BookmarkDialog"
import type { SiteBookmark } from "~/types"

import { useBookmarkDialogState } from "./useBookmarkDialogState"

export interface OpenBookmarkDialogOptions {
  mode: BookmarkDialogMode
  bookmark?: SiteBookmark | null
}

interface BookmarkDialogStateContextType {
  openBookmarkDialog: (options: OpenBookmarkDialogOptions) => void
  openAddBookmark: () => void
  openEditBookmark: (bookmark: SiteBookmark) => void
  closeBookmarkDialog: () => void
}

const BookmarkDialogStateContext = createContext<
  BookmarkDialogStateContextType | undefined
>(undefined)

/**
 * Provides a single shared `BookmarkDialog` instance for the subtree.
 *
 * This mirrors the Account dialog pattern (`DialogStateProvider`) and avoids
 * repeating dialog state wiring across entrypoints/pages.
 */
export function BookmarkDialogStateProvider({
  children,
}: {
  children: ReactNode
}) {
  const {
    openAddBookmark,
    openEditBookmark,
    closeBookmarkDialog,
    dialogProps,
    setState,
  } = useBookmarkDialogState()

  const openBookmarkDialog = useCallback(
    (options: OpenBookmarkDialogOptions) => {
      setState({
        isOpen: true,
        mode: options.mode,
        bookmark: options.bookmark ?? null,
      })
    },
    [setState],
  )

  const value = useMemo(
    () => ({
      openBookmarkDialog,
      openAddBookmark,
      openEditBookmark,
      closeBookmarkDialog,
    }),
    [
      closeBookmarkDialog,
      openAddBookmark,
      openBookmarkDialog,
      openEditBookmark,
    ],
  )

  return (
    <BookmarkDialogStateContext.Provider value={value}>
      {children}
      <BookmarkDialog {...dialogProps} />
    </BookmarkDialogStateContext.Provider>
  )
}

/**
 * Access `BookmarkDialogStateProvider` actions (open add/edit, close).
 *
 * This hook is intentionally strict and will throw if used outside the provider,
 * so calling sites fail fast during development/tests.
 */
export function useBookmarkDialogContext() {
  const context = useContext(BookmarkDialogStateContext)
  if (!context) {
    throw new Error(
      "useBookmarkDialogContext must be used within a BookmarkDialogStateProvider",
    )
  }
  return context
}
