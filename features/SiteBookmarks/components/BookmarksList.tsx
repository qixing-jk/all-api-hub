import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { InboxIcon, PlusIcon } from "@heroicons/react/24/outline"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  Card,
  CardContent,
  CardList,
  DestructiveConfirmDialog,
  EmptyState,
  TagFilter,
} from "~/components/ui"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useBookmarkDialogContext } from "~/features/SiteBookmarks/hooks/BookmarkDialogStateContext"
import { useIsDesktop, useIsSmallScreen } from "~/hooks/useMediaQuery"
import { accountStorage } from "~/services/accounts/accountStorage"
import type { SiteBookmark } from "~/types"
import { createTab } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { closeIfPopup } from "~/utils/navigation"

import BookmarkSearchInput from "./BookmarkSearchInput"
import SortableBookmarkListItem from "./SortableBookmarkListItem"

interface BookmarksListProps {
  initialSearchQuery?: string
}

/**
 * Normalize a string for tolerant bookmark searching (case-insensitive, whitespace-normalized).
 *
 * Note: URL-specific normalization (protocol/query/fragment stripping) is handled separately by
 * `normalizeUrlForSearch` so punctuation in notes/tags doesn't truncate other fields.
 */
function normalizeForSearch(value: string): string {
  if (!value) return ""

  let normalized = value.toLowerCase().trim()

  normalized = normalized.replace(/[\uff01-\uff5e]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  )
  normalized = normalized.replace(/\s+/g, " ").trim()

  return normalized
}

/**
 * Normalize a URL for bookmark searching by stripping URL noise.
 */
