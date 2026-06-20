/**
 * 账号操作服务模块
 */

import toast from "react-hot-toast"

import type { AutoDetectErrorCode } from "~/constants/autoDetect"
import { AUTO_DETECT_ERROR_CODES } from "~/constants/autoDetect"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { AccountUpdateUserTimestampMode } from "~/services/accounts/accountDefaults"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import {
  ensureDefaultApiTokenForAccount,
  generateDefaultTokenRequest,
} from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  completeAutoDetectedAccount,
  getAutoDetectCompletionFailureReason,
} from "~/services/accounts/autoDetectCompletion/completion"
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
  requireDisplayAccountTokenProvisioning,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  analyzeAutoDetectError,
  AUTO_DETECT_FAILURE_REASONS,
  AutoDetectErrorType,
  getAutoDetectErrorByCode,
  type AutoDetectAnalyticsContext,
  type AutoDetectFailureReason,
} from "~/services/accounts/utils/autoDetectUtils"
import { normalizeAccountSiteUrlForStorage } from "~/services/accounts/utils/siteUrlNormalization"
import { resolveDefaultTokenCreationWithUserGroups } from "~/services/accounts/utils/tokenProvisioning"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import {
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
  type TokenProvisioningBlockReason,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { autoDetectSmart } from "~/services/siteDetection/autoDetectService"
import {
  ApiToken,
  AuthTypeEnum,
  SiteHealthStatus,
  type CheckInConfig,
  type DisplaySiteData,
  type SiteAccount,
  type Sub2ApiAuthConfig,
} from "~/types"
import type {
  AccountSaveResponse,
  AccountValidationResponse,
} from "~/types/serviceResponse"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { extractSessionCookieHeader } from "~/utils/browser/cookieString"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showWarningToast } from "~/utils/core/toastHelpers"
import { t } from "~/utils/i18n/core"

const logger = createLogger("AccountOperations")

export const MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS = 20000

export { extractDomainPrefix, getSiteName } from "~/services/accounts/siteName"

/**
 * Pins analytics metadata to the final site type selected for account handling.
 */
function withFinalAutoDetectSiteType(
  autoDetectContext: AutoDetectAnalyticsContext | undefined,
  siteType: AccountSiteType,
): AutoDetectAnalyticsContext {
  return {
    ...(autoDetectContext ?? {}),
    siteType,
  }
}

/**
 * Maps machine-readable auto-detect service errors into analytics-safe failure reasons.
 */
function getAutoDetectFailureReasonByErrorCode(
  errorCode?: AutoDetectErrorCode,
): AutoDetectFailureReason | undefined {
  switch (errorCode) {
    case AUTO_DETECT_ERROR_CODES.CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE:
      return AUTO_DETECT_FAILURE_REASONS.CurrentTabContentScriptUnavailable
    case AUTO_DETECT_ERROR_CODES.SITE_TYPE_DETECTION_FAILED:
      return AUTO_DETECT_FAILURE_REASONS.SiteTypeDetectionFailed
    default:
      return undefined
  }
}

/**
 * Returns local user-facing guidance for known completion failures.
 */
function getAutoDetectCompletionFailureMessage(
  reason: AutoDetectFailureReason,
  fallbackErrorMessage: string,
) {
  switch (reason) {
    case AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed:
    case AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing:
      return t("messages:operations.detection.getAccessTokenFailedDetailed")
    case AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed:
      return t("messages:operations.detection.getSiteStatusFailedDetailed")
    case AUTO_DETECT_FAILURE_REASONS.UsernameMissing:
      return t("messages:operations.detection.getUsernameFailedDetailed")
    default:
      return t("accountDialog:messages.autoDetectFailed", {
        error: fallbackErrorMessage,
      })
  }
}

/**
 * Preserves invalid-response details for completion validation failures.
 */
function getAutoDetectCompletionDetailedError(
  error: unknown,
  reason: AutoDetectFailureReason,
  message: string,
) {
  switch (reason) {
    case AUTO_DETECT_FAILURE_REASONS.UsernameMissing:
    case AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing:
      return {
        type: AutoDetectErrorType.INVALID_RESPONSE,
        message,
      }
    default:
      return analyzeAutoDetectError(error)
  }
}

/**
 * Create a localized timeout error for manual account data fetching.
 * @param timeoutMs Timeout threshold in milliseconds.
 */
function createAccountDataFetchTimeoutError(timeoutMs: number): Error {
  const error = new Error(
    t("messages:errors.operation.accountDataFetchTimeout", {
      seconds: Math.ceil(timeoutMs / 1000),
    }),
  )
  error.name = "AccountDataFetchTimeoutError"
  return error
}

