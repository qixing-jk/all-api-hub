import {
  lazy,
  Suspense,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"

import AccountList from "~/features/AccountManagement/components/AccountList"
import { PopupAccountOnboarding } from "~/features/AccountManagement/components/PopupAccountOnboarding"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { useAddAccountHandler } from "~/features/AccountManagement/opening/useAddAccountHandler"
import { SPONSOR_WORKFLOW_KINDS } from "~/features/AccountManagement/sponsors/constants"
import type { SponsorApiCredentialFallbackPrefill } from "~/features/AccountManagement/sponsors/types"
import { useSponsorWorkflowReceiver } from "~/features/AccountManagement/sponsors/useSponsorWorkflowReceiver"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import type { ApiCredentialProfilesPopupViewHandle } from "~/features/ApiCredentialProfiles/list/ApiCredentialProfilesPopupView"
import { useBookmarkDialogContext } from "~/features/SiteBookmarks/editor/BookmarkDialogStateContext"
import { UI_HANDOFF_RECEIVE_RESULTS } from "~/hooks/useUiHandoffReceiver"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  type ProductAnalyticsActionId,
  type ProductAnalyticsFeatureId,
} from "~/services/productAnalytics/contracts"
import { isExtensionSidePanel } from "~/utils/browser"

import BalanceSection from "./components/BalanceSection"
import type { PopupViewType } from "./components/PopupViewSwitchTabs"
import ShareOverviewSnapshotButton from "./components/ShareOverviewSnapshotButton"
import { POPUP_TEST_IDS } from "./testIds"
import { POPUP_VIEW_TYPES } from "./viewTypes"

const loadBookmarksList = () =>
  import("~/features/SiteBookmarks/list/BookmarksList")
const loadApiCredentialProfilesPopupView = () =>
  import("~/features/ApiCredentialProfiles/list/ApiCredentialProfilesPopupView")

const LazyBookmarksList = lazy(loadBookmarksList)
const LazyApiCredentialProfilesPopupView = lazy(
  loadApiCredentialProfilesPopupView,
)

const LazyBookmarkStatsSection = lazy(
  () => import("./components/BookmarkStatsSection"),
)
const LazyApiCredentialProfilesStatsSection = lazy(
  () => import("./components/ApiCredentialProfilesStatsSection"),
)

interface PopupViewConfig {
  showRefresh: boolean
  showActionBar?: boolean
  showAccountActions?: boolean
  headerAction?: ReactNode
  statsSection?: ReactNode
  primaryActionLabel: string
  onPrimaryAction: () => void
  primaryActionTestId?: string
  primaryAnalyticsAction: {
    featureId: ProductAnalyticsFeatureId
    actionId: ProductAnalyticsActionId
  }
  content: ReactNode
  preload?: () => void
}

interface PopupViewRegistryOptions {
  onSelectView?: (view: PopupViewType) => void
  isPopup?: boolean
  scrollParent?: HTMLElement | null
}

/**
 * Compact placeholder for lazily loaded popup stats cards.
 */
function PopupStatsFallback() {
  return (
    <div className="bg-card/50 dark:bg-foreground/5 h-16 animate-pulse rounded-xl" />
  )
}

/**
 * Lightweight placeholder shown while a non-default popup tab chunk is loading.
 */
function PopupContentFallback() {
  const { t } = useTranslation("common")

  return (
    <div className="text-muted-foreground py-density-8 flex min-h-40 items-center justify-center px-4 text-sm">
      {t("status.loading")}
    </div>
  )
}

/**
 * Builds popup view definitions, including lazy-loaded secondary tabs and their preload hooks.
 */
