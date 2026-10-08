import { DATA_TYPE_BALANCE, DATA_TYPE_CASHFLOW } from "~/constants"
import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_THEME_MODE } from "~/constants/theme"
import {
  DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
  DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
} from "~/services/preferences/contentScriptFeatureDefaults"
import { CURRENT_PREFERENCES_VERSION } from "~/services/preferences/migrations/preferencesMigration"
import {
  DEFAULT_AUTOMATIC_FEATURE_BYPASS,
  DEFAULT_TEMP_CONTEXT_PREFERENCE,
  DEFAULT_TEMP_WINDOW_SIZE,
} from "~/services/preferences/tempWindowFallbackPreferences"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import { ACCOUNT_KEY_AUTO_PROVISION_MODES } from "~/types/accountKeyAutoProvisioning"
import { AUTO_CHECKIN_SCHEDULE_MODE } from "~/types/autoCheckin"
import { DEFAULT_AXON_HUB_CONFIG } from "~/types/axonHubConfig"
import { DEFAULT_CLAUDE_CODE_HUB_CONFIG } from "~/types/claudeCodeHubConfig"
import { DEFAULT_CLAUDE_CODE_ROUTER_CONFIG } from "~/types/claudeCodeRouterConfig"
import { DEFAULT_CLI_PROXY_API_CONFIG } from "~/types/cliProxyApiConfig"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import { DEFAULT_DONE_HUB_CONFIG } from "~/types/doneHubConfig"
import { DEFAULT_GPT_LOAD_CONFIG } from "~/types/gptLoadConfig"
import { getDefaultLoggingPreferences } from "~/types/logging"
import { DEFAULT_MODEL_REDIRECT_PREFERENCES } from "~/types/managedSiteModelRedirect"
import { DEFAULT_NEW_API_CONFIG } from "~/types/newApiConfig"
import { DEFAULT_OCTOPUS_CONFIG } from "~/types/octopusConfig"
import { DEFAULT_OMNIROUTE_CONFIG } from "~/types/omnirouteConfig"
import { DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES } from "~/types/siteAnnouncements"
import { DEFAULT_SUB2API_MANAGED_SITE_CONFIG } from "~/types/sub2apiManagedSiteConfig"
import { DEFAULT_TASK_NOTIFICATION_PREFERENCES } from "~/types/taskNotifications"
import { DEFAULT_APPEARANCE } from "~/types/theme"
import { DEFAULT_USAGE_HISTORY_PREFERENCES } from "~/types/usageHistory"
import { DEFAULT_VELOERA_CONFIG } from "~/types/veloeraConfig"
import { DEFAULT_WEBDAV_SETTINGS } from "~/types/webdav"

import {
  TOOLBAR_ACTION_CLICK_BEHAVIORS,
  type UserPreferences,
} from "./preferencesSchema"

// Stable template used for field-level defaults.
// Use `createDefaultPreferences()` when a fresh preference object is required.

// 默认配置
export const DEFAULT_PREFERENCES: UserPreferences = {
  activeTab: DATA_TYPE_CASHFLOW,
  currencyType: "USD",
  showTodayCashflow: true,
  sortField: DATA_TYPE_BALANCE,
  sortOrder: "desc",
  actionClickBehavior: TOOLBAR_ACTION_CLICK_BEHAVIORS.Popup,
  openChangelogOnUpdate: true,
  autoProvisionKeyOnAccountAdd: false, // 默认关闭，避免添加账号时无意创建密钥
  autoProvisionKeyOnAccountAddMode: ACCOUNT_KEY_AUTO_PROVISION_MODES.Default,
  autoFillCurrentSiteUrlOnAccountAdd: true,
  warnOnDuplicateAccountAdd: true,
  accountAutoRefresh: DEFAULT_ACCOUNT_AUTO_REFRESH,
  usageHistory: DEFAULT_USAGE_HISTORY_PREFERENCES,
  balanceHistory: DEFAULT_BALANCE_HISTORY_PREFERENCES,
  showHealthStatus: true, // 默认显示健康状态
  webdav: DEFAULT_WEBDAV_SETTINGS,
  lastUpdated: 0,
  sharedPreferencesLastUpdated: 0,
  newApi: DEFAULT_NEW_API_CONFIG,
  doneHub: DEFAULT_DONE_HUB_CONFIG,
  veloera: DEFAULT_VELOERA_CONFIG,
  octopus: DEFAULT_OCTOPUS_CONFIG,
  axonHub: DEFAULT_AXON_HUB_CONFIG,
  claudeCodeHub: DEFAULT_CLAUDE_CODE_HUB_CONFIG,
  sub2apiManagedSite: DEFAULT_SUB2API_MANAGED_SITE_CONFIG,
  omniroute: DEFAULT_OMNIROUTE_CONFIG,
  gptLoad: DEFAULT_GPT_LOAD_CONFIG,
  managedSiteType: SITE_TYPES.NEW_API,
  cliProxyApi: DEFAULT_CLI_PROXY_API_CONFIG,
  claudeCodeRouter: DEFAULT_CLAUDE_CODE_ROUTER_CONFIG,
  managedSiteModelSync: {
    enabled: false,
    interval: 24 * 60 * 60 * 1000, // 24小时
    concurrency: 2, // 降低并发数，避免触发速率限制
    maxRetries: 2,
    channelProcessingTimeout: 0,
    rateLimit: {
      requestsPerMinute: 20, // 每分钟20个请求
      burst: 5, // 允许5个突发请求
    },
    allowedModels: [],
    globalChannelModelFilters: [],
  },
  autoCheckin: {
    globalEnabled: true,
    pretriggerDailyOnUiOpen: true,
    notifyUiOnCompletion: true,
    windowStart: "09:00",
    windowEnd: "23:00",
    scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.RANDOM,
    deterministicTime: "09:00",
    retryStrategy: {
      enabled: true,
      intervalMinutes: 30,
      maxAttemptsPerDay: 3,
    },
  },
  modelRedirect: DEFAULT_MODEL_REDIRECT_PREFERENCES,
  redemptionAssist: DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
  webAiApiCheck: DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
  sortingPriorityConfig: undefined,
  appearance: { ...DEFAULT_APPEARANCE },
  themeMode: DEFAULT_THEME_MODE,
  language: undefined, // Default to undefined to trigger browser detection
  logging: getDefaultLoggingPreferences(),
  preferencesVersion: CURRENT_PREFERENCES_VERSION,
  tempWindowFallback: {
    ...DEFAULT_TEMP_WINDOW_SIZE,
    enabled: true,
    automaticFeatureBypass: DEFAULT_AUTOMATIC_FEATURE_BYPASS,
    tempContextMode: DEFAULT_TEMP_CONTEXT_PREFERENCE,
  },
  tempWindowFallbackReminder: {
    dismissed: false,
  },
  taskNotifications: DEFAULT_TASK_NOTIFICATION_PREFERENCES,
  siteAnnouncementNotifications: DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
}

/**
 * Creates a new UserPreferences object with default values and current timestamps.
 * @param now - Optional timestamp to use for lastUpdated and sharedPreferencesLastUpdated (defaults to current time)
 */
export function createDefaultPreferences(now = Date.now()): UserPreferences {
  const timestamp = now

  return {
    ...structuredClone(DEFAULT_PREFERENCES),
    lastUpdated: timestamp,
    sharedPreferencesLastUpdated: timestamp,
  }
}
