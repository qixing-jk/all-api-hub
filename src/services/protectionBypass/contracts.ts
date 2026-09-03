import { OCTOPUS_LOGIN_PATH } from "~/constants/octopus"
import { isAccountSiteType, type AccountSiteType } from "~/constants/siteType"
import {
  OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH,
  type TempWindowOpenRouterManagementKeyActionParams,
  type TempWindowOpenRouterManagementKeyActionResult,
} from "~/services/apiAdapters/openrouter/managementKeyPageContract"
import { AuthTypeEnum } from "~/types/auth"
import {
  OCTOPUS_API_RESOURCE_BINDINGS,
  TEMP_WINDOW_REQUEST_SOURCES,
  type TempWindowRequestSource,
  type TempWindowResponseType,
} from "~/types/tempWindowFetch"
import type {
  TempWindowCheckinPageAction,
  TempWindowCheckinPageActionParams,
  TempWindowFetch,
  TempWindowFetchParams,
  TempWindowOctopusApiFetchParams,
  TempWindowOpenContextResult,
  TempWindowRenderedTitleParams,
  TempWindowRenderedTitleResponse,
  TempWindowTurnstileFetch,
  TempWindowTurnstileFetchParams,
} from "~/types/tempWindowFetch"
import { isPlainObject } from "~/utils/core/object"
import { isHttpUrl } from "~/utils/core/urlParsing"

export const PROTECTION_BYPASS_EXECUTION_VERSION = 2 as const

export const PROTECTION_BYPASS_EXECUTION_KINDS = {
  UserCommand: "user_command",
  Automatic: "automatic",
} as const

export type ProtectionBypassExecutionKind =
  (typeof PROTECTION_BYPASS_EXECUTION_KINDS)[keyof typeof PROTECTION_BYPASS_EXECUTION_KINDS]

export const PROTECTION_BYPASS_DECISION_RESULTS = {
  Allowed: "allowed",
  Denied: "denied",
  Unavailable: "unavailable",
} as const

export type ProtectionBypassDecisionResult =
  (typeof PROTECTION_BYPASS_DECISION_RESULTS)[keyof typeof PROTECTION_BYPASS_DECISION_RESULTS]

export type ProtectionBypassDecisionKind = Exclude<
  ProtectionBypassDecisionResult,
  typeof PROTECTION_BYPASS_DECISION_RESULTS.Unavailable
>

export const PROTECTION_BYPASS_CAPABILITY_KINDS = {
  Available: "available",
  PermissionRequired: "permission_required",
  UnsupportedEnvironment: "unsupported_environment",
  AdapterUnavailable: "adapter_unavailable",
} as const

const PROTECTION_BYPASS_DENIED_REASON_CATALOG = {
  AutomaticDisabled: "automatic_disabled",
  FeatureDisabled: "feature_disabled",
  MissingExecution: "missing_execution",
  InvalidExecution: "invalid_execution",
  TaskNotPermitted: "task_not_permitted",
  ResourceStale: "resource_stale",
  PermissionRequired: "permission_required",
  UnsupportedEnvironment: "unsupported_environment",
  PolicyUnavailable: "policy_unavailable",
} as const

export type ProtectionBypassDeniedReason =
  (typeof PROTECTION_BYPASS_DENIED_REASONS)[keyof typeof PROTECTION_BYPASS_DENIED_REASONS]

const PROTECTION_BYPASS_FEATURE_CATALOG = {
  AccountRefresh: "account_refresh",
  BalanceHistory: "balance_history",
  Checkin: "checkin",
  RedemptionAssist: "redemption_assist",
  LdohSiteLookup: "ldoh_site_lookup",
  KeyManagement: "key_management",
  ManagedSiteChannels: "managed_site_channels",
  ManagedSiteModelSync: "managed_site_model_sync",
  AccountOnboarding: "account_onboarding",
} as const

export const PROTECTION_BYPASS_DENIED_REASONS =
  PROTECTION_BYPASS_DENIED_REASON_CATALOG

export const PROTECTION_BYPASS_FEATURES = PROTECTION_BYPASS_FEATURE_CATALOG

export type ProtectionBypassFeature =
  (typeof PROTECTION_BYPASS_FEATURES)[keyof typeof PROTECTION_BYPASS_FEATURES]