export function usePopupViewRegistry({
  isPopup = false,
  scrollParent,
  onSelectView,
}: PopupViewRegistryOptions = {}): Record<PopupViewType, PopupViewConfig> {
  const { t } = useTranslation([
    "account",
    "bookmark",
    "common",
    "apiCredentialProfiles",
  ])
  const { handleAddAccountClick } = useAddAccountHandler()
  const { accounts, bookmarks, isInitialLoad } = useAccountDataContext()
  const hasAccounts = accounts.length > 0
  const showAccountOverview = !isInitialLoad && hasAccounts

  // Popup-level bridge between the detected-accounts badge in the stats
  // section and the account list's search box. The revision lets repeated
  // requests re-apply the same query after the user edits or clears it.
  const [accountSearchRequest, setAccountSearchRequest] = useState<{
    query: string
    revision: number
  } | null>(null)
  const requestAccountSearch = useCallback((query: string) => {
    setAccountSearchRequest((prev) => ({
      query,
      revision: (prev?.revision ?? 0) + 1,
    }))
  }, [])
  const { openAddBookmark } = useBookmarkDialogContext()
  // Native action-popup pointer lifecycles do not reliably deliver dnd-kit drag
  // completion, so keep reordering discoverable there but direct users elsewhere.
  const reorderUnavailableReason = isPopup
    ? t("account:list.reorderUnavailableInPopup")
    : undefined

  const apiCredentialProfilesViewRef =
    useRef<ApiCredentialProfilesPopupViewHandle>(null)
  const [pendingApiCredentialProfilesAdd, setPendingApiCredentialProfilesAdd] =
    useState<SponsorApiCredentialFallbackPrefill | true | null>(null)
  const [hasApiCredentialProfiles, setHasApiCredentialProfiles] =
    useState(false)

  const handleApiCredentialProfilesViewRef = useCallback(
    (handle: ApiCredentialProfilesPopupViewHandle | null) => {
      apiCredentialProfilesViewRef.current = handle

      if (handle && pendingApiCredentialProfilesAdd) {
        handle.openAddDialog(
          pendingApiCredentialProfilesAdd === true
            ? undefined
            : pendingApiCredentialProfilesAdd,
        )
        setPendingApiCredentialProfilesAdd(null)
      }
    },
    [pendingApiCredentialProfilesAdd],
  )

  useSponsorWorkflowReceiver(isExtensionSidePanel(), (intent) => {
    switch (intent.kind) {
      case SPONSOR_WORKFLOW_KINDS.Account:
        onSelectView?.(POPUP_VIEW_TYPES.Accounts)
        handleAddAccountClick(intent.prefill)
        break
      case SPONSOR_WORKFLOW_KINDS.Bookmark:
        onSelectView?.(POPUP_VIEW_TYPES.Bookmarks)
        openAddBookmark(intent.prefill)
        break
      case SPONSOR_WORKFLOW_KINDS.ApiCredential:
        onSelectView?.(POPUP_VIEW_TYPES.ApiCredentialProfiles)
        if (apiCredentialProfilesViewRef.current) {
          apiCredentialProfilesViewRef.current.openAddDialog(intent.prefill)
        } else {
          setPendingApiCredentialProfilesAdd(intent.prefill)
          void loadApiCredentialProfilesPopupView()
        }
        break
    }
    return UI_HANDOFF_RECEIVE_RESULTS.Accepted
  })

  return {
    [POPUP_VIEW_TYPES.Accounts]: {
      showRefresh: showAccountOverview,
      showActionBar: showAccountOverview,
      showAccountActions: showAccountOverview,
      headerAction: showAccountOverview ? (
        <ShareOverviewSnapshotButton />
      ) : null,
      statsSection: showAccountOverview ? (
        <BalanceSection onFilterCurrentSiteAccounts={requestAccountSearch} />
      ) : null,
      primaryActionLabel: t("account:addAccount"),
      onPrimaryAction: handleAddAccountClick,
      primaryAnalyticsAction: {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateAccountDialog,
      },
      primaryActionTestId: ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton,
      content:
        !isInitialLoad && !hasAccounts ? (
          <PopupAccountOnboarding onAdd={handleAddAccountClick} />
        ) : (
          <AccountList
            initialSearchQuery={accountSearchRequest?.query}
            initialSearchQueryRevision={accountSearchRequest?.revision}
            reorderUnavailableReason={reorderUnavailableReason}
            showAddAccountAction={false}
            virtualScrollParent={scrollParent}
          />
        ),
    },
    [POPUP_VIEW_TYPES.Bookmarks]: {
      showRefresh: false,
      showActionBar: !isInitialLoad && bookmarks.length > 0,
      showAccountActions: false,
      statsSection:
        !isInitialLoad && bookmarks.length > 0 ? (
          <Suspense fallback={<PopupStatsFallback />}>
            <LazyBookmarkStatsSection />
          </Suspense>
        ) : null,
      primaryActionLabel: t("bookmark:actions.add"),
      primaryActionTestId: POPUP_TEST_IDS.bookmarksPrimaryAction,
      onPrimaryAction: openAddBookmark,
      primaryAnalyticsAction: {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BookmarkManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateBookmarkDialog,
      },
      content: (
        <Suspense fallback={<PopupContentFallback />}>
          <LazyBookmarksList />
        </Suspense>
      ),
      preload: () => {
        void loadBookmarksList()
      },
    },
    [POPUP_VIEW_TYPES.ApiCredentialProfiles]: {
      showRefresh: false,
      showActionBar: hasApiCredentialProfiles,
      showAccountActions: false,
      statsSection: hasApiCredentialProfiles ? (
        <Suspense fallback={<PopupStatsFallback />}>
          <LazyApiCredentialProfilesStatsSection />
        </Suspense>
      ) : null,
      primaryActionLabel: t("apiCredentialProfiles:actions.add"),
      primaryActionTestId: POPUP_TEST_IDS.apiCredentialProfilesPrimaryAction,
      onPrimaryAction: () => {
        if (apiCredentialProfilesViewRef.current) {
          apiCredentialProfilesViewRef.current.openAddDialog()
          return
        }

        setPendingApiCredentialProfilesAdd(true)
        void loadApiCredentialProfilesPopupView()
      },
      primaryAnalyticsAction: {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateApiCredentialProfileDialog,
      },
      content: (
        <Suspense fallback={<PopupContentFallback />}>
          <LazyApiCredentialProfilesPopupView
            ref={handleApiCredentialProfilesViewRef}
            showKeyManagementImportHint={showAccountOverview}
            onHasProfilesChange={setHasApiCredentialProfiles}
          />
        </Suspense>
      ),
      preload: () => {
        void loadApiCredentialProfilesPopupView()
      },
    },
  }
}
