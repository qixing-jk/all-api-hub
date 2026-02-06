import { Bookmark } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import { AccountDataProvider } from "~/features/AccountManagement/hooks/AccountDataContext"
import BookmarksList from "~/features/SiteBookmarks/components/BookmarksList"
import {
  BookmarkDialogStateProvider,
  useBookmarkDialogContext,
} from "~/features/SiteBookmarks/hooks/BookmarkDialogStateContext"

/**
 * Renders the Bookmark Management page body: header with CTA and bookmarks list.
 */
function BookmarkManagementContent({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation(["bookmark", "common"])
  const { openAddBookmark } = useBookmarkDialogContext()

  return (
    <div className="dark:bg-dark-bg-secondary flex flex-col bg-white p-6">
      <PageHeader
        icon={Bookmark}
        title={t("bookmark:title")}
        description={t("bookmark:description")}
        actions={
          <Button onClick={openAddBookmark}>{t("bookmark:actions.add")}</Button>
        }
      />

      <div className="dark:bg-dark-bg-secondary flex flex-col bg-white">
        <BookmarksList initialSearchQuery={searchQuery} />
      </div>
    </div>
  )
}

interface BookmarkManagementProps {
  refreshKey?: number
  routeParams?: Record<string, string>
}

/**
 * Wraps BookmarkManagementContent with data/dialog providers and hash-driven params.
 */
function BookmarkManagement({
  refreshKey,
  routeParams,
}: BookmarkManagementProps) {
  return (
    <AccountDataProvider refreshKey={refreshKey}>
      <BookmarkDialogStateProvider>
        <BookmarkManagementContent searchQuery={routeParams?.search} />
      </BookmarkDialogStateProvider>
    </AccountDataProvider>
  )
}

export default BookmarkManagement
