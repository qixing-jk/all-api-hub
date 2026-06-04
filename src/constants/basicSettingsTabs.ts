import { SETTINGS_ANCHORS } from "./settingsAnchors"

export type BasicSettingsTabId =
  | "general"
  | "notifications"
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

export const BASIC_SETTINGS_ANCHOR_TO_TAB: Record<string, BasicSettingsTabId> =
  {
    "general-display": "general",
    display: "general",
    appearance: "general",
    theme: "general",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS]: "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_ENABLED]: "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_PERMISSION]: "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_BROWSER]: "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_TELEGRAM]: "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_FEISHU]: "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_DINGTALK]: "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WECOM]: "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_NTFY]: "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WEBHOOK]: "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_AUTO_CHECKIN]: "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_WEBDAV_AUTO_SYNC]: "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_MANAGED_SITE_MODEL_SYNC]:
      "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_USAGE_HISTORY_SYNC]: "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_BALANCE_HISTORY_CAPTURE]:
      "notifications",
    [SETTINGS_ANCHORS.TASK_NOTIFICATIONS_SITE_ANNOUNCEMENTS]: "notifications",
    [SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS]: "general",
    [SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED]: "general",
    [SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_INTERVAL]: "general",
    [SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_PAGE]: "general",
    [SETTINGS_ANCHORS.BALANCE_HISTORY]: "balanceHistory",
    "account-management": "accountManagement",
    "auto-provision-key-on-account-add": "accountManagement",
    "sorting-priority": "accountManagement",
    sorting: "accountManagement",
    "auto-refresh": "refresh",
    refresh: "refresh",
    [SETTINGS_ANCHORS.AUTO_CHECKIN]: "checkinRedeem",
    "checkin-redeem": "checkinRedeem",
    checkin: "checkinRedeem",
    "web-ai-api-check": "webAiApiCheck",
    [SETTINGS_ANCHORS.USAGE_HISTORY_SYNC]: "accountUsage",
    "usage-history-sync-state": "accountUsage",
    webdav: "dataBackup",
    "webdav-auto-sync": "dataBackup",
    "import-export-entry": "dataBackup",
    "new-api": "managedSite",
    "new-api-model-sync": "managedSite",
    [SETTINGS_ANCHORS.MANAGED_SITE_MODEL_SYNC]: "managedSite",
    [SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR]: "managedSite",
    "cli-proxy": "cliProxy",
    "claude-code-router": "claudeCodeRouter",
    "dangerous-zone": "general",
    permissions: "permissions",
  }
