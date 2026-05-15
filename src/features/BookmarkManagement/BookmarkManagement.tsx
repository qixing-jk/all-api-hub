import { Bookmark } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { AccountDataProvider } from "~/features/AccountManagement/hooks/AccountDataContext"
import BookmarksList from "~/features/SiteBookmarks/components/BookmarksList"
import {
  BookmarkDialogStateProvider,
  useBookmarkDialogContext,
} from "~/features/SiteBookmarks/hooks/BookmarkDialogStateContext"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

/**
 * Renders the Bookmark Management page body: header with CTA and bookmarks list.
 */
function BookmarkManagementContent({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation(["bookmark", "common"])
  const { openAddBookmark } = useBookmarkDialogContext()
  const pageSurface =
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBookmarkManagementPage

  return (
    <div className="dark:bg-dark-bg-secondary flex flex-col bg-white p-6">
      <ProductAnalyticsScope
        entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.BookmarkManagement}
        surfaceId={pageSurface}
      >
        <PageHeader
          icon={Bookmark}
          title={t("bookmark:title")}
          description={t("bookmark:description")}
          actions={
            <Button
              onClick={openAddBookmark}
              analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.CreateBookmark}
            >
              {t("bookmark:actions.add")}
            </Button>
          }
        />
      </ProductAnalyticsScope>

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