export const PROTECTION_BYPASS_AUTOMATIC_FEATURES = {
  AccountRefresh: PROTECTION_BYPASS_FEATURES.AccountRefresh,
  BalanceHistory: PROTECTION_BYPASS_FEATURES.BalanceHistory,
  Checkin: PROTECTION_BYPASS_FEATURES.Checkin,
  RedemptionAssist: PROTECTION_BYPASS_FEATURES.RedemptionAssist,
  LdohSiteLookup: PROTECTION_BYPASS_FEATURES.LdohSiteLookup,
  KeyManagement: PROTECTION_BYPASS_FEATURES.KeyManagement,
  ManagedSiteChannels: PROTECTION_BYPASS_FEATURES.ManagedSiteChannels,
  ManagedSiteModelSync: PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
} as const satisfies Record<string, ProtectionBypassFeature>

export type ProtectionBypassAutomaticFeature =
  (typeof PROTECTION_BYPASS_AUTOMATIC_FEATURES)[keyof typeof PROTECTION_BYPASS_AUTOMATIC_FEATURES]

const PROTECTION_BYPASS_USER_COMMAND_CATALOG = {
  RefreshAccount: "refresh_account",
  RefreshAllAccounts: "refresh_all_accounts",
  RefreshDisabledAccounts: "refresh_disabled_accounts",
  ManualCheckin: "manual_checkin",
  RetryCheckinAccount: "retry_checkin_account",
  AddAccount: "add_account",
  DetectAccount: "detect_account",
  ReauthenticateAccount: "reauthenticate_account",
  ManageApiKeys: "manage_api_keys",
  ManageSiteChannels: "manage_site_channels",
  SyncManagedSiteModels: "sync_managed_site_models",
} as const

export const PROTECTION_BYPASS_USER_COMMANDS =
  PROTECTION_BYPASS_USER_COMMAND_CATALOG

export type ProtectionBypassUserCommand =
  (typeof PROTECTION_BYPASS_USER_COMMANDS)[keyof typeof PROTECTION_BYPASS_USER_COMMANDS]

export const PROTECTION_BYPASS_OPERATIONS = {
  Fetch: "fetch",
  TurnstileFetch: "turnstile_fetch",
  NativePageAction: "native_page_action",
  RenderedTitle: "rendered_title",
  SessionRead: "session_read",
  OpenContext: "open_context",
} as const

export type ProtectionBypassOperation =
  (typeof PROTECTION_BYPASS_OPERATIONS)[keyof typeof PROTECTION_BYPASS_OPERATIONS]

export const PROTECTION_BYPASS_USER_COMMAND_FEATURES = {
  [PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount]:
    PROTECTION_BYPASS_FEATURES.AccountRefresh,
  [PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts]:
    PROTECTION_BYPASS_FEATURES.AccountRefresh,
  [PROTECTION_BYPASS_USER_COMMANDS.RefreshDisabledAccounts]:
    PROTECTION_BYPASS_FEATURES.AccountRefresh,
  [PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin]:
    PROTECTION_BYPASS_FEATURES.Checkin,
  [PROTECTION_BYPASS_USER_COMMANDS.RetryCheckinAccount]:
    PROTECTION_BYPASS_FEATURES.Checkin,
  [PROTECTION_BYPASS_USER_COMMANDS.AddAccount]:
    PROTECTION_BYPASS_FEATURES.AccountOnboarding,
  [PROTECTION_BYPASS_USER_COMMANDS.DetectAccount]:
    PROTECTION_BYPASS_FEATURES.AccountOnboarding,
  [PROTECTION_BYPASS_USER_COMMANDS.ReauthenticateAccount]:
    PROTECTION_BYPASS_FEATURES.AccountOnboarding,
  [PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys]:
    PROTECTION_BYPASS_FEATURES.KeyManagement,
  [PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels]:
    PROTECTION_BYPASS_FEATURES.ManagedSiteChannels,
  [PROTECTION_BYPASS_USER_COMMANDS.SyncManagedSiteModels]:
    PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
} as const satisfies Record<
  ProtectionBypassUserCommand,
  ProtectionBypassFeature
>

/** Checks an untrusted user-command enum at the background boundary. */
function isProtectionBypassUserCommand(
  value: unknown,
): value is ProtectionBypassUserCommand {
  return Object.values(PROTECTION_BYPASS_USER_COMMANDS).includes(
    value as ProtectionBypassUserCommand,
  )
}

export const PROTECTION_BYPASS_CAUSES = {
  ApiErrorFallback: "api_error_fallback",
  BrowserProfileIsolation: "browser_profile_isolation",
  VerificationRequired: "verification_required",
  RenderedPageRequired: "rendered_page_required",
  SessionRequired: "session_required",
  ExplicitContext: "explicit_context",
} as const

