import { Tab } from "@headlessui/react"
import { Settings } from "lucide-react"
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType
} from "react"
import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import {
  navigateToAnchor,
  parseTabFromUrl,
  updateUrlWithTab
} from "~/utils/url"

import AccountManagementTab from "./components/AccountManagementTab"
import AutoRefreshTab from "./components/AutoRefreshTab"
import CheckinRedeemTab from "./components/CheckinRedeemTab"
import DataBackupTab from "./components/DataBackupTab"
import GeneralTab from "./components/GeneralTab"
import LoadingSkeleton from "./components/LoadingSkeleton"
import NewApiTab from "./components/NewApiTab"
import PermissionsTab from "./components/PermissionsTab"

type TabId =
  | "general"
  | "accountManagement"
  | "autoRefresh"
  | "checkinRedeem"
  | "dataBackup"
  | "newApi"
  | "permissions"

interface TabConfig {
  id: TabId
  component: ComponentType
}

const TAB_CONFIGS: TabConfig[] = [
  { id: "general", component: GeneralTab },
  { id: "accountManagement", component: AccountManagementTab },
  { id: "autoRefresh", component: AutoRefreshTab },
  { id: "checkinRedeem", component: CheckinRedeemTab },
  { id: "newApi", component: NewApiTab },
  { id: "permissions", component: PermissionsTab },
  { id: "dataBackup", component: DataBackupTab }
]

const ANCHOR_TO_TAB: Record<string, TabId> = {
  "general-display": "general",
  display: "general",
  appearance: "general",
  theme: "general",
  "account-management": "accountManagement",
  "sorting-priority": "accountManagement",
  sorting: "accountManagement",
  "auto-refresh": "autoRefresh",
  refresh: "autoRefresh",
  "checkin-redeem": "checkinRedeem",
  checkin: "checkinRedeem",
  webdav: "dataBackup",
  "webdav-auto-sync": "dataBackup",
  "import-export-entry": "dataBackup",
  "new-api": "newApi",
  "new-api-model-sync": "newApi",
  "dangerous-zone": "newApi",
  permissions: "permissions"
}

export default function BasicSettings() {
  const { t } = useTranslation("settings")
  const { isLoading } = useUserPreferencesContext()

  const tabs = useMemo(
    () =>
      TAB_CONFIGS.map((config) => ({
        id: config.id,
        label: t(`tabs.${config.id}`)
      })),
    [t]
  )

  const [selectedTabIndex, setSelectedTabIndex] = useState(0)
  const selectedTab = TAB_CONFIGS[selectedTabIndex]
  const selectedTabId = selectedTab?.id ?? "general"

  const applyUrlState = useCallback(() => {
    const { tab, anchor, isHeadingAnchor } = parseTabFromUrl({
      ignoreAnchors: ["basic"],
      defaultHashPage: "basic"
    })

    if (tab) {
      const index = TAB_CONFIGS.findIndex((cfg) => cfg.id === tab)
      if (index >= 0) {
        setSelectedTabIndex(index)
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

  const getTabIndexFromId = useCallback(
    (tabId: string) => TAB_CONFIGS.findIndex((cfg) => cfg.id === tabId),
    []
  )

  const handleTabChange = useCallback((index: number) => {
    if (index < 0 || index >= TAB_CONFIGS.length) return
    setSelectedTabIndex(index)
    const tab = TAB_CONFIGS[index]
    updateUrlWithTab(tab.id, { hashPage: "basic" })
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
              }}>
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
                    }`}>
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
    </div>
  )
}
