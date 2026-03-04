import { useCallback, useMemo, useState } from "react"

import type { BookmarkDialogMode } from "~/features/SiteBookmarks/components/BookmarkDialog"
import type { SiteBookmark } from "~/types"

export interface BookmarkDialogState {
  isOpen: boolean
  mode: BookmarkDialogMode
  bookmark: SiteBookmark | null
}

/**
 * Shared state/handlers for the bookmark add/edit dialog.
 *
 * This hook centralizes the open/close + mode/target handling that is used by
 * multiple entrypoints (e.g. Popup and Options) to avoid duplicated logic.
 */
export function useBookmarkDialogState(initial?: Partial<BookmarkDialogState>) {
  const [state, setState] = useState<BookmarkDialogState>(() => ({
    isOpen: false,
    mode: "add",
    bookmark: null,
    ...initial,
  }))

  const openAddBookmark = useCallback(() => {
    setState({ isOpen: true, mode: "add", bookmark: null })
  }, [])

  const openEditBookmark = useCallback((bookmark: SiteBookmark) => {
    setState({ isOpen: true, mode: "edit", bookmark })
  }, [])

  const closeBookmarkDialog = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
      bookmark: null,
    }))
  }, [])

  const dialogProps = useMemo(
    () => ({
      isOpen: state.isOpen,
      mode: state.mode,
      bookmark: state.bookmark,
      onClose: closeBookmarkDialog,
    }),
    [closeBookmarkDialog, state.bookmark, state.isOpen, state.mode],
  )

  return {
    state,
    setState,
    openAddBookmark,
    openEditBookmark,
    closeBookmarkDialog,
    dialogProps,
  }
}
