/**
 * Canonical runtime message action prefixes.
 *
 * Prefixes are used to:
 * - Compose stable, namespaced action IDs (e.g., `permissions:check`)
 * - Route messages by feature prefix when a handler owns a namespace
 *
 * Values are part of the on-the-wire contract between extension contexts and MUST remain stable.
 */
export const RuntimeActionPrefixes = {
  AccountDialog: "accountDialog:",
  AccountKeyRepair: "accountKeyRepair:",
  ApiCheck: "apiCheck:",
  AutoCheckin: "autoCheckin:",
  AutoCheckinPretrigger: "autoCheckinPretrigger:",
  AutoRefresh: "autoRefresh:",
  BalanceHistory: "balanceHistory:",
  ChannelConfig: "channelConfig:",
  CookieInterceptor: "cookieInterceptor:",
  ExternalCheckIn: "externalCheckIn:",
  ModelSync: "modelSync:",
  OpenSettings: "openSettings:",
  Permissions: "permissions:",
  Preferences: "preferences:",
  RedemptionAssist: "redemptionAssist:",
  UsageHistory: "usageHistory:",
  WebdavAutoSync: "webdavAutoSync:",
} as const

export type RuntimeActionPrefix =
  (typeof RuntimeActionPrefixes)[keyof typeof RuntimeActionPrefixes]

/**
 * Canonical runtime message `type` values used for broadcast updates.
 *
 * Values are part of the on-the-wire contract between extension contexts and MUST remain stable.
 */
export const RuntimeMessageTypes = {
  AccountKeyRepairProgress: "ACCOUNT_KEY_REPAIR_PROGRESS",
} as const

/**
 * Canonical runtime message action IDs.
 *
 * Values are part of the on-the-wire contract between extension contexts and MUST remain stable.
 */
