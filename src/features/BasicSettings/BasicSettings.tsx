import { Tab } from "@headlessui/react"
import type { TFunction } from "i18next"
import { ChevronLeft, ChevronRight, Settings } from "lucide-react"
import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useHorizontalScrollControls } from "~/hooks/useHorizontalScrollControls"
import { setLastSeenOptionalPermissions } from "~/services/permissions/optionalPermissionState"
import { OPTIONAL_PERMISSIONS } from "~/services/permissions/permissionManager"
import { assertNever } from "~/utils/core/assert"
import {
  navigateToAnchor,
  parseTabFromUrl,
  updateUrlWithTab,
} from "~/utils/core/url"

import { PermissionOnboardingDialog } from "./components/dialogs/PermissionOnboardingDialog"
import LoadingSkeleton from "./components/shared/LoadingSkeleton"
import GeneralTab from "./components/tabs/General/GeneralTab"

type TabId =
  | "general"
  | "balanceHistory"
  | "accountManagement"
  | "refresh"
  | "checkinRedeem"
  | "webAiApiCheck"
  | "accountUsage"
  | "dataBackup"
  | "managedSite"
  | "cliProxy"
  | "claudeCodeRouter"
  | "permissions"

interface TabConfig {
  id: TabId
  component: ComponentType
}

/**
 * Wrap a lazily imported settings tab so it can be stored in the shared tab config.
 */
function createLazyTabComponent(
  loader: () => Promise<{ default: ComponentType<any> }>,
): ComponentType {
  return lazy(loader) as ComponentType
}

const hasOptionalPermissions = OPTIONAL_PERMISSIONS.length > 0

const AccountManagementTab = createLazyTabComponent(
  () => import("./components/tabs/AccountManagement/AccountManagementTab"),
)
const BalanceHistoryTab = createLazyTabComponent(
  () => import("./components/tabs/BalanceHistory/BalanceHistoryTab"),
)
const CheckinRedeemTab = createLazyTabComponent(
  () => import("./components/tabs/CheckinRedeem/CheckinRedeemTab"),
)
const ClaudeCodeRouterTab = createLazyTabComponent(
  () => import("./components/tabs/ClaudeCodeRouter/ClaudeCodeRouterTab"),
)
const CliProxyTab = createLazyTabComponent(
  () => import("./components/tabs/CliProxy/CliProxyTab"),
)
const CCHTab = createLazyTabComponent(
  () => import("./components/tabs/CCH/CCHTab"),
)
const DataBackupTab = createLazyTabComponent(
  () => import("./components/tabs/DataBackup/DataBackupTab"),
)
const ManagedSiteTab = createLazyTabComponent(
  () => import("./components/tabs/ManagedSite/ManagedSiteTab"),
)
const PermissionsTab = createLazyTabComponent(
  () => import("./components/tabs/Permissions/PermissionsTab"),
)
const AutoRefreshTab = createLazyTabComponent(
  () => import("./components/tabs/Refresh/AutoRefreshTab"),
)
const UsageHistorySyncTab = createLazyTabComponent(
  () => import("./components/tabs/UsageHistorySync/UsageHistorySyncTab"),
)
const WebAiApiCheckTab = createLazyTabComponent(
  () => import("./components/tabs/WebAiApiCheck/WebAiApiCheckTab"),
)

const PERMISSIONS_TAB_CONFIG: TabConfig = {
  id: "permissions",
  component: PermissionsTab,
}

const TAB_CONFIGS = [
  { id: "general", component: GeneralTab },
  { id: "accountManagement", component: AccountManagementTab },
  { id: "refresh", component: AutoRefreshTab },
  { id: "checkinRedeem", component: CheckinRedeemTab },
  { id: "balanceHistory", component: BalanceHistoryTab },
  { id: "accountUsage", component: UsageHistorySyncTab },
  { id: "webAiApiCheck", component: WebAiApiCheckTab },
  { id: "managedSite", component: ManagedSiteTab },
  { id: "cliProxy", component: CliProxyTab },
  { id: "claudeCodeRouter", component: ClaudeCodeRouterTab },
  { id: "cch", component: CCHTab },
  ...(hasOptionalPermissions ? [PERMISSIONS_TAB_CONFIG] : []),
  { id: "dataBackup", component: DataBackupTab },
] satisfies TabConfig[]

const ANCHOR_TO_TAB: Record<string, TabId> = {
  "general-display": "general",
  display: "general",
  appearance: "general",
  theme: "general",
  "balance-history": "balanceHistory",
  "account-management": "accountManagement",
  "auto-provision-key-on-account-add": "accountManagement",
  "sorting-priority": "accountManagement",
  sorting: "accountManagement",
  "auto-refresh": "refresh",
  refresh: "refresh",
  "checkin-redeem": "checkinRedeem",
  checkin: "checkinRedeem",
  "web-ai-api-check": "webAiApiCheck",
  "usage-history-sync": "accountUsage",
  "usage-history-sync-state": "accountUsage",
  webdav: "dataBackup",
  "webdav-auto-sync": "dataBackup",
  "import-export-entry": "dataBackup",
  "new-api": "managedSite",
  "new-api-model-sync": "managedSite",
  "cli-proxy": "cliProxy",
  "claude-code-router": "claudeCodeRouter",
  "cch": "cch",
  "dangerous-zone": "general",
  ...(hasOptionalPermissions ? { permissions: "permissions" } : {}),
}