export type ProtectionBypassCause =
  (typeof PROTECTION_BYPASS_CAUSES)[keyof typeof PROTECTION_BYPASS_CAUSES]

export const PROTECTION_BYPASS_AUTOMATIC_TRIGGERS = {
  UiLifecycle: "ui_lifecycle",
  Scheduled: "scheduled",
  Retry: "retry",
  BackgroundRecovery: "background_recovery",
} as const

export type ProtectionBypassAutomaticTrigger =
  (typeof PROTECTION_BYPASS_AUTOMATIC_TRIGGERS)[keyof typeof PROTECTION_BYPASS_AUTOMATIC_TRIGGERS]

export const PROTECTION_BYPASS_SURFACES = TEMP_WINDOW_REQUEST_SOURCES

export type ProtectionBypassSurface = TempWindowRequestSource

export interface NewApiChannelKeyResource {
  origin: string
  userId: string
  channelId: number
}

export const INVALID_PROTECTION_BYPASS_EXECUTION_ERROR =
  "Invalid protection bypass execution"

export type ProtectionBypassExecution =
  | {
      readonly version: typeof PROTECTION_BYPASS_EXECUTION_VERSION
      readonly kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand
      readonly command: ProtectionBypassUserCommand
      readonly surface: ProtectionBypassSurface
    }
  | {
      readonly version: typeof PROTECTION_BYPASS_EXECUTION_VERSION
      readonly kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.Automatic
      readonly feature: ProtectionBypassAutomaticFeature
      readonly trigger: ProtectionBypassAutomaticTrigger
      readonly surface: ProtectionBypassSurface
    }

/** Builds explicit automatic intent without inferring it from the caller. */
export function createAutomaticProtectionBypassExecution(
  feature: ProtectionBypassAutomaticFeature,
  trigger: ProtectionBypassAutomaticTrigger,
  surface: ProtectionBypassSurface,
): Extract<
  ProtectionBypassExecution,
  { kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.Automatic }
> {
  return Object.freeze({
    version: PROTECTION_BYPASS_EXECUTION_VERSION,
    kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
    feature,
    trigger,
    surface,
  })
}

/** Validates untrusted runtime execution metadata before it reaches storage. */
export function isProtectionBypassExecution(
  value: unknown,
): value is ProtectionBypassExecution {
  if (!value || typeof value !== "object") return false
  const execution = value as Record<string, unknown>
  if (execution.version !== PROTECTION_BYPASS_EXECUTION_VERSION) return false

  if (execution.kind === PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand) {
    return (
      Object.keys(execution).every((key) =>
        ["version", "kind", "command", "surface"].includes(key),
      ) &&
      isProtectionBypassUserCommand(execution.command) &&
      Object.values(PROTECTION_BYPASS_SURFACES).includes(
        execution.surface as ProtectionBypassSurface,
      )
    )
  }

  return (
    execution.kind === PROTECTION_BYPASS_EXECUTION_KINDS.Automatic &&
    Object.keys(execution).every((key) =>
      ["version", "kind", "feature", "trigger", "surface"].includes(key),
    ) &&
    Object.values(PROTECTION_BYPASS_AUTOMATIC_FEATURES).includes(
      execution.feature as ProtectionBypassAutomaticFeature,
    ) &&
    Object.values(PROTECTION_BYPASS_AUTOMATIC_TRIGGERS).includes(
      execution.trigger as ProtectionBypassAutomaticTrigger,
    ) &&
    Object.values(PROTECTION_BYPASS_SURFACES).includes(
      execution.surface as ProtectionBypassSurface,
    )
  )
}

/** Accepts only the explicit refresh-all command for manual refresh-now routes. */
export function isRefreshAllAccountsProtectionBypassExecution(
  value: unknown,
): value is Extract<
  ProtectionBypassExecution,
  { kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand }
> {
  if (!isProtectionBypassExecution(value)) return false
  return (
    value.kind === PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand &&
    value.command === PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts
  )
}

/** Accepts automatic account refresh plus the explicit refresh-all command. */
export function isAutoRefreshProtectionBypassExecution(
  value: unknown,
): value is ProtectionBypassExecution {
  if (!isProtectionBypassExecution(value)) return false
  return value.kind === PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand
    ? value.command === PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts
    : value.feature === PROTECTION_BYPASS_FEATURES.AccountRefresh
}