export const RuntimeActionIds = {
  AccountDialogImportCookieAuthSessionCookie: composeRuntimeAction(
    RuntimeActionPrefixes.AccountDialog,
    "importCookieAuthSessionCookie",
  ),

  AccountKeyRepairStart: composeRuntimeAction(
    RuntimeActionPrefixes.AccountKeyRepair,
    "start",
  ),
  AccountKeyRepairGetProgress: composeRuntimeAction(
    RuntimeActionPrefixes.AccountKeyRepair,
    "getProgress",
  ),

  ApiCheckContextMenuTrigger: composeRuntimeAction(
    RuntimeActionPrefixes.ApiCheck,
    "contextMenuTrigger",
  ),
  ApiCheckShouldPrompt: composeRuntimeAction(
    RuntimeActionPrefixes.ApiCheck,
    "shouldPrompt",
  ),
  ApiCheckFetchModels: composeRuntimeAction(
    RuntimeActionPrefixes.ApiCheck,
    "fetchModels",
  ),
  ApiCheckRunProbe: composeRuntimeAction(
    RuntimeActionPrefixes.ApiCheck,
    "runProbe",
  ),
  ApiCheckSaveProfile: composeRuntimeAction(
    RuntimeActionPrefixes.ApiCheck,
    "saveProfile",
  ),

  PermissionsCheck: composeRuntimeAction(
    RuntimeActionPrefixes.Permissions,
    "check",
  ),
  CloudflareGuardLog: "cloudflareGuardLog",

  OpenTempWindow: "openTempWindow",
  CloseTempWindow: "closeTempWindow",
  AutoDetectSite: "autoDetectSite",
  TempWindowFetch: "tempWindowFetch",
  TempWindowGetRenderedTitle: "tempWindowGetRenderedTitle",

  CookieInterceptorTrackUrl: composeRuntimeAction(
    RuntimeActionPrefixes.CookieInterceptor,
    "trackUrl",
  ),

  OpenSettingsCheckinRedeem: composeRuntimeAction(
    RuntimeActionPrefixes.OpenSettings,
    "checkinRedeem",
  ),
  OpenSettingsShieldBypass: composeRuntimeAction(
    RuntimeActionPrefixes.OpenSettings,
    "shieldBypass",
  ),

  PreferencesUpdateActionClickBehavior: composeRuntimeAction(
    RuntimeActionPrefixes.Preferences,
    "updateActionClickBehavior",
  ),
  PreferencesRefreshContextMenus: composeRuntimeAction(
    RuntimeActionPrefixes.Preferences,
    "refreshContextMenus",
  ),

  AutoRefreshSetup: composeRuntimeAction(
    RuntimeActionPrefixes.AutoRefresh,
    "setup",
  ),
  AutoRefreshRefreshNow: composeRuntimeAction(
    RuntimeActionPrefixes.AutoRefresh,
    "refreshNow",
  ),
  AutoRefreshStop: composeRuntimeAction(
    RuntimeActionPrefixes.AutoRefresh,
    "stop",
  ),
  AutoRefreshUpdateSettings: composeRuntimeAction(
    RuntimeActionPrefixes.AutoRefresh,
    "updateSettings",
  ),
  AutoRefreshGetStatus: composeRuntimeAction(
    RuntimeActionPrefixes.AutoRefresh,
    "getStatus",
  ),

  AutoCheckinRunNow: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckin,
    "runNow",
  ),
  AutoCheckinRunCompleted: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckin,
    "runCompleted",
  ),
  AutoCheckinDebugTriggerDailyAlarmNow: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckin,
    "debugTriggerDailyAlarmNow",
  ),
  AutoCheckinDebugTriggerRetryAlarmNow: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckin,
    "debugTriggerRetryAlarmNow",
  ),
  AutoCheckinDebugResetLastDailyRunDay: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckin,
    "debugResetLastDailyRunDay",
  ),
  AutoCheckinDebugScheduleDailyAlarmForToday: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckin,
    "debugScheduleDailyAlarmForToday",
  ),
  AutoCheckinPretriggerDailyOnUiOpen: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckin,
    "pretriggerDailyOnUiOpen",
  ),
  AutoCheckinRetryAccount: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckin,
    "retryAccount",
  ),
  AutoCheckinGetAccountInfo: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckin,
    "getAccountInfo",
  ),
  AutoCheckinGetStatus: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckin,
    "getStatus",
  ),
  AutoCheckinUpdateSettings: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckin,
    "updateSettings",
  ),
  AutoCheckinPretriggerStarted: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckinPretrigger,
    "started",
  ),

  ChannelConfigGet: composeRuntimeAction(
    RuntimeActionPrefixes.ChannelConfig,
    "get",
  ),
  ChannelConfigUpsertFilters: composeRuntimeAction(
    RuntimeActionPrefixes.ChannelConfig,
    "upsertFilters",
  ),

  ExternalCheckInOpenAndMark: composeRuntimeAction(
    RuntimeActionPrefixes.ExternalCheckIn,
    "openAndMark",
  ),

  ModelSyncGetNextRun: composeRuntimeAction(
    RuntimeActionPrefixes.ModelSync,
    "getNextRun",
  ),
  ModelSyncTriggerAll: composeRuntimeAction(
    RuntimeActionPrefixes.ModelSync,
    "triggerAll",
  ),
  ModelSyncTriggerSelected: composeRuntimeAction(
    RuntimeActionPrefixes.ModelSync,
    "triggerSelected",
  ),
  ModelSyncTriggerFailedOnly: composeRuntimeAction(
    RuntimeActionPrefixes.ModelSync,
    "triggerFailedOnly",
  ),
  ModelSyncGetLastExecution: composeRuntimeAction(
    RuntimeActionPrefixes.ModelSync,
    "getLastExecution",
  ),
  ModelSyncGetProgress: composeRuntimeAction(
    RuntimeActionPrefixes.ModelSync,
    "getProgress",
  ),
  ModelSyncUpdateSettings: composeRuntimeAction(
    RuntimeActionPrefixes.ModelSync,
    "updateSettings",
  ),
  ModelSyncGetPreferences: composeRuntimeAction(
    RuntimeActionPrefixes.ModelSync,
    "getPreferences",
  ),
  ModelSyncGetChannelUpstreamModelOptions: composeRuntimeAction(
    RuntimeActionPrefixes.ModelSync,
    "getChannelUpstreamModelOptions",
  ),
  ModelSyncListChannels: composeRuntimeAction(
    RuntimeActionPrefixes.ModelSync,
    "listChannels",
  ),

  RedemptionAssistUpdateSettings: composeRuntimeAction(
    RuntimeActionPrefixes.RedemptionAssist,
    "updateSettings",
  ),
  RedemptionAssistShouldPrompt: composeRuntimeAction(
    RuntimeActionPrefixes.RedemptionAssist,
    "shouldPrompt",
  ),
  RedemptionAssistAutoRedeem: composeRuntimeAction(
    RuntimeActionPrefixes.RedemptionAssist,
    "autoRedeem",
  ),
  RedemptionAssistAutoRedeemByUrl: composeRuntimeAction(
    RuntimeActionPrefixes.RedemptionAssist,
    "autoRedeemByUrl",
  ),
  RedemptionAssistContextMenuTrigger: composeRuntimeAction(
    RuntimeActionPrefixes.RedemptionAssist,
    "contextMenuTrigger",
  ),

  UsageHistoryUpdateSettings: composeRuntimeAction(
    RuntimeActionPrefixes.UsageHistory,
    "updateSettings",
  ),
  UsageHistorySyncNow: composeRuntimeAction(
    RuntimeActionPrefixes.UsageHistory,
    "syncNow",
  ),
  UsageHistoryPrune: composeRuntimeAction(
    RuntimeActionPrefixes.UsageHistory,
    "prune",
  ),

  BalanceHistoryUpdateSettings: composeRuntimeAction(
    RuntimeActionPrefixes.BalanceHistory,
    "updateSettings",
  ),
  BalanceHistoryRefreshNow: composeRuntimeAction(
    RuntimeActionPrefixes.BalanceHistory,
    "refreshNow",
  ),
  BalanceHistoryPrune: composeRuntimeAction(
    RuntimeActionPrefixes.BalanceHistory,
    "prune",
  ),

  WebdavAutoSyncSetup: composeRuntimeAction(
    RuntimeActionPrefixes.WebdavAutoSync,
    "setup",
  ),
  WebdavAutoSyncSyncNow: composeRuntimeAction(
    RuntimeActionPrefixes.WebdavAutoSync,
    "syncNow",
  ),
  WebdavAutoSyncStop: composeRuntimeAction(
    RuntimeActionPrefixes.WebdavAutoSync,
    "stop",
  ),
  WebdavAutoSyncUpdateSettings: composeRuntimeAction(
    RuntimeActionPrefixes.WebdavAutoSync,
    "updateSettings",
  ),
  WebdavAutoSyncGetStatus: composeRuntimeAction(
    RuntimeActionPrefixes.WebdavAutoSync,
    "getStatus",
  ),

  ContentGetLocalStorage: "getLocalStorage",
  ContentGetUserFromLocalStorage: "getUserFromLocalStorage",
  // Content-side protection guard checks used by temp-window fallback readiness gating.
  ContentCheckCapGuard: "checkCapGuard",
  ContentCheckCloudflareGuard: "checkCloudflareGuard",
  ContentWaitAndGetUserInfo: "waitAndGetUserInfo",
  ContentPerformTempWindowFetch: "performTempWindowFetch",
  ContentGetRenderedTitle: "getRenderedTitle",
  ContentShowShieldBypassUi: "showShieldBypassUi",
} as const

export type RuntimeActionId =
  (typeof RuntimeActionIds)[keyof typeof RuntimeActionIds]

/**
 * Null-safe prefix matcher for runtime action routing.
 * @param action Incoming runtime message action value.
 * @param prefix Canonical prefix to match against.
 */
export function hasRuntimeActionPrefix(
  action: unknown,
  prefix: RuntimeActionPrefix,
): boolean {
  return typeof action === "string" && action.startsWith(prefix)
}

/**
 * Compose a runtime action ID from a canonical prefix and a suffix.
 *
 * This is useful for feature routes that build actions dynamically while preserving
 * the shipped on-the-wire prefix conventions.
 */
export function composeRuntimeAction<
  P extends RuntimeActionPrefix,
  S extends string,
>(prefix: P, suffix: S): `${P}${S}` {
  return `${prefix}${suffix}`
}