interface SettingsTabItem {
  id: TabId
  label: string
}

/**
 * Resolve the currently requested Basic Settings tab from the URL state.
 */
function resolveSelectedTabIndexFromUrl(): number {
  if (typeof window === "undefined") {
    return 0
  }

  const { tab, anchor, isHeadingAnchor } = parseTabFromUrl({
    ignoreAnchors: [MENU_ITEM_IDS.BASIC],
    defaultHashPage: MENU_ITEM_IDS.BASIC,
  })

  if (tab) {
    const normalizedTab = tab === "sync" ? "accountUsage" : tab
    const index = TAB_CONFIGS.findIndex((config) => config.id === normalizedTab)
    if (index >= 0) {
      return index
    }
  }

  if (isHeadingAnchor && anchor) {
    const targetTab = ANCHOR_TO_TAB[anchor]
    if (targetTab) {
      const index = TAB_CONFIGS.findIndex((config) => config.id === targetTab)
      if (index >= 0) {
        return index
      }
    }
  }

  return 0
}

/**
 * Resolve the localized label for a known settings tab id.
 */
function getSettingsTabLabel(t: TFunction, tabId: TabId): string {
  switch (tabId) {
    case "general":
      return t("settings:tabs.general")
    case "balanceHistory":
      return t("settings:tabs.balanceHistory")
    case "accountManagement":
      return t("settings:tabs.accountManagement")
    case "refresh":
      return t("settings:tabs.refresh")
    case "checkinRedeem":
      return t("settings:tabs.checkinRedeem")
    case "webAiApiCheck":
      return t("settings:tabs.webAiApiCheck")
    case "accountUsage":
      return t("settings:tabs.accountUsage")
    case "dataBackup":
      return t("settings:tabs.dataBackup")
    case "managedSite":
      return t("settings:tabs.managedSite")
    case "cliProxy":
      return t("settings:tabs.cliProxy")
    case "claudeCodeRouter":
      return t("settings:tabs.claudeCodeRouter")
    case "cch":
      return t("settings:tabs.cch")
    case "permissions":
      return t("settings:tabs.permissions")
    default:
      return assertNever(tabId, `Unexpected settings tab id: ${tabId}`)
  }
}

/**
 * Renders the desktop tabs.
 */
