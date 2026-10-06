import {
  BASIC_SETTINGS_TAB_IDS,
  type BasicSettingsTabId,
} from "~/constants/basicSettingsTabs"
import { OPTIONAL_PERMISSIONS } from "~/services/permissions/permissionManager"

export const hasOptionalPermissions = OPTIONAL_PERMISSIONS.length > 0

export const BASIC_SETTINGS_TAB_ORDER: BasicSettingsTabId[] = [
  BASIC_SETTINGS_TAB_IDS.General,
  BASIC_SETTINGS_TAB_IDS.SiteAnnouncements,
  BASIC_SETTINGS_TAB_IDS.Notifications,
  BASIC_SETTINGS_TAB_IDS.AccountManagement,
  BASIC_SETTINGS_TAB_IDS.Refresh,
  BASIC_SETTINGS_TAB_IDS.CheckinRedeem,
  BASIC_SETTINGS_TAB_IDS.BalanceHistory,
  BASIC_SETTINGS_TAB_IDS.AccountUsage,
  BASIC_SETTINGS_TAB_IDS.WebAiApiCheck,
  BASIC_SETTINGS_TAB_IDS.ManagedSite,
  BASIC_SETTINGS_TAB_IDS.ClaudeCodeRouter,
  ...(hasOptionalPermissions
    ? ([BASIC_SETTINGS_TAB_IDS.Permissions] as const)
    : []),
  BASIC_SETTINGS_TAB_IDS.DataBackup,
]
