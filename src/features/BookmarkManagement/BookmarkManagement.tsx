import { Bookmark } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
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
import { SITE_BOOKMARKS_TEST_IDS } from "~/features/SiteBookmarks/testIds"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

/**
 * Renders the Bookmark Management page body: header with CTA and bookmarks list.
 */
function BookmarkManagementContent({
  searchQuery,
  createPrefill,
}: {
  searchQuery?: string
  createPrefill?: {
    name: string
    url: string
  } | null
}) {
  const { t } = useTranslation(["bookmark", "common"])
  const { openAddBookmark } = useBookmarkDialogContext()
  const consumedCreatePrefillKeyRef = useRef<string | null>(null)
  const pageSurface =
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBookmarkManagementPage

  useEffect(() => {
    if (!createPrefill) {
      consumedCreatePrefillKeyRef.current = null
      return
    }

    const prefillKey = `${createPrefill.name}\n${createPrefill.url}`
    if (consumedCreatePrefillKeyRef.current === prefillKey) {
      return
    }

    consumedCreatePrefillKeyRef.current = prefillKey
    openAddBookmark(createPrefill)
  }, [createPrefill, openAddBookmark])

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
              onClick={() => openAddBookmark()}
              data-testid={SITE_BOOKMARKS_TEST_IDS.addButton}
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
  const createPrefill = useMemo(() => {
    if (routeParams?.action !== "add") {
      return null
    }

    const name = routeParams.name?.trim()
    const url = routeParams.url?.trim()
    if (!name || !url) {
      return null
    }

    return { name, url }
  }, [routeParams])

  return (
    <AccountDataProvider refreshKey={refreshKey}>
      <BookmarkDialogStateProvider>
        <BookmarkManagementContent
          searchQuery={routeParams?.search}
          createPrefill={createPrefill}
        />
      </BookmarkDialogStateProvider>
    </AccountDataProvider>
  )
}

export default BookmarkManagement