/**
 * Guards the manual-add refresh path so a hung upstream request cannot block
 * account creation indefinitely. This does not cancel the underlying request.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  createTimeoutError: () => Error,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(createTimeoutError())
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

const createMissingAccountDataCapabilityError = (siteType: string): Error =>
  new Error(`accountData is not implemented for ${siteType}`)

const requireAccountDataCapability = (
  siteType: string,
  accountData: AccountDataCapability | undefined,
): AccountDataCapability => {
  if (!accountData) {
    throw createMissingAccountDataCapabilityError(siteType)
  }

  return accountData
}

/**
 * Parses a manual balance in USD from a string value and converts it to quota
 * units.
 *
 * Returns undefined when the value is empty/undefined, not a finite number, or
 * negative.
 */
export function parseManualQuotaFromUsd(
  value: string | undefined,
): number | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const amount = Number.parseFloat(trimmed)
  if (!Number.isFinite(amount) || amount < 0) return undefined

  return Math.round(amount * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR)
}

/**
 * 智能自动识别账号信息
 * 工作流程：
 * 1. 调用 `autoDetectSmart` 按当前标签页、background、直接 API 的顺序选择识别方式
 * 2. 在可用路径中读取用户信息与站点类型
 * 3. 调用 API 获取访问令牌和账号补充数据
 * 4. 保存或更新账号信息到本地存储
 * @param url 站点地址（将被自动标准化并请求）
 * @param authType 当前选择的认证方式（Cookie / AccessToken / None）
 */
export async function autoDetectAccount(
  url: string,
  authType: AuthTypeEnum,
): Promise<AccountValidationResponse> {
  if (!url.trim()) {
    return {
      success: false,
      message: t("messages:errors.validation.urlRequired"),
    }
  }

  let autoDetectContext: AutoDetectAnalyticsContext | undefined

  try {
    try {
      await sendRuntimeMessage({
        action: RuntimeActionIds.CookieInterceptorTrackUrl,
        url: url.trim(),
      })
    } catch (error) {
      logger.warn("Failed to track cookie interceptor url", {
        url: url.trim(),
        error: getErrorMessage(error),
      })
    }

    // 使用智能自动识别服务
    const detectResult = await autoDetectSmart(url.trim())
    autoDetectContext = detectResult.autoDetectContext

    if (!detectResult.success || !detectResult.data) {
      const errorMsg =
        detectResult.error || t("messages:operations.detection.failed")
      const detailedError =
        getAutoDetectErrorByCode(detectResult.errorCode) ??
        analyzeAutoDetectError(errorMsg)
      return {
        success: false,
        message: detailedError.message || errorMsg,
        detailedError,
        autoDetectContext,
        autoDetectFailureReason:
          getAutoDetectFailureReasonByErrorCode(detectResult.errorCode) ??
          AUTO_DETECT_FAILURE_REASONS.UserDataMissing,
      }
    }

    const { userId, siteType } = detectResult.data
    autoDetectContext = withFinalAutoDetectSiteType(
      detectResult.autoDetectContext,
      siteType,
    )

    if (!userId) {
      return {
        success: false,
        message: t("messages:operations.detection.getUserIdFailedDetailed"),
        detailedError: {
          type: AutoDetectErrorType.INVALID_RESPONSE,
          message: t("messages:operations.detection.getUserIdFailedDetailed"),
        },
        autoDetectContext,
        autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.UserIdMissing,
      }
    }

    const completed = await completeAutoDetectedAccount({
      url,
      requestedAuthType: authType,
      detected: detectResult.data,
      autoDetectContext,
    })

    return {
      success: true,
      message: t("accountDialog:messages.autoDetectSuccess"),
      data: completed,
    }
  } catch (error) {
    const errorMessage = getErrorMessage(error)
    const autoDetectFailureReason = getAutoDetectCompletionFailureReason(error)
    const message = getAutoDetectCompletionFailureMessage(
      autoDetectFailureReason,
      errorMessage,
    )
    logger.error(
      t("messages:autodetect.failed", { error: errorMessage }),
      error,
    )
    const detailedError = getAutoDetectCompletionDetailedError(
      error,
      autoDetectFailureReason,
      message,
    )
    return {
      success: false,
      message,
      detailedError,
      autoDetectContext,
      autoDetectFailureReason,
    }
  }
}

/**
 * 校验账号必填字段是否合法（主要用于表单提交前的快速判断）。
 * @param params 账号核心字段集合
 * @param params.siteName 站点名称
 * @param params.username 用户名
 * @param params.userId 用户 ID
 * @param params.siteType 站点类型（用于特殊站点校验差异）
 * @param params.authType 认证类型
 * @param params.accessToken 访问令牌
 * @param params.cookieAuthSessionCookie Cookie 认证所需的会话 Cookie（Header 值）
 * @param params.exchangeRate 汇率配置
 * @returns 是否满足最基本的账号信息要求
 */