function DesktopTabs({
  tabs,
  selectedIndex,
}: {
  tabs: SettingsTabItem[]
  selectedIndex: number
}) {
  const { t } = useTranslation("settings")
  const {
    scrollRef: tabListRef,
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    scrollChildIntoCenter,
  } = useHorizontalScrollControls<HTMLDivElement>({
    enableWheelScroll: true,
  })

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      scrollChildIntoCenter(selectedIndex)
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [selectedIndex, tabs.length, scrollChildIntoCenter])

  return (
    <div className="dark:border-dark-bg-tertiary -mb-px hidden items-center gap-1 border-b border-gray-200 md:flex">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={t("tabs.scrollLeft")}
        disabled={!canScrollLeft}
        onClick={scrollLeft}
        className="shrink-0"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Tab.List
        ref={tabListRef}
        className="scrollbar-hide flex min-w-0 flex-1 touch-pan-x items-center gap-2 overflow-x-auto"
      >
        {tabs.map((tab) => (
          <Tab key={tab.id} as={Fragment}>
            {({ selected }) => (
              <button
                className={`border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none ${
                  selected
                    ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                    : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {tab.label}
              </button>
            )}
          </Tab>
        ))}
      </Tab.List>

      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={t("tabs.scrollRight")}
        disabled={!canScrollRight}
        onClick={scrollRight}
        className="shrink-0"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

/**
 * Localized fallback shown while a lazily loaded settings tab chunk is being fetched.
 */
function SettingsTabContentFallback() {
  const { t } = useTranslation("common")

  return (
    <div className="flex min-h-[240px] items-center justify-center">
      <Spinner size="lg" aria-label={t("status.loading")} />
    </div>
  )
}

/**
 * Basic Settings page: renders tabs for all settings sections and handles URL syncing/onboarding.
 */
export default function BasicSettings() {
  const { t } = useTranslation("settings")
  const { isLoading } = useUserPreferencesContext()
  const initialSelectedTabIndex = useMemo(resolveSelectedTabIndexFromUrl, [])
  const initialSelectedTabId =
    TAB_CONFIGS[initialSelectedTabIndex]?.id ?? "general"

  const tabs = useMemo<SettingsTabItem[]>(
    () =>
      TAB_CONFIGS.map((config) => ({
        id: config.id,
        label: getSettingsTabLabel(t, config.id),
      })),
    [t],
  )

  const [selectedTabIndex, setSelectedTabIndex] = useState(
    initialSelectedTabIndex,
  )
  const selectedTab = TAB_CONFIGS[selectedTabIndex]
  const selectedTabId = selectedTab?.id ?? "general"
  const [mountedTabIds, setMountedTabIds] = useState<TabId[]>([
    initialSelectedTabId,
  ])
  const [showPermissionsOnboarding, setShowPermissionsOnboarding] =
    useState(false)
  const [permissionsOnboardingReason, setPermissionsOnboardingReason] =
    useState<string | null>(null)
  const [hasResolvedInitialLoad, setHasResolvedInitialLoad] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      setHasResolvedInitialLoad(true)
    }
  }, [isLoading])

  const applyUrlState = useCallback(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const pendingAnchor = searchParams.get("anchor")
    const { anchor, isHeadingAnchor } = parseTabFromUrl({
      ignoreAnchors: [MENU_ITEM_IDS.BASIC],
      defaultHashPage: MENU_ITEM_IDS.BASIC,
    })
    const nextIndex = resolveSelectedTabIndexFromUrl()
    const nextTab = TAB_CONFIGS[nextIndex]

    if (nextTab) {
      setSelectedTabIndex(nextIndex)
      setMountedTabIds((previous) =>
        previous.includes(nextTab.id) ? previous : [...previous, nextTab.id],
      )

      if (pendingAnchor) {
        window.setTimeout(() => {
          navigateToAnchor(pendingAnchor)
        }, 150)
        return
      }

      if (isHeadingAnchor && anchor) {
        window.setTimeout(() => {
          navigateToAnchor(anchor)
        }, 150)
      }
    }
  }, [])

  useEffect(() => {
    applyUrlState()
    window.addEventListener("popstate", applyUrlState)
    window.addEventListener("hashchange", applyUrlState)
    return () => {
      window.removeEventListener("popstate", applyUrlState)
      window.removeEventListener("hashchange", applyUrlState)
    }
  }, [applyUrlState])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("onboarding") === "permissions" && hasOptionalPermissions) {
      setPermissionsOnboardingReason(params.get("reason"))
      setShowPermissionsOnboarding(true)
    }
  }, [])

  const handleCloseOnboarding = useCallback(() => {
    setShowPermissionsOnboarding(false)
    void setLastSeenOptionalPermissions()
    const url = new URL(window.location.href)
    url.searchParams.delete("onboarding")
    url.searchParams.delete("reason")
    window.history.replaceState(null, "", url.toString())
  }, [])

  const getTabIndexFromId = useCallback(
    (tabId: string) => TAB_CONFIGS.findIndex((cfg) => cfg.id === tabId),
    [],
  )

  const handleTabChange = useCallback((index: number) => {
    if (index < 0 || index >= TAB_CONFIGS.length) return
    setSelectedTabIndex(index)
    const tab = TAB_CONFIGS[index]
    setMountedTabIds((previous) =>
      previous.includes(tab.id) ? previous : [...previous, tab.id],
    )
    updateUrlWithTab(tab.id, { hashPage: MENU_ITEM_IDS.BASIC })
  }, [])

  if (isLoading && !hasResolvedInitialLoad) {
    return <LoadingSkeleton />
  }

  return (
    <div className="p-4 sm:p-6" data-testid="basic-settings-page">
      <PageHeader
        icon={Settings}
        title={t("title")}
        description={t("description")}
      />

      <Tab.Group selectedIndex={selectedTabIndex} onChange={handleTabChange}>
        <div className="mb-6">
          <div className="mb-4 md:hidden">
            <label className="sr-only" htmlFor="settings-tab-select">
              {t("tabs.select")}
            </label>
            <Select
              value={selectedTabId}
              onValueChange={(tabId) => {
                const index = getTabIndexFromId(tabId)
                handleTabChange(index)
              }}
            >
              <SelectTrigger id="settings-tab-select" className="w-full">
                <SelectValue placeholder={t("tabs.select")} />
              </SelectTrigger>
              <SelectContent>
                {TAB_CONFIGS.map((config) => (
                  <SelectItem key={config.id} value={config.id}>
                    {getSettingsTabLabel(t, config.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DesktopTabs tabs={tabs} selectedIndex={selectedTabIndex} />
        </div>

        <Tab.Panels>
          {TAB_CONFIGS.map((config) => {
            const Component = config.component
            return (
              <Tab.Panel key={config.id} unmount={false}>
                {mountedTabIds.includes(config.id) ? (
                  <Suspense fallback={<SettingsTabContentFallback />}>
                    <Component />
                  </Suspense>
                ) : null}
              </Tab.Panel>
            )
          })}
        </Tab.Panels>
      </Tab.Group>

      {hasOptionalPermissions && (
        <PermissionOnboardingDialog
          open={showPermissionsOnboarding}
          onClose={handleCloseOnboarding}
          reason={permissionsOnboardingReason}
        />
      )}
    </div>
  )
}
