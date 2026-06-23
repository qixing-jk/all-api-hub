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
  AccountRefresh: "accountRefresh:",
  ApiCheck: "apiCheck:",
  AutoCheckin: "autoCheckin:",
  AutoCheckinPretrigger: "autoCheckinPretrigger:",
  BalanceHistory: "balanceHistory:",
  CookieInterceptor: "cookieInterceptor:",
  Feedback: "feedback:",
  OpenSettings: "openSettings:",
  Permissions: "permissions:",
  RedemptionAssist: "redemptionAssist:",
} as const

type RuntimeActionPrefix =
  (typeof RuntimeActionPrefixes)[keyof typeof RuntimeActionPrefixes]

/**
 * Canonical runtime message `type` values used for broadcast updates.
 *
 * Values are part of the on-the-wire contract between extension contexts and MUST remain stable.
 */
export const RuntimeMessageTypes = {
  AccountKeyRepairProgress: "ACCOUNT_KEY_REPAIR_PROGRESS",
  TAG_STORE_UPDATE: "TAG_STORE_UPDATE",
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

  AccountRefreshCompleted: composeRuntimeAction(
    RuntimeActionPrefixes.AccountRefresh,
    "completed",
  ),

  ApiCheckContextMenuTrigger: composeRuntimeAction(
    RuntimeActionPrefixes.ApiCheck,
    "contextMenuTrigger",
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
  TempWindowTurnstileFetch: "tempWindowTurnstileFetch",
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
  OpenSettingsApiCredentialProfiles: composeRuntimeAction(
    RuntimeActionPrefixes.OpenSettings,
    "apiCredentialProfiles",
  ),
  OpenSettingsWebAiApiCheck: composeRuntimeAction(
    RuntimeActionPrefixes.OpenSettings,
    "webAiApiCheck",
  ),
  OpenFeedbackBugReport: composeRuntimeAction(
    RuntimeActionPrefixes.Feedback,
    "openBugReport",
  ),

  AutoCheckinRunCompleted: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckin,
    "runCompleted",
  ),
  AutoCheckinPretriggerStarted: composeRuntimeAction(
    RuntimeActionPrefixes.AutoCheckinPretrigger,
    "started",
  ),

  RedemptionAssistContextMenuTrigger: composeRuntimeAction(
    RuntimeActionPrefixes.RedemptionAssist,
    "contextMenuTrigger",
  ),

  BalanceHistoryDebugSeedEstimateSnapshots: composeRuntimeAction(
    RuntimeActionPrefixes.BalanceHistory,
    "debugSeedEstimateSnapshots",
  ),

  ContentGetLocalStorage: "getLocalStorage",
  ContentGetUserFromLocalStorage: "getUserFromLocalStorage",
  // Content-side protection guard checks used by temp-window fallback readiness gating.
  ContentCheckCapGuard: "checkCapGuard",
  ContentCheckCloudflareGuard: "checkCloudflareGuard",
  ContentWaitForTurnstileToken: "waitForTurnstileToken",
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
