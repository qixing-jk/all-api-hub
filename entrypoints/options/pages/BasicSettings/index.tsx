import { Tab } from "@headlessui/react"
import { Settings } from "lucide-react"
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react"
import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import { setLastSeenOptionalPermissions } from "~/services/permissions/optionalPermissionState"
import { OPTIONAL_PERMISSIONS } from "~/services/permissions/permissionManager"
import {
  navigateToAnchor,
  parseTabFromUrl,
  updateUrlWithTab,
} from "~/utils/url"

import AccountManagementTab from "./components/AccountManagementTab"
import AutoRefreshTab from "./components/AutoRefreshTab"
import CheckinRedeemTab from "./components/CheckinRedeemTab"
import ClaudeCodeRouterTab from "./components/ClaudeCodeRouterTab"
import CliProxyTab from "./components/CliProxyTab"
import DataBackupTab from "./components/DataBackupTab"
import GeneralTab from "./components/GeneralTab"
import LoadingSkeleton from "./components/LoadingSkeleton"
import ManagedSiteTab from "./components/managedSiteTab"
import { PermissionOnboardingDialog } from "./components/PermissionOnboardingDialog"
import PermissionsTab from "./components/PermissionsTab"
import UsageHistorySyncTab from "./components/UsageHistorySyncTab"

type TabId =
  | "general"
  | "accountManagement"
  | "refresh"
  | "checkinRedeem"
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

const hasOptionalPermissions = OPTIONAL_PERMISSIONS.length > 0

const PERMISSIONS_TAB_CONFIG: TabConfig = {
  id: "permissions",
  component: PermissionsTab,
}

const TAB_CONFIGS = [
  { id: "general", component: GeneralTab },
  { id: "accountManagement", component: AccountManagementTab },
  { id: "accountUsage", component: UsageHistorySyncTab },
  { id: "refresh", component: AutoRefreshTab },
  { id: "checkinRedeem", component: CheckinRedeemTab },
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
  "account-management": "accountManagement",
  "sorting-priority": "accountManagement",
  sorting: "accountManagement",
  "auto-refresh": "refresh",
  refresh: "refresh",
  "checkin-redeem": "checkinRedeem",
  checkin: "checkinRedeem",
  "usage-history-sync": "accountUsage",
  "usage-history-sync-state": "accountUsage",
  webdav: "dataBackup",
  "webdav-auto-sync": "dataBackup",
  "import-export-entry": "dataBackup",
  "new-api": "managedSite",
  "new-api-model-sync": "managedSite",
  "cli-proxy": "cliProxy",
  "claude-code-router": "claudeCodeRouter",
  "dangerous-zone": "managedSite",
  ...(hasOptionalPermissions ? { permissions: "permissions" } : {}),
}

/**
 * Basic Settings page: renders tabs for all settings sections and handles URL syncing/onboarding.
 */
export default function BasicSettings() {
  const { t } = useTranslation("settings")
  const { isLoading } = useUserPreferencesContext()

  const tabs = useMemo(
    () =>
      TAB_CONFIGS.map((config) => ({
        id: config.id,
        label: t(`tabs.${config.id}`),
      })),
    [t],
  )

  const [selectedTabIndex, setSelectedTabIndex] = useState(0)
  const selectedTab = TAB_CONFIGS[selectedTabIndex]
  const selectedTabId = selectedTab?.id ?? "general"
  const [showPermissionsOnboarding, setShowPermissionsOnboarding] =
    useState(false)
  const [permissionsOnboardingReason, setPermissionsOnboardingReason] =
    useState<string | null>(null)

  const applyUrlState = useCallback(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const pendingAnchor = searchParams.get("anchor")
    const { tab, anchor, isHeadingAnchor } = parseTabFromUrl({
      ignoreAnchors: [MENU_ITEM_IDS.BASIC],
      defaultHashPage: MENU_ITEM_IDS.BASIC,
    })

    if (tab) {
      const normalizedTab = tab === "sync" ? "accountUsage" : tab
      const index = TAB_CONFIGS.findIndex((cfg) => cfg.id === normalizedTab)
      if (index >= 0) {
        setSelectedTabIndex(index)
      }

      if (pendingAnchor) {
        window.setTimeout(() => {
          navigateToAnchor(pendingAnchor)
        }, 150)
      }
      return
    }

    if (isHeadingAnchor && anchor) {
      const targetTab = ANCHOR_TO_TAB[anchor]
      if (targetTab) {
        const index = TAB_CONFIGS.findIndex((cfg) => cfg.id === targetTab)
        if (index >= 0) {
          setSelectedTabIndex(index)
          window.setTimeout(() => {
            navigateToAnchor(anchor)
          }, 150)
        }
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
    updateUrlWithTab(tab.id, { hashPage: MENU_ITEM_IDS.BASIC })
  }, [])

  if (isLoading) {
    return <LoadingSkeleton />
  }

  return (
    <div className="p-4 sm:p-6">
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
                    {t(`tabs.${config.id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tab.List className="dark:border-dark-bg-tertiary -mb-px hidden flex-wrap items-center gap-2 border-b border-gray-200 md:flex">
            {tabs.map((tab) => (
              <Tab key={tab.id} as={Fragment}>
                {({ selected }) => (
                  <button
                    className={`border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none ${
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
        </div>

        <Tab.Panels>
          {TAB_CONFIGS.map((config) => {
            const Component = config.component
            return (
              <Tab.Panel key={config.id} unmount={false}>
                <Component />
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
