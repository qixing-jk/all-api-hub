import { useCallback, useMemo, useState } from "react"

import type { BookmarkDialogMode } from "~/features/SiteBookmarks/components/BookmarkDialog"
import type { SiteBookmark } from "~/types"

interface BookmarkDialogState {
  isOpen: boolean
  mode: BookmarkDialogMode
  bookmark: SiteBookmark | null
  prefill: {
    name?: string
    url?: string
  } | null
}

/**
 * Checks whether a value carries bookmark add-dialog prefill fields.
 */
function isBookmarkAddPrefill(
  value: unknown,
): value is { name?: string; url?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    ("name" in value || "url" in value)
  )
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
    prefill: null,
    ...initial,
  }))

  const openAddBookmark = useCallback(
    (prefill?: { name?: string; url?: string } | null | unknown) => {
      setState({
        isOpen: true,
        mode: "add",
        bookmark: null,
        prefill: isBookmarkAddPrefill(prefill) ? prefill : null,
      })
    },
    [],
  )

  const openEditBookmark = useCallback((bookmark: SiteBookmark) => {
    setState({ isOpen: true, mode: "edit", bookmark, prefill: null })
  }, [])

  const closeBookmarkDialog = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
      bookmark: null,
      prefill: null,
    }))
  }, [])

  const dialogProps = useMemo(
    () => ({
      isOpen: state.isOpen,
      mode: state.mode,
      bookmark: state.bookmark,
      prefill: state.prefill,
      onClose: closeBookmarkDialog,
    }),
    [
      closeBookmarkDialog,
      state.bookmark,
      state.isOpen,
      state.mode,
      state.prefill,
    ],
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