export function isValidAccount({
  siteName,
  username,
  userId,
  siteType,
  authType,
  accessToken,
  cookieAuthSessionCookie,
  exchangeRate,
}: {
  siteName: string
  username: string
  userId: string
  siteType?: AccountSiteType
  authType: AuthTypeEnum
  accessToken: string
  cookieAuthSessionCookie?: string
  exchangeRate: string
}) {
  const normalizedSiteType = isAccountSiteType(siteType)
    ? siteType
    : SITE_TYPES.UNKNOWN

  return (
    !!siteName.trim() &&
    // Sub2API 默认可能返回空 username（""），允许保存账号信息
    (normalizedSiteType === SITE_TYPES.SUB2API || !!username.trim()) &&
    !!userId.trim() &&
    isValidExchangeRate(exchangeRate) &&
    (authType !== AuthTypeEnum.AccessToken || !!accessToken.trim()) &&
    (authType !== AuthTypeEnum.Cookie || !!cookieAuthSessionCookie?.trim())
  )
}

type TagIdsInput = string[] | undefined

export interface ValidateAndSaveAccountOptions {
  skipAutoProvisionKeyOnAccountAdd?: boolean
  deferDataRefresh?: boolean
}

export interface ValidateAndUpdateAccountOptions {
  deferDataRefresh?: boolean
}

/**
 * Normalizes a tag id list originating from UI widgets into a de-duped string
 * array, trimming whitespace and discarding empty values.
 * @param tagIds - Optional tag id list from UI.
 * @returns A de-duped array of sanitized tag ids or [] when empty.
 */
function normalizeTagIdsInput(tagIds: TagIdsInput): string[] {
  if (!tagIds || tagIds.length === 0) {
    return []
  }

  return Array.from(
    new Set(
      tagIds
        .map((id) => (typeof id === "string" ? id.trim() : String(id ?? "")))
        .filter((id) => id.length > 0),
    ),
  )
}

/**
 * Normalizes the Sub2API auth input.
 */
function normalizeSub2ApiAuthInput(
  siteType: AccountSiteType,
  sub2apiAuth: Sub2ApiAuthConfig | undefined,
): Sub2ApiAuthConfig | undefined {
  if (siteType !== SITE_TYPES.SUB2API) return undefined

  const refreshToken =
    typeof sub2apiAuth?.refreshToken === "string"
      ? sub2apiAuth.refreshToken.trim()
      : ""
  if (!refreshToken) return undefined

  const tokenExpiresAtRaw = sub2apiAuth?.tokenExpiresAt
  const tokenExpiresAt =
    typeof tokenExpiresAtRaw === "number" &&
    Number.isFinite(tokenExpiresAtRaw) &&
    tokenExpiresAtRaw > 0
      ? tokenExpiresAtRaw
      : undefined

  return tokenExpiresAt ? { refreshToken, tokenExpiresAt } : { refreshToken }
}

/**
 * Parses the user-provided exchange rate (CNY per USD) with a safe fallback.
 *
 * Returns {@link UI_CONSTANTS.EXCHANGE_RATE.DEFAULT} when the input is empty or invalid.
 */
function parsePositiveExchangeRate(input: string): number | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) {
    return undefined
  }

  return value
}

/**
 * Parses the user-provided exchange rate (CNY per USD) with a safe fallback.
 *
 * Returns {@link UI_CONSTANTS.EXCHANGE_RATE.DEFAULT} when the input is empty or invalid.
 */
function resolveExchangeRate(input: string): number {
  return parsePositiveExchangeRate(input) ?? UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
}

export type Sub2ApiQuickCreateResolution =
  | { kind: "ready"; group: string }
  | { kind: "selection_required"; allowedGroups: string[] }
  | { kind: "blocked"; message: string }

export type DefaultTokenQuickCreateResolution =
  | { kind: "ready"; tokenData: CreateTokenRequest }
  | { kind: "selection_required"; allowedGroups: string[] }
  | {
      kind: "blocked"
      reason: TokenProvisioningBlockReason
      message: string
    }

const getDefaultTokenProvisioningBlockMessage = (
  reason: TokenProvisioningBlockReason,
): string => {
  if (reason === TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired) {
    return t("messages:sub2api.createRequiresAvailableGroup")
  }

  if (reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired) {
    return t("messages:aihubmix.createRequiresOneTimeKeyDialog")
  }

  return t("messages:sub2api.createRequiresGroup")
}

/**
 * Resolves the current default-token quick-create state from adapter policy.
 */
export async function resolveDefaultTokenQuickCreateResolution(
  account: DisplaySiteData,
  options: { explicitGroup?: string } = {},
): Promise<DefaultTokenQuickCreateResolution> {
  const { keyManagement, request, tokenProvisioning } =
    createDisplayAccountApiContext(account)
  const requiredKeyManagement = requireDisplayAccountKeyManagement(
    account,
    keyManagement,
  )
  const requiredTokenProvisioning = requireDisplayAccountTokenProvisioning(
    account,
    tokenProvisioning,
  )
  const decision = await resolveDefaultTokenCreationWithUserGroups({
    keyManagement: requiredKeyManagement,
    tokenProvisioning: requiredTokenProvisioning,
    request,
    decisionRequest: {
      workflow: TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection,
      defaultTokenData: generateDefaultTokenRequest(),
      explicitGroup: options.explicitGroup,
    },
    missingUserGroupsMessage: "sub2api_group_inventory_not_implemented",
  })

  if (decision.kind === "create") {
    return { kind: "ready", tokenData: decision.tokenData }
  }

  if (decision.kind === "selection_required") {
    return { kind: "selection_required", allowedGroups: decision.allowedGroups }
  }

  if (decision.kind === "needs_user_groups") {
    throw new Error("sub2api_group_inventory_not_implemented")
  }

  return {
    kind: "blocked",
    reason: decision.reason,
    message: getDefaultTokenProvisioningBlockMessage(decision.reason),
  }
}

