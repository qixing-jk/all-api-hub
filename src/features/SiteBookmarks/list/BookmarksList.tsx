import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Bookmark, Inbox } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PopupTabOnboarding } from "~/components/PopupTabOnboarding"
import {
  Card,
  CardContent,
  CardList,
  ConfirmDialog,
  EmptyState,
  Spinner,
  TagFilter,
} from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { BookmarkSponsorRecommendationsSection } from "~/features/SiteBookmarks/components/BookmarkSponsorRecommendationsSection"
import BookmarkSearchInput from "~/features/SiteBookmarks/list/BookmarkSearchInput"
import SortableBookmarkListItem from "~/features/SiteBookmarks/list/SortableBookmarkListItem"
import { useBookmarksListViewModel } from "~/features/SiteBookmarks/list/useBookmarksListViewModel"
import { SITE_BOOKMARKS_TEST_IDS } from "~/features/SiteBookmarks/testIds"
import { useIsDesktop, useIsSmallScreen } from "~/hooks/useMediaQuery"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

interface BookmarksListProps {
  initialSearchQuery?: string
}

/** Presents the bookmark workspace and translates drag gestures to reorder commands. */
export default function BookmarksList({
  initialSearchQuery,
}: BookmarksListProps) {
  const { t } = useTranslation(["bookmark", "common"])
  const isSmallScreen = useIsSmallScreen()
  const isDesktop = useIsDesktop()
  const maxTagFilterLines = isSmallScreen ? 2 : isDesktop ? 3 : 2
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  )
  const handleLabel = t("bookmark:list.dragHandle")
  const {
    resolvedBookmarks,
    isInitialLoad,
    openAddBookmark,
    displayedResults,
    isAccountPinned,
    handleOpenBookmark,
    handleCopyUrl,
    openEditBookmark,
    isDeleting,
    deleteTarget,
    requestDelete,
    cancelDelete,
    handleTogglePin,
    dragDisabled,
    query,
    setQuery,
    clearSearch,
    tagFilterOptions,
    selectedTagIds,
    setSelectedTagIds,
    sortedIds,
    handleConfirmDelete,
    reorder,
  } = useBookmarksListViewModel(initialSearchQuery)

  if (isInitialLoad && resolvedBookmarks.length === 0) {
    return (
      <div
        data-testid={SITE_BOOKMARKS_TEST_IDS.listView}
        data-options-page-pending
        role="status"
        className="text-muted-foreground gap-y-density-2 py-density-8 flex items-center justify-center gap-x-2 px-4 text-sm"
      >
        <Spinner size="sm" />
        {t("common:status.loading")}
      </div>
    )
  }

  if (resolvedBookmarks.length === 0) {
    return (
      <ProductAnalyticsScope
        entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.BookmarkManagement}
        surfaceId={
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBookmarkManagementEmptyState
        }
      >
        <PopupTabOnboarding
          data-testid={SITE_BOOKMARKS_TEST_IDS.listView}
          data-options-page-pending={isInitialLoad ? "" : undefined}
          icon={Bookmark}
          title={t("bookmark:emptyState")}
          titleId="popup-bookmark-onboarding-title"
          description={t("bookmark:description")}
          action={{
            label: t("bookmark:addFirstBookmark"),
            onClick: () => openAddBookmark(),
            testId: SITE_BOOKMARKS_TEST_IDS.emptyStateAddButton,
            analyticsAction:
              PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateBookmarkDialog,
          }}
          sponsors={
            <BookmarkSponsorRecommendationsSection
              onOpenBookmarkManager={openAddBookmark}
            />
          }
        />
      </ProductAnalyticsScope>
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
          onDelete={() => requestDelete(bookmark)}
          onTogglePin={() => void handleTogglePin(bookmark)}
          isDragDisabled={dragDisabled}
          handleLabel={handleLabel}
          showHandle={!dragDisabled}
        />
      ))}
    </CardList>
  )

  return (
    <div data-testid={SITE_BOOKMARKS_TEST_IDS.listView}>
      <Card>
        <CardContent padding={"none"} spacing={"none"}>
          <div className="dark:bg-background border-border bg-card py-density-2 sm:py-density-3 rounded-t-[var(--corner-inner-radius)] border-b px-3 sm:px-5">
            <BookmarkSearchInput
              value={query}
              onChange={setQuery}
              onClear={clearSearch}
            />
          </div>

          <div className="border-border py-density-2 border-b px-3 sm:px-5">
            <TagFilter
              options={tagFilterOptions}
              value={selectedTagIds}
              onChange={setSelectedTagIds}
              maxVisibleLines={maxTagFilterLines}
              allLabel={t("bookmark:filter.tagsAllLabel")}
              allCount={resolvedBookmarks.length}
            />
          </div>

          {displayedResults.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-8 w-8" />}
              title={t("bookmark:search.noResults")}
              action={{
                label: t("common:actions.clear"),
                variant: "outline",
                onClick: () => {
                  clearSearch()
                  setSelectedTagIds([])
                },
              }}
            />
          ) : dragDisabled ? (
            listContent
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={({ active, over }) =>
                reorder(String(active.id), over ? String(over.id) : undefined)
              }
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

      <ConfirmDialog
        intent="destructive"
        isOpen={Boolean(deleteTarget)}
        onClose={cancelDelete}
        title={t("bookmark:delete.title")}
        description={t("bookmark:delete.description", {
          name: deleteTarget?.name ?? "",
        })}
        cancelLabel={t("common:actions.cancel")}
        confirmLabel={t("common:actions.delete")}
        workingLabel={t("common:status.deleting")}
        isWorking={isDeleting}
        confirmButtonTestId={SITE_BOOKMARKS_TEST_IDS.deleteConfirmButton}
        onConfirm={() => {
          void handleConfirmDelete()
        }}
      />
    </div>
  )
}
