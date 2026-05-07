import { Tab } from "@headlessui/react"
import type { TFunction } from "i18next"
import { ChevronDown, Settings } from "lucide-react"
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  clearHighlightSearchParam,
  highlightSearchTarget,
  OPTIONS_SEARCH_HIGHLIGHT_PARAM,
} from "~/entrypoints/options/search/navigation"
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
  "dangerous-zone": "general",
  ...(hasOptionalPermissions ? { permissions: "permissions" } : {}),
}

interface SettingsTabItem {
  id: TabId
  label: string
}

const DESKTOP_TAB_GAP_PX = 8

/**
 * Returns the shared desktop tab button classes for selected and idle states.
 */
function getTabButtonClass(selected: boolean) {
  return `border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none ${
    selected
      ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
      : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
  }`
}

/**
 * Compute the total desktop row width for the provided tab ids.
 */
function getDesktopTabRowWidth(
  tabIds: TabId[],
  tabWidthsById: Readonly<Partial<Record<TabId, number>>>,
) {
  if (tabIds.length <= 0) return 0

  return tabIds.reduce((sum, tabId, index) => {
    const width = tabWidthsById[tabId] ?? 0
    return sum + width + (index > 0 ? DESKTOP_TAB_GAP_PX : 0)
  }, 0)
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
  selectedTabId,
  onTabSelect,
}: {
  tabs: SettingsTabItem[]
  selectedTabId: TabId
  onTabSelect: (tabId: TabId) => void
}) {
  const { t } = useTranslation(["settings", "common"])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const moreMeasureRef = useRef<HTMLButtonElement | null>(null)
  const tabMeasureRefs = useRef<
    Partial<Record<TabId, HTMLButtonElement | null>>
  >({})
  const [visibleTabIds, setVisibleTabIds] = useState<TabId[]>(() =>
    tabs.map((tab) => tab.id),
  )
  const [overflowTabIds, setOverflowTabIds] = useState<TabId[]>([])

  const tabsById = useMemo(
    () =>
      Object.fromEntries(tabs.map((tab) => [tab.id, tab])) as Record<
        TabId,
        SettingsTabItem
      >,
    [tabs],
  )
  const orderedTabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs])

  const recalculateVisibleTabs = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const availableWidth = container.clientWidth
    if (availableWidth <= 0) return

    const tabWidths = orderedTabIds.map(
      (tabId) =>
        tabMeasureRefs.current[tabId]?.getBoundingClientRect().width ?? 0,
    )
    const moreWidth = moreMeasureRef.current?.getBoundingClientRect().width ?? 0

    if (tabWidths.some((width) => width <= 0)) {
      return
    }

    const tabWidthsById = Object.fromEntries(
      orderedTabIds.map((tabId, index) => [tabId, tabWidths[index] ?? 0]),
    ) as Record<TabId, number>

    const getTotalWidth = (count: number) => {
      if (count <= 0) return 0
      const contentWidth = tabWidths
        .slice(0, count)
        .reduce((sum, width) => sum + width, 0)
      return contentWidth + DESKTOP_TAB_GAP_PX * (count - 1)
    }

    if (getTotalWidth(orderedTabIds.length) <= availableWidth) {
      setVisibleTabIds(orderedTabIds)
      setOverflowTabIds([])
      return
    }

    const reservedWidth = moreWidth + DESKTOP_TAB_GAP_PX
    const maxVisibleWidth = Math.max(availableWidth - reservedWidth, 0)

    let usedWidth = 0
    let visibleCount = 0

    for (const width of tabWidths) {
      const nextWidth =
        visibleCount === 0 ? width : usedWidth + DESKTOP_TAB_GAP_PX + width
      if (nextWidth > maxVisibleWidth) {
        break
      }
      usedWidth = nextWidth
      visibleCount += 1
    }

    let nextVisibleTabIds = orderedTabIds.slice(0, visibleCount)

    if (!nextVisibleTabIds.includes(selectedTabId)) {
      nextVisibleTabIds = [...nextVisibleTabIds, selectedTabId]

      while (
        nextVisibleTabIds.length > 1 &&
        getDesktopTabRowWidth(nextVisibleTabIds, tabWidthsById) >
          maxVisibleWidth
      ) {
        nextVisibleTabIds.splice(nextVisibleTabIds.length - 2, 1)
      }
    }

    nextVisibleTabIds = orderedTabIds.filter((tabId) =>
      nextVisibleTabIds.includes(tabId),
    )

    const nextOverflowTabIds = orderedTabIds.filter(
      (tabId) => !nextVisibleTabIds.includes(tabId),
    )

    setVisibleTabIds(nextVisibleTabIds)
    setOverflowTabIds(nextOverflowTabIds)
  }, [orderedTabIds, selectedTabId])

  useLayoutEffect(() => {
    recalculateVisibleTabs()

    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      recalculateVisibleTabs()
    })

    resizeObserver.observe(container)
    return () => {
      resizeObserver.disconnect()
    }
  }, [recalculateVisibleTabs])

  return (
    <div
      ref={containerRef}
      className="dark:border-dark-bg-tertiary relative -mb-px hidden items-center gap-2 border-b border-gray-200 md:flex"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 -z-10 flex gap-2 opacity-0"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(node) => {
              tabMeasureRefs.current[tab.id] = node
            }}
            type="button"
            className={getTabButtonClass(false)}
            tabIndex={-1}
          >
            {tab.label}
          </button>
        ))}
        <button
          ref={moreMeasureRef}
          type="button"
          className={getTabButtonClass(false)}
          tabIndex={-1}
        >
          <span className="inline-flex items-center gap-1.5">
            {t("common:actions.more")}
            <ChevronDown className="h-4 w-4" />
          </span>
        </button>
      </div>

      <Tab.List className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {visibleTabIds.map((tabId) => {
          const tab = tabsById[tabId]
          const isSelected = selectedTabId === tab.id

          return (
            <button
              key={tab.id}
              type="button"
              className={getTabButtonClass(isSelected)}
              aria-pressed={isSelected}
              onClick={() => onTabSelect(tab.id)}
            >
              {tab.label}
            </button>
          )
        })}
      </Tab.List>

      {overflowTabIds.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={getTabButtonClass(false)}
              aria-label={t("common:actions.more")}
            >
              <span className="inline-flex items-center gap-1.5">
                {t("common:actions.more")}
                <ChevronDown className="h-4 w-4" />
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {overflowTabIds.map((tabId) => {
              const tab = tabsById[tabId]

              return (
                <DropdownMenuItem
                  key={tab.id}
                  onClick={() => onTabSelect(tab.id)}
                  className={
                    selectedTabId === tab.id ? "font-medium" : undefined
                  }
                >
                  {tab.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
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
    const pendingHighlight = searchParams.get(OPTIONS_SEARCH_HIGHLIGHT_PARAM)
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
      }

      if (!pendingAnchor && isHeadingAnchor && anchor) {
        window.setTimeout(() => {
          navigateToAnchor(anchor)
        }, 150)
      }

      if (pendingHighlight) {
        window.setTimeout(() => {
          if (!highlightSearchTarget(pendingHighlight)) {
            clearHighlightSearchParam()
            return
          }

          clearHighlightSearchParam()
        }, 220)
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
        <Tab.List className="sr-only">
          {tabs.map((tab) => (
            <Tab key={tab.id}>{tab.label}</Tab>
          ))}
        </Tab.List>

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

          <DesktopTabs
            tabs={tabs}
            selectedTabId={selectedTabId}
            onTabSelect={(tabId) => {
              const index = getTabIndexFromId(tabId)
              handleTabChange(index)
            }}
          />
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