/**
 * Resolves the current Sub2API quick-create state through default-token policy.
 */
export async function resolveSub2ApiQuickCreateResolution(
  account: DisplaySiteData,
): Promise<Sub2ApiQuickCreateResolution> {
  if (account.siteType !== SITE_TYPES.SUB2API) {
    throw new Error("sub2api_quick_create_not_applicable")
  }

  const resolution = await resolveDefaultTokenQuickCreateResolution(account)

  if (resolution.kind === "ready") {
    return { kind: "ready", group: resolution.tokenData.group }
  }

  if (resolution.kind === "selection_required") {
    return {
      kind: "selection_required",
      allowedGroups: resolution.allowedGroups,
    }
  }

  return { kind: "blocked", message: resolution.message }
}

/**
 * 验证并保存账号信息（用于新增）
 *
 * Validates user-supplied account form data, fetches the freshest remote
 * account metrics, and persists the resulting record via accountStorage.
 * @param url - Target site URL entered by the user.
 * @param siteName - Display name for the account.
 * @param username - Username retrieved from the remote site.
 * @param accessToken - Auth token required for API calls.
 * @param userId - Site-scoped account identity entered by the user.
 * @param exchangeRate - Recharge exchange rate configured in UI.
 * @param notes - Free-form notes provided by user.
 * @param tagIds - Optional tag ids originating from the tag picker.
 * @param checkInConfig - Check-in configuration captured from UI.
 * @param siteType - Classifier describing the site (OneAPI, etc.).
 * @param authType - Authentication strategy (cookie/token/none).
 * @param cookieAuthSessionCookie - Session cookie for cookie auth.
 * @returns Success payload with new account id or a failure descriptor.
 */