/** Accepts only the explicit model-sync command used by model-sync UI actions. */
export function isManualModelSyncProtectionBypassExecution(
  value: unknown,
): value is Extract<
  ProtectionBypassExecution,
  { kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand }
> {
  return (
    isProtectionBypassExecution(value) &&
    value.kind === PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand &&
    value.command === PROTECTION_BYPASS_USER_COMMANDS.SyncManagedSiteModels
  )
}

export type ResolvedProtectionBypassExecution =
  | {
      readonly version: typeof PROTECTION_BYPASS_EXECUTION_VERSION
      readonly kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.Automatic
      readonly feature: ProtectionBypassAutomaticFeature
      readonly trigger: ProtectionBypassAutomaticTrigger
      readonly surface: ProtectionBypassSurface
    }
  | {
      readonly version: typeof PROTECTION_BYPASS_EXECUTION_VERSION
      readonly kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand
      readonly command: ProtectionBypassUserCommand
      readonly feature: ProtectionBypassFeature
      readonly surface: ProtectionBypassSurface
    }

export type ProtectionBypassExecutionResolutionFailure = {
  kind: "invalid"
  reason:
    | typeof PROTECTION_BYPASS_DENIED_REASONS.MissingExecution
    | typeof PROTECTION_BYPASS_DENIED_REASONS.InvalidExecution
}

export interface TempWindowSessionReadParams {
  url: string
  requestId: string
  useIncognito?: boolean
  suppressMinimize?: boolean
  siteType: AccountSiteType
  tempWindowRequestSource?: TempWindowRequestSource
  protectionBypassExecution: ProtectionBypassExecution
}

export const NEW_API_SESSION_READ_ACTIONS = {
  ChannelKey: "channel_key",
} as const

export interface TempWindowNewApiSessionReadParams {
  origin: string
  action: (typeof NEW_API_SESSION_READ_ACTIONS)[keyof typeof NEW_API_SESSION_READ_ACTIONS]
  channelId: number
  userId: string
  requestId?: string
  tempWindowRequestSource?: TempWindowRequestSource
  protectionBypassExecution: ProtectionBypassExecution
}

export interface OpenTempContextParams {
  url: string
  requestId: string
  suppressMinimize?: boolean
  tempWindowRequestSource?: TempWindowRequestSource
  protectionBypassExecution: ProtectionBypassExecution
}

export const TEMP_CONTEXT_TASK_KINDS = {
  ApiFallbackFetch: "api_fallback_fetch",
  ProfileIsolatedFetch: "profile_isolated_fetch",
  TurnstileFetch: "turnstile_fetch",
  NativePageAction: "native_page_action",
  OpenRouterManagementKeyAction: "openrouter_management_key_action",
  RenderedTitle: "rendered_title",
  SessionRead: "session_read",
  NewApiSessionRead: "new_api_session_read",
  OctopusApiFetch: "octopus_api_fetch",
  OpenContext: "open_context",
} as const

/**
 * Public task-kind contract shared by task dispatch and policy metadata.
 */
/* @public */
export type TempContextTaskKind =
  (typeof TEMP_CONTEXT_TASK_KINDS)[keyof typeof TEMP_CONTEXT_TASK_KINDS]

export type TempWindowFetchTaskKind =
  | typeof TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch
  | typeof TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch

type WithoutProtectionBypassIntent<T> = Omit<
  T,
  "protectionBypassExecution" | "tempWindowRequestSource"
>

export type TempContextTask =
  | {
      kind: typeof TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch
      params: WithoutProtectionBypassIntent<TempWindowFetchParams>
    }
  | {
      kind: typeof TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch
      params: WithoutProtectionBypassIntent<TempWindowFetchParams>
    }
  | {
      kind: typeof TEMP_CONTEXT_TASK_KINDS.TurnstileFetch
      params: WithoutProtectionBypassIntent<TempWindowTurnstileFetchParams>
    }
  | {
      kind: typeof TEMP_CONTEXT_TASK_KINDS.NativePageAction
      params: WithoutProtectionBypassIntent<TempWindowCheckinPageActionParams>
    }
  | {
      kind: typeof TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction
      params: WithoutProtectionBypassIntent<TempWindowOpenRouterManagementKeyActionParams>
    }
  | {
      kind: typeof TEMP_CONTEXT_TASK_KINDS.RenderedTitle
      params: WithoutProtectionBypassIntent<TempWindowRenderedTitleParams>
    }
  | {
      kind: typeof TEMP_CONTEXT_TASK_KINDS.SessionRead
      params: WithoutProtectionBypassIntent<TempWindowSessionReadParams>
    }
  | {
      kind: typeof TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead
      params: WithoutProtectionBypassIntent<TempWindowNewApiSessionReadParams>
    }
  | {
      kind: typeof TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch
      params: WithoutProtectionBypassIntent<TempWindowOctopusApiFetchParams>
    }
  | {
      kind: typeof TEMP_CONTEXT_TASK_KINDS.OpenContext
      params: WithoutProtectionBypassIntent<OpenTempContextParams>
    }

