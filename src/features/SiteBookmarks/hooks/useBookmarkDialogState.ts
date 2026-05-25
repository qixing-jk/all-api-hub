import { useCallback, useMemo, useState } from "react"

import type { BookmarkDialogMode } from "~/features/SiteBookmarks/components/BookmarkDialog"
import type { SiteBookmark } from "~/types"

interface BookmarkDialogState {
  isOpen: boolean
  mode: BookmarkDialogMode
  bookmark: SiteBookmark | null
  prefill: BookmarkAddPrefill | null
}

type BookmarkAddPrefill = {
  name?: string
  url?: string
}

/**
 * Normalizes bookmark add-dialog prefill fields before they reach controlled inputs.
 */
function normalizeBookmarkAddPrefill(
  value: unknown,
): BookmarkAddPrefill | null {
  if (typeof value !== "object" || value === null) return null

  const record = value as Record<string, unknown>
  const name = trimOptionalString(record.name)
  const url = normalizeOptionalHttpUrl(record.url)
  const prefill = {
    ...(name ? { name } : {}),
    ...(url ? { url } : {}),
  }

  return Object.keys(prefill).length > 0 ? prefill : null
}

/**
 * Trims optional string input and omits empty or non-string values.
 */
function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Returns an HTTP(S) URL string when the optional input is safe to render.
 */
function normalizeOptionalHttpUrl(value: unknown): string | undefined {
  const trimmed = trimOptionalString(value)
  if (!trimmed) return undefined

  try {
    const url = new URL(trimmed)
    return url.protocol === "http:" || url.protocol === "https:"
      ? trimmed
      : undefined
  } catch {
    return undefined
  }
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
        prefill: normalizeBookmarkAddPrefill(prefill),
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
