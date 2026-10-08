import type { TFunction } from "i18next"
import { lazy, type ComponentType } from "react"

import {
  BASIC_SETTINGS_TAB_IDS,
  type BasicSettingsTabId as TabId,
} from "~/constants/basicSettingsTabs"
import { OPTIONAL_PERMISSIONS } from "~/services/permissions/permissionManager"
import { assertNever } from "~/utils/core/assert"

import GeneralTab from "./components/tabs/General/GeneralTab"

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
const DataBackupTab = createLazyTabComponent(
  () => import("./components/tabs/DataBackup/DataBackupTab"),
)
const ManagedSiteTab = createLazyTabComponent(
  () => import("./components/tabs/ManagedSite/ManagedSiteTab"),
)
const NotificationsTab = createLazyTabComponent(
  () => import("./components/tabs/Notifications/NotificationsTab"),
)
const PermissionsTab = createLazyTabComponent(
  () => import("./components/tabs/Permissions/PermissionsTab"),
)
const AutoRefreshTab = createLazyTabComponent(
  () => import("./components/tabs/Refresh/AutoRefreshTab"),
)
const SiteAnnouncementsTab = createLazyTabComponent(
  () => import("./components/tabs/SiteAnnouncements/SiteAnnouncementsTab"),
)
const UsageHistorySyncTab = createLazyTabComponent(
  () => import("./components/tabs/UsageHistorySync/UsageHistorySyncTab"),
)
const WebAiApiCheckTab = createLazyTabComponent(
  () => import("./components/tabs/WebAiApiCheck/WebAiApiCheckTab"),
)

const PERMISSIONS_TAB_CONFIG: TabConfig = {
  id: BASIC_SETTINGS_TAB_IDS.Permissions,
  component: PermissionsTab,
}

export const TAB_CONFIGS = [
  { id: BASIC_SETTINGS_TAB_IDS.General, component: GeneralTab },
  {
    id: BASIC_SETTINGS_TAB_IDS.SiteAnnouncements,
    component: SiteAnnouncementsTab,
  },
  { id: BASIC_SETTINGS_TAB_IDS.Notifications, component: NotificationsTab },
  {
    id: BASIC_SETTINGS_TAB_IDS.AccountManagement,
    component: AccountManagementTab,
  },
  { id: BASIC_SETTINGS_TAB_IDS.Refresh, component: AutoRefreshTab },
  { id: BASIC_SETTINGS_TAB_IDS.CheckinRedeem, component: CheckinRedeemTab },
  { id: BASIC_SETTINGS_TAB_IDS.BalanceHistory, component: BalanceHistoryTab },
  { id: BASIC_SETTINGS_TAB_IDS.AccountUsage, component: UsageHistorySyncTab },
  { id: BASIC_SETTINGS_TAB_IDS.WebAiApiCheck, component: WebAiApiCheckTab },
  { id: BASIC_SETTINGS_TAB_IDS.ManagedSite, component: ManagedSiteTab },
  {
    id: BASIC_SETTINGS_TAB_IDS.ClaudeCodeRouter,
    component: ClaudeCodeRouterTab,
  },
  ...(hasOptionalPermissions ? [PERMISSIONS_TAB_CONFIG] : []),
  { id: BASIC_SETTINGS_TAB_IDS.DataBackup, component: DataBackupTab },
] satisfies TabConfig[]

export interface SettingsTabItem {
  id: TabId
  label: string
}

/**
 * Resolve the localized label for a known settings tab id.
 */
export function getSettingsTabLabel(t: TFunction, tabId: TabId): string {
  switch (tabId) {
    case BASIC_SETTINGS_TAB_IDS.General:
      return t("settings:tabs.general")
    case BASIC_SETTINGS_TAB_IDS.SiteAnnouncements:
      return t("settings:tabs.siteAnnouncements")
    case BASIC_SETTINGS_TAB_IDS.Notifications:
      return t("settings:tabs.notifications")
    case BASIC_SETTINGS_TAB_IDS.BalanceHistory:
      return t("settings:tabs.balanceHistory")
    case BASIC_SETTINGS_TAB_IDS.AccountManagement:
      return t("settings:tabs.accountManagement")
    case BASIC_SETTINGS_TAB_IDS.Refresh:
      return t("settings:tabs.refresh")
    case BASIC_SETTINGS_TAB_IDS.CheckinRedeem:
      return t("settings:tabs.checkinRedeem")
    case BASIC_SETTINGS_TAB_IDS.WebAiApiCheck:
      return t("settings:tabs.webAiApiCheck")
    case BASIC_SETTINGS_TAB_IDS.AccountUsage:
      return t("settings:tabs.accountUsage")
    case BASIC_SETTINGS_TAB_IDS.DataBackup:
      return t("settings:tabs.dataBackup")
    case BASIC_SETTINGS_TAB_IDS.ManagedSite:
      return t("settings:tabs.managedSite")
    case BASIC_SETTINGS_TAB_IDS.ClaudeCodeRouter:
      return t("settings:tabs.claudeCodeRouter")
    case BASIC_SETTINGS_TAB_IDS.Permissions:
      return t("settings:tabs.permissions")
    default:
      return assertNever(tabId, `Unexpected settings tab id: ${tabId}`)
  }
}