export type ProtectionBypassExecuteRequest<
  TTask extends TempContextTask = TempContextTask,
> = {
  execution: ProtectionBypassExecution
  task: TTask
}

type TempContextTaskResultMap = {
  [TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch]: TempWindowFetch
  [TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch]: TempWindowFetch
  [TEMP_CONTEXT_TASK_KINDS.TurnstileFetch]: TempWindowTurnstileFetch
  [TEMP_CONTEXT_TASK_KINDS.NativePageAction]: TempWindowCheckinPageAction
  [TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction]: TempWindowOpenRouterManagementKeyActionResult
  [TEMP_CONTEXT_TASK_KINDS.RenderedTitle]: TempWindowRenderedTitleResponse
  [TEMP_CONTEXT_TASK_KINDS.SessionRead]: TempWindowFetch
  [TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead]: TempWindowFetch
  [TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch]: TempWindowFetch
  [TEMP_CONTEXT_TASK_KINDS.OpenContext]: TempWindowOpenContextResult
}

export type TempContextTaskResult<TTask extends TempContextTask> =
  TempContextTaskResultMap[TTask["kind"]]

const TEMP_CONTEXT_TASK_KIND_SET = new Set<TempContextTaskKind>(
  Object.values(TEMP_CONTEXT_TASK_KINDS),
)

const NEW_API_SESSION_READ_PARAM_KEYS = new Set([
  "origin",
  "action",
  "channelId",
  "userId",
  "requestId",
])

type OctopusApiFetchTaskParams = Extract<
  TempContextTask,
  { kind: typeof TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch }
>["params"]

const OCTOPUS_API_FETCH_PARAM_KEY_RECORD = {
  originUrl: true,
  resourceUsername: true,
  fetchUrl: true,
  fetchOptions: true,
  requestId: true,
  responseType: true,
  resourceBinding: true,
} satisfies Record<keyof OctopusApiFetchTaskParams, true>

const OCTOPUS_API_FETCH_PARAM_KEYS = new Set(
  Object.keys(OCTOPUS_API_FETCH_PARAM_KEY_RECORD),
)

const TEMP_WINDOW_RESPONSE_TYPES = new Set<TempWindowResponseType>([
  "json",
  "text",
  "arrayBuffer",
  "blob",
])

const AUTH_TYPE_VALUES = new Set<AuthTypeEnum>(Object.values(AuthTypeEnum))

/** Checks one required non-empty string field. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

/** Checks an optional string without imposing feature-specific semantics. */
function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string"
}

/** Checks an optional non-empty request identifier. */
function isOptionalRequestId(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value)
}

/** Checks an optional boolean presentation/runtime flag. */
function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean"
}

/** Checks an optional positive finite duration. */
function isOptionalPositiveNumber(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value) && value > 0)
  )
}

/** Checks optional shared fetch fields without duplicating RequestInit. */
function hasValidSharedFetchParams(value: Record<string, unknown>): boolean {
  return (
    isHttpUrl(value.originUrl) &&
    isHttpUrl(value.fetchUrl) &&
    (value.fetchOptions === undefined || isPlainObject(value.fetchOptions)) &&
    isOptionalRequestId(value.requestId) &&
    (value.responseType === undefined ||
      TEMP_WINDOW_RESPONSE_TYPES.has(
        value.responseType as TempWindowResponseType,
      )) &&
    (value.tempContextTaskKind === undefined ||
      value.tempContextTaskKind === TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch ||
      value.tempContextTaskKind ===
        TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch) &&
    isOptionalBoolean(value.suppressMinimize) &&
    isOptionalBoolean(value.useIncognito) &&
    isOptionalString(value.accountId) &&
    (value.authType === undefined ||
      AUTH_TYPE_VALUES.has(value.authType as AuthTypeEnum)) &&
    isOptionalString(value.cookieAuthSessionCookie) &&
    isOptionalString(value.cookieStoreId)
  )
}

