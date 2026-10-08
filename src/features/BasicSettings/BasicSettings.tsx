import { Settings } from "lucide-react"
import { Suspense, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/components/ui"

import LoadingSkeleton from "./components/shared/LoadingSkeleton"
import { DesktopSettingsTabs } from "./DesktopSettingsTabs"
import {
  getSettingsTabLabel,
  TAB_CONFIGS,
  type SettingsTabItem,
} from "./settingsTabRegistry"
import { BASIC_SETTINGS_TEST_IDS } from "./testIds"
import { useBasicSettingsNavigation } from "./useBasicSettingsNavigation"

/**
 * Localized fallback shown while a lazily loaded settings tab chunk is being fetched.
 */
function SettingsTabContentFallback() {
  const { t } = useTranslation("common")

  return (
    <div
      className="flex min-h-[240px] items-center justify-center"
      data-options-page-pending
    >
      <Spinner size="lg" aria-label={t("status.loading")} />
    </div>
  )
}

/**
 * Basic Settings page: renders tabs for all settings sections and handles URL syncing.
 */
export default function BasicSettings() {
  const { t } = useTranslation("settings")
  const { selectedTabId, mountedTabIds, isInitialLoading, selectTab } =
    useBasicSettingsNavigation(TAB_CONFIGS)

  const tabs = useMemo<SettingsTabItem[]>(
    () =>
      TAB_CONFIGS.map((config) => ({
        id: config.id,
        label: getSettingsTabLabel(t, config.id),
      })),
    [t],
  )

  if (isInitialLoading) {
    return <LoadingSkeleton />
  }

  return (
    <div
      className="py-density-4 sm:py-density-6 px-4 sm:px-6"
      data-testid={BASIC_SETTINGS_TEST_IDS.page}
    >
      <PageHeader
        icon={Settings}
        title={t("title")}
        description={t("description")}
      />

      <Tabs
        data-page-motion-group
        value={selectedTabId}
        onValueChange={selectTab}
      >
        <TabsList className="sr-only">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mb-density-6">
          <div className="mb-density-4 md:hidden">
            <label className="sr-only" htmlFor="settings-tab-select">
              {t("tabs.select")}
            </label>
            <Select value={selectedTabId} onValueChange={selectTab}>
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

          <DesktopSettingsTabs
            tabs={tabs}
            selectedTabId={selectedTabId}
            onTabSelect={selectTab}
          />
        </div>

        {TAB_CONFIGS.map((config) => {
          const Component = config.component
          return (
            <TabsContent
              key={config.id}
              value={config.id}
              forceMount
              data-page-motion-group
              className="data-[state=inactive]:hidden"
            >
              {mountedTabIds.includes(config.id) ? (
                <Suspense fallback={<SettingsTabContentFallback />}>
                  <Component />
                </Suspense>
              ) : null}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