export async function validateAndSaveAccount(
  url: string,
  siteName: string,
  username: string,
  accessToken: string,
  userId: string,
  exchangeRate: string,
  notes: string,
  tagIds: TagIdsInput,
  checkInConfig: CheckInConfig,
  siteType: string,
  authType: AuthTypeEnum,
  cookieAuthSessionCookie: string,
  manualBalanceUsd?: string,
  excludeFromTotalBalance = false,
  excludeFromTodayIncome = false,
  sub2apiAuth?: Sub2ApiAuthConfig,
  options: ValidateAndSaveAccountOptions = {},
): Promise<AccountSaveResponse> {
  const sessionCookieHeader =
    authType === AuthTypeEnum.Cookie
      ? extractSessionCookieHeader(cookieAuthSessionCookie)
      : ""
  const normalizedSiteType = isAccountSiteType(siteType)
    ? siteType
    : SITE_TYPES.UNKNOWN

  // 表单验证
  if (
    !isValidAccount({
      siteName,
      username,
      userId,
      siteType: normalizedSiteType,
      authType,
      accessToken,
      cookieAuthSessionCookie: sessionCookieHeader,
      exchangeRate,
    })
  ) {
    return {
      success: false,
      message: t("messages:errors.validation.incompleteAccountInfo"),
    }
  }

  const accountIdentity = normalizeAccountIdentity(userId) ?? ""

  let shouldAutoProvisionKeyOnAccountAdd =
    DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAdd ?? false
  let includeTodayCashflow = DEFAULT_PREFERENCES.showTodayCashflow ?? true
  try {
    const prefs = await userPreferences.getPreferences()
    shouldAutoProvisionKeyOnAccountAdd =
      prefs.autoProvisionKeyOnAccountAdd ?? shouldAutoProvisionKeyOnAccountAdd
    includeTodayCashflow = prefs.showTodayCashflow ?? includeTodayCashflow
  } catch (error) {
    logger.warn(
      "Failed to read user preferences; falling back to defaults",
      error,
    )
  }

  const manualQuota = parseManualQuotaFromUsd(manualBalanceUsd)
  const normalizedManualBalanceUsd =
    manualQuota === undefined ? "" : manualBalanceUsd!.trim()
  const normalizedSub2ApiAuth = normalizeSub2ApiAuthInput(
    normalizedSiteType,
    sub2apiAuth,
  )
  const requestBaseUrl = url.trim()
  const storageSiteUrl = normalizeAccountSiteUrlForStorage({
    siteType: normalizedSiteType,
    url,
  })
  const normalizedTagIds = normalizeTagIdsInput(tagIds)

  if (options.deferDataRefresh === true) {
    const accountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at" | "user_updated_at"
    > = {
      site_name: siteName.trim(),
      site_url: storageSiteUrl,
      site_type: normalizedSiteType,
      authType: authType,
      disabled: false,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      excludeFromTodayIncome: excludeFromTodayIncome === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate: resolveExchangeRate(exchangeRate),
      notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      checkIn: checkInConfig,
      health: { status: SiteHealthStatus.Unknown },
      account_info: {
        id: accountIdentity,
        access_token: accessToken.trim(),
        username: username.trim(),
        quota: manualQuota ?? 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: Date.now(),
    }

    try {
      const accountId = await accountStorage.addAccount(accountData)
      logger.info("Account saved before deferred data refresh", {
        accountId,
        siteName: siteName.trim(),
        siteType: normalizedSiteType,
      })

      if (!options.skipAutoProvisionKeyOnAccountAdd) {
        void autoProvisionKeyOnAccountAdd(
          accountId,
          shouldAutoProvisionKeyOnAccountAdd,
        )
      }

      return {
        success: true,
        message: t("messages:toast.success.accountSaveSuccess"),
        accountId,
        feedbackLevel: "success",
      }
    } catch (saveError) {
      logger.error("Failed to save account", saveError)
      const errorMessage = getErrorMessage(saveError)
      return {
        success: false,
        message: t("messages:errors.operation.saveFailed", {
          error: errorMessage,
        }),
      }
    }
  }

  try {
    // 获取账号余额和今日使用情况
    logger.debug("Fetching account data for new account", {
      baseUrl: requestBaseUrl,
      siteType: normalizedSiteType,
      authType,
      userId: accountIdentity,
    })
    const accountDataCapability = requireAccountDataCapability(
      normalizedSiteType,
      getSiteAdapter(normalizedSiteType).accountData,
    )
    const freshAccountData = await withTimeout(
      accountDataCapability.fetchData({
        baseUrl: requestBaseUrl,
        checkIn: checkInConfig,
        accountId: undefined, // New account, no ID yet
        includeTodayCashflow,
        auth: {
          authType,
          userId: accountIdentity,
          accessToken: accessToken.trim(),
          cookie:
            authType === AuthTypeEnum.Cookie
              ? sessionCookieHeader.trim()
              : undefined,
        },
      }),
      MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS,
      () =>
        createAccountDataFetchTimeoutError(
          MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS,
        ),
    )
    const accountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at" | "user_updated_at"
    > = {
      site_name: siteName.trim(),
      site_url: storageSiteUrl,
      health: { status: SiteHealthStatus.Healthy }, // 成功获取数据说明状态正常
      site_type: normalizedSiteType,
      authType: authType,
      disabled: false,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      excludeFromTodayIncome: excludeFromTodayIncome === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate: resolveExchangeRate(exchangeRate), // 使用用户输入的汇率
      notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      checkIn: freshAccountData.checkIn,
      account_info: {
        id: accountIdentity,
        access_token: accessToken.trim(),
        username: username.trim(),
        quota: manualQuota ?? freshAccountData.quota,
        today_prompt_tokens: freshAccountData.today_prompt_tokens,
        today_completion_tokens: freshAccountData.today_completion_tokens,
        today_quota_consumption: freshAccountData.today_quota_consumption,
        today_requests_count: freshAccountData.today_requests_count,
        today_income: freshAccountData.today_income,
      },
      last_sync_time: Date.now(),
    }

    const accountId = await accountStorage.addAccount(accountData)
    logger.info("Account saved with data refresh", {
      accountId,
      siteName: siteName.trim(),
      siteType: normalizedSiteType,
    })

    if (!options.skipAutoProvisionKeyOnAccountAdd) {
      void autoProvisionKeyOnAccountAdd(
        accountId,
        shouldAutoProvisionKeyOnAccountAdd,
      )
    }

    return {
      success: true,
      message: t("messages:toast.success.accountSaveSuccess"),
      accountId,
      feedbackLevel: "success",
    }
  } catch (error) {
    // FALLBACK: 即使获取数据失败也要保存配置
    logger.warn("Data fetch failed; saving configuration only", error)

    const partialAccountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at" | "user_updated_at"
    > = {
      site_name: siteName.trim(),
      site_url: storageSiteUrl,
      site_type: normalizedSiteType,
      authType: authType,
      disabled: false,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      excludeFromTodayIncome: excludeFromTodayIncome === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate: resolveExchangeRate(exchangeRate),
      notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      checkIn: checkInConfig,
      health: {
        status: SiteHealthStatus.Warning,
        reason: getErrorMessage(error),
      },
      account_info: {
        id: accountIdentity,
        access_token: accessToken.trim(),
        username: username.trim(),
        quota: manualQuota ?? 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: Date.now(),
    }

    // Try to save partial account data
    try {
      const accountId = await accountStorage.addAccount(partialAccountData)
      logger.warn("Account saved without data refresh", {
        accountId,
        siteName: siteName.trim(),
        siteType,
      })

      if (!options.skipAutoProvisionKeyOnAccountAdd) {
        void autoProvisionKeyOnAccountAdd(
          accountId,
          shouldAutoProvisionKeyOnAccountAdd,
        )
      }

      return {
        success: true,
        message: t("messages:warnings.accountSavedWithoutDataRefresh"),
        accountId,
        feedbackLevel: "warning",
      }
    } catch (saveError) {
      logger.error("Failed to save account", saveError)
      const errorMessage = getErrorMessage(saveError)
      return {
        success: false,
        message: t("messages:errors.operation.saveFailed", {
          error: errorMessage,
        }),
      }
    }
  }
}

/**
 * 验证并更新账号信息（用于编辑）
 *
 * Re-validates edited account data, refreshes remote metrics, and applies a
 * partial update to the existing account record. Falls back to a config-only
 * update when live data fetching fails.
 * @param accountId - Identifier of the stored account to update.
 * @param url - Updated site URL.
 * @param siteName - Updated display name.
 * @param username - Updated username.
 * @param accessToken - Updated auth token.
 * @param userId - Updated site-scoped account identity.
 * @param exchangeRate - Updated recharge rate string.
 * @param notes - Updated notes.
 * @param tagIds - Updated tag id collection.
 * @param checkInConfig - Updated check-in configuration.
 * @param siteType - Updated site type classification.
 * @param authType - Authentication mode in use.
 * @param cookieAuthSessionCookie - Session cookie for cookie auth.
 * @returns Response describing success/failure and account id.
 */
export async function validateAndUpdateAccount(
  accountId: string,
  url: string,
  siteName: string,
  username: string,
  accessToken: string,
  userId: string,
  exchangeRate: string,
  notes: string,
  tagIds: TagIdsInput,
  checkInConfig: CheckInConfig,
  siteType: string,
  authType: AuthTypeEnum,
  cookieAuthSessionCookie: string,
  manualBalanceUsd?: string,
  excludeFromTotalBalance = false,
  excludeFromTodayIncome = false,
  sub2apiAuth?: Sub2ApiAuthConfig,
  options: ValidateAndUpdateAccountOptions = {},
): Promise<AccountSaveResponse> {
  const sessionCookieHeader =
    authType === AuthTypeEnum.Cookie
      ? extractSessionCookieHeader(cookieAuthSessionCookie)
      : ""
  const normalizedSiteType = isAccountSiteType(siteType)
    ? siteType
    : SITE_TYPES.UNKNOWN

  // 表单验证
  if (
    !isValidAccount({
      siteName,
      username,
      userId,
      siteType: normalizedSiteType,
      authType,
      accessToken,
      cookieAuthSessionCookie: sessionCookieHeader,
      exchangeRate,
    })
  ) {
    return {
      success: false,
      message: t("messages:errors.validation.incompleteAccountInfo"),
    }
  }

  const accountIdentity = normalizeAccountIdentity(userId) ?? ""

  const manualQuota = parseManualQuotaFromUsd(manualBalanceUsd)
  const normalizedManualBalanceUsd =
    manualQuota === undefined ? "" : manualBalanceUsd!.trim()
  const normalizedSub2ApiAuth = normalizeSub2ApiAuthInput(
    normalizedSiteType,
    sub2apiAuth,
  )
  const requestBaseUrl = url.trim()
  const storageSiteUrl = normalizeAccountSiteUrlForStorage({
    siteType: normalizedSiteType,
    url,
  })
  const normalizedTagIds = normalizeTagIdsInput(tagIds)

  if (options.deferDataRefresh === true) {
    const updateData = {
      site_name: siteName.trim(),
      site_url: storageSiteUrl,
      site_type: normalizedSiteType,
      authType: authType,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      excludeFromTodayIncome: excludeFromTodayIncome === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate: resolveExchangeRate(exchangeRate),
      notes: notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      checkIn: checkInConfig,
      account_info: {
        id: accountIdentity,
        access_token: accessToken.trim(),
        username: username.trim(),
        ...(manualQuota === undefined ? {} : { quota: manualQuota }),
      },
    }

    const success = await accountStorage.updateAccount(accountId, updateData, {
      userTimestampMode: AccountUpdateUserTimestampMode.Touch,
    })

    if (!success) {
      return {
        success: false,
        message: t("messages:errors.validation.updateAccountFailed", {
          error: "",
        }),
      }
    }

    logger.info("Account updated before deferred data refresh", {
      accountId,
      siteName: siteName.trim(),
      siteType: normalizedSiteType,
    })

    return {
      success: true,
      message: t("messages:toast.success.accountUpdateSuccess"),
      accountId,
      feedbackLevel: "success",
    }
  }

  try {
    // 获取账号余额和今日使用情况
    logger.debug("Fetching account data for update", {
      accountId,
      baseUrl: requestBaseUrl,
      siteType: normalizedSiteType,
      authType,
      userId: accountIdentity,
    })
    const includeTodayCashflow =
      (await userPreferences.getPreferences()).showTodayCashflow ?? true
    const accountData = requireAccountDataCapability(
      normalizedSiteType,
      getSiteAdapter(normalizedSiteType).accountData,
    )
    const freshAccountData = await accountData.fetchData({
      baseUrl: requestBaseUrl,
      checkIn: checkInConfig,
      accountId,
      includeTodayCashflow,
      auth: {
        authType,
        userId: accountIdentity,
        accessToken: accessToken.trim(),
        cookie:
          authType === AuthTypeEnum.Cookie
            ? sessionCookieHeader.trim()
            : undefined,
      },
    })
    const updateData: Partial<
      Omit<SiteAccount, "id" | "created_at" | "updated_at" | "user_updated_at">
    > = {
      site_name: siteName.trim(),
      site_url: storageSiteUrl,
      health: { status: SiteHealthStatus.Healthy }, // 成功获取数据说明状态正常
      site_type: normalizedSiteType,
      authType: authType,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      excludeFromTodayIncome: excludeFromTodayIncome === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate: resolveExchangeRate(exchangeRate), // 使用用户输入的汇率
      notes: notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      checkIn: freshAccountData.checkIn,
      account_info: {
        id: accountIdentity,
        access_token: accessToken.trim(),
        username: username.trim(),
        quota: manualQuota ?? freshAccountData.quota,
        today_prompt_tokens: freshAccountData.today_prompt_tokens,
        today_completion_tokens: freshAccountData.today_completion_tokens,
        today_quota_consumption: freshAccountData.today_quota_consumption,
        today_requests_count: freshAccountData.today_requests_count,
        today_income: freshAccountData.today_income,
      },
      last_sync_time: Date.now(),
    }

    const success = await accountStorage.updateAccount(accountId, updateData, {
      userTimestampMode: AccountUpdateUserTimestampMode.Touch,
    })
    if (!success) {
      return {
        success: false,
        message: t("messages:errors.validation.updateAccountFailed", {
          error: "",
        }),
      }
    }

    logger.info("Account updated with data refresh", {
      accountId,
      siteName: siteName.trim(),
      siteType,
    })

    return {
      success: true,
      message: t("messages:toast.success.accountUpdateSuccess"),
      accountId,
      feedbackLevel: "success",
    }
  } catch (error) {
    // FALLBACK: 即使获取数据失败也要保存配置
    logger.warn("Data fetch failed; saving configuration only", error)

    const partialUpdateData = {
      site_name: siteName.trim(),
      site_url: storageSiteUrl,
      site_type: normalizedSiteType,
      authType: authType,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      excludeFromTodayIncome: excludeFromTodayIncome === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate: resolveExchangeRate(exchangeRate),
      notes: notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      checkIn: checkInConfig,
      health: {
        status: SiteHealthStatus.Warning,
        reason: getErrorMessage(error),
      },
      account_info: {
        id: accountIdentity,
        access_token: accessToken.trim(),
        username: username.trim(),
        ...(manualQuota === undefined ? {} : { quota: manualQuota }),
      },
      last_sync_time: Date.now(),
    }

    // Try to save partial update
    const success = await accountStorage.updateAccount(
      accountId,
      partialUpdateData,
      { userTimestampMode: AccountUpdateUserTimestampMode.Touch },
    )

    if (!success) {
      return {
        success: false,
        message: t("messages:errors.validation.updateAccountFailed", {
          error: "",
        }),
      }
    }

    return {
      success: true,
      message: t("messages:warnings.accountUpdatedWithoutDataRefresh"),
      accountId,
      feedbackLevel: "warning",
    }
  }
}

/**
 * Checks if a given exchange rate is valid.
 * @param rate - The exchange rate to check.
 * @returns True if the exchange rate is valid, false otherwise.
 * A valid exchange rate is a number greater than 0.
 */
export function isValidExchangeRate(rate: string): boolean {
  return parsePositiveExchangeRate(rate) !== undefined
}

/**
 * Ensures that an API token exists for the supplied account by checking the
 * remote token inventory and lazily issuing a default token when none exist.
 * Provides toast updates for the long-running request to improve UX feedback.
 * @param account - The underlying account record (includes credentials).
 * @param displaySiteData - Derived display data used by token APIs.
 * @param toastIdOrOptions - Optional toast identifier or Sub2API create options.
 * @returns The ensured ApiToken ready for downstream use.
 * @throws {Error} 当密钥获取或生成都失败时抛出异常
 */
export async function ensureAccountApiToken(
  account: SiteAccount,
  displaySiteData: DisplaySiteData,
  toastIdOrOptions?: string | { toastId?: string; sub2apiGroup?: string },
): Promise<ApiToken> {
  const options =
    typeof toastIdOrOptions === "string"
      ? { toastId: toastIdOrOptions }
      : toastIdOrOptions ?? {}

  toast.loading(t("messages:accountOperations.checkingApiKeys"), {
    id: options.toastId,
  })

  const context = createDisplayAccountApiContext(displaySiteData)
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    context.keyManagement,
  )
  const requiredTokenProvisioning = requireDisplayAccountTokenProvisioning(
    displaySiteData,
    context.tokenProvisioning,
  )
  const displayAccountRequest = {
    baseUrl: displaySiteData.baseUrl,
    accountId: displaySiteData.id,
    auth: {
      authType: displaySiteData.authType,
      userId: displaySiteData.userId,
      accessToken: displaySiteData.token,
      cookie: displaySiteData.cookieAuthSessionCookie,
    },
  }
  const createAccountRequest = {
    baseUrl: account.site_url,
    accountId: account.id,
    auth: {
      authType: account.authType,
      userId: account.account_info.id,
      accessToken: account.account_info.access_token,
      cookie: account.cookieAuth?.sessionCookie,
    },
  }

  const tokens = await keyManagement.fetchTokens(displayAccountRequest)
  let apiToken: ApiToken | undefined = tokens.at(-1)

  if (!apiToken) {
    const decision = requiredTokenProvisioning.resolveDefaultTokenCreation({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
      defaultTokenData: generateDefaultTokenRequest(),
      explicitGroup: options.sub2apiGroup,
    })

    if (decision.kind !== "create") {
      if (
        decision.kind === "blocked" &&
        decision.reason ===
          TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired
      ) {
        throw new Error(t("messages:aihubmix.createRequiresOneTimeKeyDialog"))
      }

      throw new Error(t("messages:sub2api.createRequiresGroup"))
    }

    const createApiTokenResult = await keyManagement.createToken(
      createAccountRequest,
      decision.tokenData,
    )
    const createdTokenDecision = requiredTokenProvisioning.classifyCreatedToken(
      {
        workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
        result: createApiTokenResult,
      },
    )

    if (createdTokenDecision.kind === "usable") {
      apiToken = createdTokenDecision.token
    } else if (createdTokenDecision.kind === "failed") {
      throw new Error(t("messages:accountOperations.createTokenFailed"))
    } else if (createdTokenDecision.kind === "unavailable") {
      throw new Error(t("messages:aihubmix.createRequiresOneTimeKeyDialog"))
    } else {
      // Do not assume a created key can be read back in full. AIHubMix returns
      // complete API keys only at creation time and may list masked keys here.
      const updatedTokens = await keyManagement.fetchTokens(
        displayAccountRequest,
      )
      apiToken = updatedTokens.at(-1)
    }
  }

  if (!apiToken) {
    throw new Error(t("messages:accountOperations.tokenNotFound"))
  }

  return apiToken
}

/**
 * Best-effort default API key auto-provisioning after account add.
 *
 * This is intentionally non-blocking for the save flow, but should provide
 * explicit UX feedback so users can confirm whether a key was created or the
 * account already had keys.
 */
async function autoProvisionKeyOnAccountAdd(
  accountId: string,
  enabled: boolean,
): Promise<void> {
  if (!enabled) return

  try {
    const account = await accountStorage.getAccountById(accountId)
    if (!account) {
      logger.warn("Auto-provision skipped: account not found", { accountId })
      return
    }

    if (account.disabled === true) {
      return
    }

    if (
      account.site_type === SITE_TYPES.SUB2API ||
      account.site_type === SITE_TYPES.AIHUBMIX
    ) {
      return
    }

    if (account.authType === AuthTypeEnum.None) {
      return
    }

    const displaySiteData =
      (await accountStorage.getDisplayDataById(accountId)) ??
      accountStorage.convertToDisplayData(account)
    const hasToken =
      typeof displaySiteData?.token === "string" &&
      displaySiteData.token.trim().length > 0
    const hasCookie =
      typeof displaySiteData?.cookieAuthSessionCookie === "string" &&
      displaySiteData.cookieAuthSessionCookie.trim().length > 0

    if (
      typeof displaySiteData?.id !== "string" ||
      displaySiteData.id.trim().length === 0 ||
      typeof displaySiteData?.baseUrl !== "string" ||
      displaySiteData.baseUrl.trim().length === 0 ||
      typeof displaySiteData?.siteType !== "string" ||
      displaySiteData.siteType.trim().length === 0 ||
      displaySiteData.authType === AuthTypeEnum.None ||
      typeof displaySiteData.userId !== "string" ||
      displaySiteData.userId.trim().length === 0 ||
      (displaySiteData.authType === AuthTypeEnum.AccessToken && !hasToken) ||
      (displaySiteData.authType === AuthTypeEnum.Cookie &&
        !hasToken &&
        !hasCookie)
    ) {
      throw new Error("invalid_display_site_data")
    }

    const { created } = await ensureDefaultApiTokenForAccount({
      account,
      displaySiteData,
    })

    if (created) {
      toast.success(
        t("messages:accountOperations.autoProvisionCreated", {
          accountName: displaySiteData.name || account.site_name,
        }),
      )
    } else {
      showWarningToast(
        t("messages:accountOperations.autoProvisionAlreadyHad", {
          accountName: displaySiteData.name || account.site_name,
        }),
      )
    }
  } catch (error) {
    toast.error(
      t("messages:accountOperations.autoProvisionFailed", {
        actionLabel: t("keyManagement:repairMissingKeys.action"),
      }),
    )
    logger.warn("Auto-provision key after account add failed", {
      accountId,
      error: getErrorMessage(error),
    })
  }
}