/** Checks the OpenRouter task fields read before page-action dispatch. */
function isOpenRouterManagementKeyActionParams(
  value: Record<string, unknown>,
): boolean {
  if (!isPlainObject(value.operation)) return false
  return (
    isNonEmptyString(value.requestId) &&
    value.operation.kind === "create" &&
    isNonEmptyString(value.operation.label) &&
    value.operation.label.length <=
      OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH &&
    isOptionalBoolean(value.suppressMinimize)
  )
}

/** Checks the fields read by the native page-action handler. */
function isNativePageActionParams(value: Record<string, unknown>): boolean {
  return (
    isHttpUrl(value.originUrl) &&
    isHttpUrl(value.pageUrl) &&
    isAccountSiteType(value.siteType) &&
    isNonEmptyString(value.expectedUserId) &&
    isOptionalRequestId(value.requestId) &&
    isOptionalBoolean(value.suppressMinimize) &&
    isOptionalString(value.accountId) &&
    (value.authType === undefined ||
      AUTH_TYPE_VALUES.has(value.authType as AuthTypeEnum)) &&
    isOptionalString(value.cookieAuthSessionCookie) &&
    isOptionalString(value.cookieStoreId) &&
    (value.trigger === undefined || isPlainObject(value.trigger))
  )
}

/** Accepts only a canonical HTTP(S) origin without path, query, or credentials. */
function isCanonicalHttpOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false
  try {
    const parsed = new URL(value)
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.origin === value
    )
  } catch {
    return false
  }
}

/** Validates the closed New API session-read envelope. */
function isTempWindowNewApiSessionReadParams(
  value: Record<string, unknown>,
): boolean {
  return (
    Object.keys(value).every((key) =>
      NEW_API_SESSION_READ_PARAM_KEYS.has(key),
    ) &&
    isCanonicalHttpOrigin(value.origin) &&
    value.action === NEW_API_SESSION_READ_ACTIONS.ChannelKey &&
    typeof value.channelId === "number" &&
    Number.isSafeInteger(value.channelId) &&
    value.channelId > 0 &&
    typeof value.userId === "string" &&
    value.userId.trim() === value.userId &&
    value.userId.length > 0 &&
    (value.requestId === undefined ||
      (typeof value.requestId === "string" && value.requestId.length > 0))
  )
}

// Octopus v0.13 reads channel inventory through stats and loads detail on demand.
// Contract: https://github.com/bestruirui/octopus/blob/27aa40dc0f3b2902bce3e96ccdba019d17041606/web/src/api/channel.ts
const OCTOPUS_V013_READ_ENDPOINT_METHODS = [
  { pattern: /^\/api\/v1\/channel\/stats$/u, method: "GET" },
  {
    pattern: /^\/api\/v1\/channel\/detail\/[1-9]\d*$/u,
    method: "GET",
  },
] as const

const OCTOPUS_ENDPOINT_METHODS = [
  { pattern: new RegExp(`^${OCTOPUS_LOGIN_PATH}$`, "u"), method: "POST" },
  { pattern: /^\/api\/v1\/channel\/list$/u, method: "GET" },
  ...OCTOPUS_V013_READ_ENDPOINT_METHODS,
  {
    pattern: /^\/api\/v1\/channel\/(?:create|update|fetch-model)$/u,
    method: "POST",
  },
  { pattern: /^\/api\/v1\/channel\/delete\/[1-9]\d*$/u, method: "DELETE" },
  { pattern: /^\/api\/v1\/(?:model|group)\/list$/u, method: "GET" },
] as const

const OCTOPUS_CONFIGURATION_TEST_ENDPOINT_METHODS = [
  { pattern: new RegExp(`^${OCTOPUS_LOGIN_PATH}$`, "u"), method: "POST" },
  { pattern: /^\/api\/v1\/channel\/list$/u, method: "GET" },
  ...OCTOPUS_V013_READ_ENDPOINT_METHODS,
] as const