function normalizeUrlForSearch(value: string): string {
  if (!value) return ""

  let normalized = normalizeForSearch(value)
  normalized = normalized.replace(/^https?:\/\//, "")
  normalized = normalized.replace(/\/+$/, "")
  normalized = normalized.replace(/[?#].*$/, "")
  return normalized
}

/**
 * Normalize a single user-provided search token so URL-like tokens match URL-normalized haystacks.
 */
function normalizeSearchToken(token: string): string {
  const normalized = normalizeForSearch(token)
  if (!normalized) return ""

  const probablyUrl =
    normalized.includes("://") ||
    normalized.includes("/") ||
    normalized.includes(".") ||
    ((normalized.includes("?") || normalized.includes("#")) &&
      (normalized.includes(".") || normalized.includes("/")))

  return probablyUrl ? normalizeUrlForSearch(token) : normalized
}

/**
 * Bookmarks list view with search, tag filtering, pin/unpin and drag reorder.
 */
export default function BookmarksList({
  initialSearchQuery,
}: BookmarksListProps) {
  const { t } = useTranslation(["bookmark", "messages", "common"])
  const isSmallScreen = useIsSmallScreen()
  const isDesktop = useIsDesktop()
  const { openAddBookmark, openEditBookmark } = useBookmarkDialogContext()
  const {
    bookmarks,
    pinnedAccountIds,
    orderedAccountIds,
    tags,
    tagStore,
    isAccountPinned,
    togglePinAccount,
    handleBookmarkReorder,
    loadAccountData,
  } = useAccountDataContext()

  const [deleteTarget, setDeleteTarget] = useState<SiteBookmark | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  const normalizedInitialQuery = initialSearchQuery ?? ""
  const [query, setQuery] = useState(() => normalizedInitialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(
    () => normalizedInitialQuery,
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 150)
    return () => clearTimeout(timer)
  }, [query])

  const clearSearch = useCallback(() => {
    setQuery("")
    setDebouncedQuery("")
  }, [])

  const resolvedBookmarks = useMemo(() => {
    return bookmarks.map((bookmark) => {
      const resolvedNames = (bookmark.tagIds || [])
        .map((id) => tagStore.tagsById[id]?.name)
        .filter((name): name is string => Boolean(name))

      return {
        ...bookmark,
        tagIds: bookmark.tagIds || [],
        tags: resolvedNames,
      }
    })
  }, [bookmarks, tagStore.tagsById])

  const orderedBookmarks = useMemo(() => {
    const byId = new Map<string, (typeof resolvedBookmarks)[number]>()
    for (const bookmark of resolvedBookmarks) {
      byId.set(bookmark.id, bookmark)
    }

    const pinnedIds = (pinnedAccountIds || []).filter((id) => byId.has(id))
    const pinnedSet = new Set(pinnedIds)

    const pinned = pinnedIds
      .map((id) => byId.get(id))
      .filter((item): item is (typeof resolvedBookmarks)[number] =>
        Boolean(item),
      )

    const orderedNonPinnedIds = (orderedAccountIds || []).filter(
      (id) => byId.has(id) && !pinnedSet.has(id),
    )

    const orderedNonPinned = orderedNonPinnedIds
      .map((id) => byId.get(id))
      .filter((item): item is (typeof resolvedBookmarks)[number] =>
        Boolean(item),
      )

    const orderedNonPinnedSet = new Set(orderedNonPinnedIds)

    const remaining = resolvedBookmarks
      .filter((bookmark) => !pinnedSet.has(bookmark.id))
      .filter((bookmark) => !orderedNonPinnedSet.has(bookmark.id))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      )

    return [...pinned, ...orderedNonPinned, ...remaining]
  }, [orderedAccountIds, pinnedAccountIds, resolvedBookmarks])

  const inSearchMode = debouncedQuery.trim().length > 0
  const dragDisabled = inSearchMode || selectedTagIds.length > 0

  const searchResults = useMemo(() => {
    const q = debouncedQuery.trim()
    if (!q) return []

    const tokens = q
      .split(/\s+/)
      .map((token) => normalizeSearchToken(token))
      .filter(Boolean)
    if (tokens.length === 0) return []

    return orderedBookmarks.filter((bookmark) => {
      const haystackParts = [
        normalizeForSearch(bookmark.name),
        normalizeUrlForSearch(bookmark.url),
        normalizeForSearch(bookmark.notes || ""),
        ...(bookmark.tags || []).map((tag) => normalizeForSearch(tag)),
      ].filter(Boolean)

      const haystack = haystackParts.join(" ")

      return tokens.every((token) => haystack.includes(token))
    })
  }, [debouncedQuery, orderedBookmarks])

  const baseResults = useMemo(
    () => (inSearchMode ? searchResults : orderedBookmarks),
    [inSearchMode, orderedBookmarks, searchResults],
  )

  const displayedResults = useMemo(() => {
    if (selectedTagIds.length === 0) {
      return baseResults
    }

    return baseResults.filter((bookmark) => {
      const ids = bookmark.tagIds || []
      return selectedTagIds.some((tagId) => ids.includes(tagId))
    })
  }, [baseResults, selectedTagIds])

  const tagCountsById = useMemo(() => {
    const counts: Record<string, number> = {}

    for (const bookmark of resolvedBookmarks) {
      const ids = bookmark.tagIds || []
      for (const id of ids) {
        if (!id) continue
        counts[id] = (counts[id] ?? 0) + 1
      }
    }

    return counts
  }, [resolvedBookmarks])

  const tagFilterOptions = useMemo(() => {
    if (tags.length === 0) {
      return []
    }

    return tags.map((tag) => ({
      value: tag.id,
      label: tag.name,
      count: tagCountsById[tag.id] ?? 0,
    }))
  }, [tagCountsById, tags])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  )

  const sortedIds = useMemo(
    () => baseResults.map((bookmark) => bookmark.id),
    [baseResults],
  )

  const handleLabel = t("bookmark:list.dragHandle")

  const onDragEnd = (event: DragEndEvent) => {
    if (dragDisabled) return
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = sortedIds.indexOf(active.id as string)
    const newIndex = sortedIds.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(sortedIds, oldIndex, newIndex)
    void handleBookmarkReorder(newOrder)
  }

  const maxTagFilterLines = isSmallScreen ? 2 : isDesktop ? 3 : 2

  const handleOpenBookmark = async (bookmark: SiteBookmark) => {
    try {
      await createTab(bookmark.url, true)
      closeIfPopup()
    } catch (error) {
      toast.error(
        t("messages:toast.error.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
    }
  }

  const handleCopyUrl = async (bookmark: SiteBookmark) => {
    try {
      await navigator.clipboard.writeText(bookmark.url)
      toast.success(
        t("messages:toast.success.bookmarkUrlCopied", {
          name: bookmark.name,
        }),
      )
    } catch (error) {
      toast.error(
        t("messages:toast.error.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
    }
  }

  const handleTogglePin = async (bookmark: SiteBookmark) => {
    const wasPinned = isAccountPinned(bookmark.id)
    const success = await togglePinAccount(bookmark.id)
    if (!success) {
      toast.error(t("messages:toast.error.saveFailed"))
      return
    }

    toast.success(
      wasPinned
        ? t("messages:toast.success.bookmarkUnpinned", {
            name: bookmark.name,
          })
        : t("messages:toast.success.bookmarkPinned", {
            name: bookmark.name,
          }),
    )
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    const target = deleteTarget

    try {
      const success = await accountStorage.deleteBookmark(target.id)
      if (!success) {
        throw new Error(t("messages:toast.error.saveFailed"))
      }
      toast.success(
        t("messages:toast.success.bookmarkDeleted", { name: target.name }),
      )
      await loadAccountData()
    } catch (error) {
      toast.error(
        t("messages:toast.error.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setDeleteTarget(null)
    }
  }

  if (resolvedBookmarks.length === 0) {
    return (
      <EmptyState
        icon={<InboxIcon className="h-12 w-12" />}
        title={t("bookmark:emptyState")}
        action={{
          label: t("bookmark:addFirstBookmark"),
          onClick: openAddBookmark,
          variant: "default",
          icon: <PlusIcon className="h-4 w-4" />,
        }}
      />
    )
  }

  const listContent = (
    <CardList>
      {displayedResults.map((bookmark) => (
        <SortableBookmarkListItem
          key={bookmark.id}
          bookmark={bookmark}
          isPinned={isAccountPinned(bookmark.id)}
          onOpen={() => void handleOpenBookmark(bookmark)}
          onCopyUrl={() => void handleCopyUrl(bookmark)}
          onEdit={() => openEditBookmark(bookmark)}
          onDelete={() => setDeleteTarget(bookmark)}
          onTogglePin={() => void handleTogglePin(bookmark)}
          isDragDisabled={dragDisabled}
          handleLabel={handleLabel}
          showHandle={!dragDisabled}
        />
      ))}
    </CardList>
  )

  return (
    <>
      <Card>
        <CardContent padding={"none"} spacing={"none"}>
          <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary border-b border-gray-200 bg-white px-3 py-2 sm:px-5 sm:py-3">
            <BookmarkSearchInput
              value={query}
              onChange={setQuery}
              onClear={clearSearch}
            />
          </div>

          <div className="dark:border-dark-bg-tertiary border-b border-gray-200 px-3 py-2 sm:px-5">
            <TagFilter
              options={tagFilterOptions}
              value={selectedTagIds}
              onChange={setSelectedTagIds}
              maxVisibleLines={maxTagFilterLines}
              allLabel={t("bookmark:filter.tagsAllLabel")}
              allCount={resolvedBookmarks.length}
            />
          </div>

          {dragDisabled ? (
            listContent
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={sortedIds}
                strategy={verticalListSortingStrategy}
              >
                {listContent}
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <DestructiveConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={t("bookmark:delete.title")}
        description={t("bookmark:delete.description", {
          name: deleteTarget?.name ?? "",
        })}
        cancelLabel={t("common:actions.cancel")}
        confirmLabel={t("common:actions.delete")}
        onConfirm={() => {
          void handleConfirmDelete()
        }}
      />
    </>
  )
}