/** Validates the narrow Octopus endpoint allow-list at the runtime boundary. */
function isTempWindowOctopusApiFetchParams(
  value: Record<string, unknown>,
): boolean {
  if (
    !Object.keys(value).every((key) => OCTOPUS_API_FETCH_PARAM_KEYS.has(key))
  ) {
    return false
  }
  if (
    !isCanonicalHttpOrigin(value.originUrl) ||
    !isNonEmptyString(value.resourceUsername) ||
    !isHttpUrl(value.fetchUrl)
  ) {
    return false
  }
  if (value.fetchOptions !== undefined && !isPlainObject(value.fetchOptions)) {
    return false
  }
  if (
    !isOptionalRequestId(value.requestId) ||
    (value.responseType !== undefined && value.responseType !== "json") ||
    (value.resourceBinding !== undefined &&
      value.resourceBinding !== OCTOPUS_API_RESOURCE_BINDINGS.ConfigurationTest)
  ) {
    return false
  }

  const fetchUrl = new URL(value.fetchUrl)
  const options = (value.fetchOptions ?? {}) as Record<string, unknown>
  const method =
    typeof options.method === "string" ? options.method.toUpperCase() : "GET"
  const endpointIsAllowed = OCTOPUS_ENDPOINT_METHODS.some(
    (endpoint) =>
      endpoint.method === method && endpoint.pattern.test(fetchUrl.pathname),
  )
  const configurationTestEndpointIsAllowed =
    value.resourceBinding !== OCTOPUS_API_RESOURCE_BINDINGS.ConfigurationTest ||
    OCTOPUS_CONFIGURATION_TEST_ENDPOINT_METHODS.some(
      (endpoint) =>
        endpoint.method === method && endpoint.pattern.test(fetchUrl.pathname),
    )
  return (
    fetchUrl.origin === value.originUrl &&
    fetchUrl.search === "" &&
    fetchUrl.hash === "" &&
    endpointIsAllowed &&
    configurationTestEndpointIsAllowed
  )
}

/** Validates the discriminated task envelope at the runtime boundary. */
export function isTempContextTask(value: unknown): value is TempContextTask {
  if (!isPlainObject(value)) return false
  const task = value
  const hasKnownKindAndParams =
    typeof task.kind === "string" &&
    TEMP_CONTEXT_TASK_KIND_SET.has(task.kind as TempContextTaskKind) &&
    isPlainObject(task.params)
  if (!hasKnownKindAndParams) return false
  const params = task.params as Record<string, unknown>
  if (
    Object.prototype.hasOwnProperty.call(params, "protectionBypassExecution") ||
    Object.prototype.hasOwnProperty.call(params, "tempWindowRequestSource")
  ) {
    return false
  }
  switch (task.kind) {
    case TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch:
    case TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch:
      return hasValidSharedFetchParams(params)
    case TEMP_CONTEXT_TASK_KINDS.TurnstileFetch:
      return (
        hasValidSharedFetchParams(params) &&
        isHttpUrl(params.pageUrl) &&
        isOptionalPositiveNumber(params.turnstileTimeoutMs) &&
        isOptionalString(params.turnstileParamName) &&
        (params.turnstilePreTrigger === undefined ||
          isPlainObject(params.turnstilePreTrigger))
      )
    case TEMP_CONTEXT_TASK_KINDS.NativePageAction:
      return isNativePageActionParams(params)
    case TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction:
      return isOpenRouterManagementKeyActionParams(params)
    case TEMP_CONTEXT_TASK_KINDS.RenderedTitle:
      return (
        isHttpUrl(params.originUrl) &&
        isOptionalRequestId(params.requestId) &&
        isOptionalBoolean(params.suppressMinimize)
      )
    case TEMP_CONTEXT_TASK_KINDS.SessionRead:
      return (
        isHttpUrl(params.url) &&
        isNonEmptyString(params.requestId) &&
        isAccountSiteType(params.siteType) &&
        isOptionalBoolean(params.useIncognito) &&
        isOptionalBoolean(params.suppressMinimize)
      )
    case TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead:
      return isTempWindowNewApiSessionReadParams(params)
    case TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch:
      return isTempWindowOctopusApiFetchParams(params)
    case TEMP_CONTEXT_TASK_KINDS.OpenContext:
      return (
        isHttpUrl(params.url) &&
        isNonEmptyString(params.requestId) &&
        isOptionalBoolean(params.suppressMinimize)
      )
    default:
      return false
  }
}

interface TempContextTaskMetadata {
  operation: ProtectionBypassOperation
  cause: ProtectionBypassCause
}

const TEMP_CONTEXT_TASK_METADATA = {
  [TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch]: {
    operation: PROTECTION_BYPASS_OPERATIONS.Fetch,
    cause: PROTECTION_BYPASS_CAUSES.ApiErrorFallback,
  },
  [TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch]: {
    operation: PROTECTION_BYPASS_OPERATIONS.Fetch,
    cause: PROTECTION_BYPASS_CAUSES.BrowserProfileIsolation,
  },
  [TEMP_CONTEXT_TASK_KINDS.TurnstileFetch]: {
    operation: PROTECTION_BYPASS_OPERATIONS.TurnstileFetch,
    cause: PROTECTION_BYPASS_CAUSES.VerificationRequired,
  },
  [TEMP_CONTEXT_TASK_KINDS.NativePageAction]: {
    operation: PROTECTION_BYPASS_OPERATIONS.NativePageAction,
    cause: PROTECTION_BYPASS_CAUSES.VerificationRequired,
  },
  [TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction]: {
    operation: PROTECTION_BYPASS_OPERATIONS.NativePageAction,
    cause: PROTECTION_BYPASS_CAUSES.ExplicitContext,
  },
  [TEMP_CONTEXT_TASK_KINDS.RenderedTitle]: {
    operation: PROTECTION_BYPASS_OPERATIONS.RenderedTitle,
    cause: PROTECTION_BYPASS_CAUSES.RenderedPageRequired,
  },
  [TEMP_CONTEXT_TASK_KINDS.SessionRead]: {
    operation: PROTECTION_BYPASS_OPERATIONS.SessionRead,
    cause: PROTECTION_BYPASS_CAUSES.SessionRequired,
  },
  [TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead]: {
    operation: PROTECTION_BYPASS_OPERATIONS.SessionRead,
    cause: PROTECTION_BYPASS_CAUSES.SessionRequired,
  },
  [TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch]: {
    operation: PROTECTION_BYPASS_OPERATIONS.Fetch,
    cause: PROTECTION_BYPASS_CAUSES.SessionRequired,
  },
  [TEMP_CONTEXT_TASK_KINDS.OpenContext]: {
    operation: PROTECTION_BYPASS_OPERATIONS.OpenContext,
    cause: PROTECTION_BYPASS_CAUSES.ExplicitContext,
  },
} as const satisfies Record<TempContextTaskKind, TempContextTaskMetadata>

/** Derives policy-owned operation metadata from the canonical task kind. */
export function getTempContextTaskMetadata(
  task: Pick<TempContextTask, "kind">,
): TempContextTaskMetadata {
  return TEMP_CONTEXT_TASK_METADATA[task.kind]
}

export const PROTECTION_BYPASS_FEATURE_TASK_KINDS = {
  [PROTECTION_BYPASS_FEATURES.AccountRefresh]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    TEMP_CONTEXT_TASK_KINDS.SessionRead,
  ],
  [PROTECTION_BYPASS_FEATURES.BalanceHistory]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    TEMP_CONTEXT_TASK_KINDS.SessionRead,
  ],
  [PROTECTION_BYPASS_FEATURES.Checkin]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    TEMP_CONTEXT_TASK_KINDS.TurnstileFetch,
    TEMP_CONTEXT_TASK_KINDS.NativePageAction,
    TEMP_CONTEXT_TASK_KINDS.SessionRead,
  ],
  [PROTECTION_BYPASS_FEATURES.RedemptionAssist]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    TEMP_CONTEXT_TASK_KINDS.SessionRead,
  ],
  [PROTECTION_BYPASS_FEATURES.LdohSiteLookup]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
  ],
  [PROTECTION_BYPASS_FEATURES.KeyManagement]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    TEMP_CONTEXT_TASK_KINDS.SessionRead,
    TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
  ],
  [PROTECTION_BYPASS_FEATURES.ManagedSiteChannels]: [
    TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
    TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch,
  ],
  [PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync]: [
    TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
    TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch,
  ],
  [PROTECTION_BYPASS_FEATURES.AccountOnboarding]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch,
    TEMP_CONTEXT_TASK_KINDS.SessionRead,
    TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction,
  ],
} as const satisfies Record<
  ProtectionBypassFeature,
  readonly TempContextTaskKind[]
>

/** Keeps workflow ownership closed before policy or resource checks run. */
export function isProtectionBypassTaskPermitted(
  feature: ProtectionBypassFeature,
  taskKind: TempContextTaskKind,
): boolean {
  return (
    PROTECTION_BYPASS_FEATURE_TASK_KINDS[
      feature
    ] as readonly TempContextTaskKind[]
  ).includes(taskKind)
}
