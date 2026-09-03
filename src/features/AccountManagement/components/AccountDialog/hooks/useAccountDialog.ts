import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import { CHECK_IN_SELECTION_MODES } from "~/constants/checkIn"
import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { startAccountDialogAnalyticsAction } from "~/features/AccountManagement/components/AccountDialog/analytics"
import {
  buildDraftFromAutoDetectResult,
  mergeAutoDetectRecoveryIntoDraft,
  normalizeDetectedCheckIn,
  resolveAutoDetectRecovery,
} from "~/features/AccountManagement/components/AccountDialog/autoDetectDraft"
import { useAccountCheckInRedetection } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountCheckInRedetection"
import {
  buildSub2ApiAuthFromAccountDialogDraft,
  getAccountDialogSitePolicy,
  normalizeAccountDialogDraftForSitePolicy,
  shouldAutoImportCookieAuthForAccountDialogSite,
  shouldDeferAccountSaveSuccessForAccountDialogSite,
  shouldOpenSub2ApiTokenDialogForAccountDialogSite,
} from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
import { normalizeAddAccountPrefill } from "~/features/AccountManagement/sponsors/pendingAddAccountIntent"
import { BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE } from "~/features/AccountManagement/sponsors/types"
import {
  isAccountAuthType,
  resolveDefaultAccountAuthType,
} from "~/features/AccountManagement/utils/accountAuthType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  resolveAccountBrowserSession,
  type AccountBrowserSession,
  type ResolveAccountBrowserSessionOptions,
} from "~/services/accountBrowserSession"
import { autoDetectAccount } from "~/services/accounts/accountAutoDetection"
import { validateAndSaveAccount } from "~/services/accounts/accountCreation"
import { findExactCredentialDuplicateAccountId } from "~/services/accounts/accountDedupe"
import {
  isValidAccount,
  parseManualQuotaFromUsd,
} from "~/services/accounts/accountFormValidation"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { ACCOUNT_SAVE_FEEDBACK_LEVELS } from "~/services/accounts/accountPersistence/constants"
import {
  ACCOUNT_POST_SAVE_WORKFLOW_STEPS,
  ACCOUNT_TOKEN_INVENTORY_STATE_KINDS,
  ENSURE_ACCOUNT_TOKEN_RESULT_KINDS,
  ensureAccountTokenForPostSaveWorkflow,
  inspectAccountTokenInventory,
  selectSingleNewApiTokenByIdDiff,
  type AccountPostSaveWorkflowStep,
} from "~/services/accounts/accountPostSaveWorkflow"
import { doAccountSiteIdentitiesMatch } from "~/services/accounts/accountSiteProfile"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountReadModels } from "~/services/accounts/accountStorage/accountReadModels"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { validateAndUpdateAccount } from "~/services/accounts/accountUpdate"
import type { AccountAutoDetectRecoveryData } from "~/services/accounts/autoDetect/recovery"
import type { CreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import { getSiteName } from "~/services/accounts/siteName"
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  analyzeAutoDetectError,
  AutoDetectErrorType,
  type AutoDetectError,
} from "~/services/accounts/utils/autoDetectUtils"
import {
  isSameAccountSiteOrigin,
  normalizeAccountSiteUrlForDuplicateCheck,
} from "~/services/accounts/utils/siteUrlNormalization"
import { isCanonicalOpenRouterUrl } from "~/services/accountSiteDefinitions/identifiers"
import { createAIHubMixCreatedRuntimeSecret } from "~/services/apiAdapters/aihubmix/createdSecret"
import {
  createCompatibilityCheckInConfig,
  hasNewAccountCompatibilityRegistration,
  resolveNewAccountAutomaticExecutionEnabled,
} from "~/services/checkin/autoCheckin/compatibilityConfig"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/inspection"
import { getAutoCheckinCandidateMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import { getManagedSiteServiceForType } from "~/services/managedSites/managedSiteService"
import {
  getManagedSiteConfigMissingMessage,
  getManagedSiteLabel,
} from "~/services/managedSites/utils/managedSite"
import {
  ensurePermissionsDetailed,
  hasPermissions,
  onOptionalPermissionsChanged,
  OPTIONAL_PERMISSION_IDS,
  OPTIONAL_PERMISSIONS,
  type ManifestOptionalPermissions,
} from "~/services/permissions/permissionManager"
import {
  completePopupCriticalFlow,
  POPUP_CRITICAL_FLOWS,
  startPopupCriticalFlow,
} from "~/services/popupInterruptionHint"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  type ProductAnalyticsActionInsights,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SITE_TYPES,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsSiteType,
} from "~/services/productAnalytics/contracts"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnosticsError"
import { trackOptionalPermissionRequestResult } from "~/services/productAnalytics/permissions"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import {
  AuthTypeEnum,
  type ApiToken,
  type CheckInConfig,
  type DisplaySiteData,
  type SiteAccount,
} from "~/types"
import type { CheckInMethodSelection } from "~/types/checkIn"
import type { AccountSaveResponse } from "~/types/serviceResponse"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import { isExtensionPopup } from "~/utils/browser"
import {
  getActiveTabs,
  isMessageReceiverUnavailableError,
  onTabActivated,
  onTabUpdated,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showUpdateToast, showWarningToast } from "~/utils/core/toastHelpers"
import { tryParseOrigin } from "~/utils/core/urlParsing"
import { openSettingsTab } from "~/utils/navigation"

import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  ACCOUNT_DIALOG_PHASES,
  createEmptyAccountDialogDraft,
  type AccountDialogDraft,
  type AccountDialogFormSource,
  type AccountDialogPhase,
  type AddAccountPrefill,
} from "../models"
import { useOpenRouterAccountOnboarding } from "./useOpenRouterAccountOnboarding"

const AUTO_DETECT_SLOW_HINT_DELAY_MS = 10_000

interface CurrentTabCookieImportContext {
  origin: string
  tabId?: number
  incognito?: boolean
  cookieStoreId?: string
}

/**
 * Captures the current tab context needed to import cookies from the same browser profile.
 */
function createCurrentTabCookieImportContext(
  tab: browser.tabs.Tab,
  origin: string,
): CurrentTabCookieImportContext {
  return {
    origin,
    ...(typeof tab.id === "number" ? { tabId: tab.id } : {}),
    ...(tab.incognito === true ? { incognito: true } : {}),
    ...(typeof tab.cookieStoreId === "string" && tab.cookieStoreId.trim()
      ? { cookieStoreId: tab.cookieStoreId.trim() }
      : {}),
  }
}

/**
 * Reuses the active tab only when it belongs to the target origin and browser profile.
 */
function createCurrentTabBrowserSessionContext(
  context: CurrentTabCookieImportContext | null,
  targetUrl: string,
): ResolveAccountBrowserSessionOptions["currentTab"] | undefined {
  const targetOrigin = tryParseOrigin(targetUrl)
  if (
    !context ||
    !targetOrigin ||
    targetOrigin !== context.origin ||
    typeof context.tabId !== "number"
  ) {
    return undefined
  }

  return {
    tabId: context.tabId,
    incognito: context.incognito === true,
    ...(context.cookieStoreId ? { cookieStoreId: context.cookieStoreId } : {}),
  }
}

/**
 * Logger scoped to the account dialog lifecycle. Ensure we never include raw tokens/cookies in log details.
 */
const logger = createLogger("AccountDialogHook")

/**
 * Refreshes saved account data after the save command has persisted the account.
 */
async function refreshPostSaveAccount(
  accountId: string,
  tempWindowRequestSource: TempWindowRequestSource,
  protectionBypassExecution: ProtectionBypassExecution,
  onPostSaveAccountRefresh?: (accountIds: string[]) => Promise<void>,
) {
  try {
    const result = await accountRefresh.refreshAccount(accountId, true, {
      tempWindowRequestSource,
      protectionBypassExecution,
    })
    if (!result?.refreshed) {
      return
    }

    if (onPostSaveAccountRefresh) {
      await onPostSaveAccountRefresh([accountId])
    }

    try {
      await sendRuntimeMessage(
        {
          action: RuntimeActionIds.AccountRefreshCompleted,
          updatedAccountIds: [accountId],
        },
        { maxAttempts: 1 },
      )
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      if (isMessageReceiverUnavailableError(error)) {
        logger.debug("Post-save account refresh notification ignored", {
          accountId,
          error: errorMessage,
        })
        return
      }

      logger.warn("Post-save account refresh notification failed", {
        accountId,
        error: errorMessage,
      })
    }
  } catch (error) {
    logger.warn("Post-save initial account refresh failed", {
      accountId,
      error: getErrorMessage(error),
    })
  }
}

interface CookieAuthPermissionState {
  granted: boolean | null
  pending: boolean
}

const createInitialCookieAuthPermissionState =
  (): CookieAuthPermissionState => ({
    granted: null,
    pending: false,
  })

const getCookieAuthAdvancedPermissions = (): ManifestOptionalPermissions[] => {
  const advancedCandidates: ManifestOptionalPermissions[] = []

  if (
    OPTIONAL_PERMISSIONS.includes(
      OPTIONAL_PERMISSION_IDS.declarativeNetRequestWithHostAccess,
    )
  ) {
    advancedCandidates.push(
      OPTIONAL_PERMISSION_IDS.declarativeNetRequestWithHostAccess,
    )
  }

  if (OPTIONAL_PERMISSIONS.includes(OPTIONAL_PERMISSION_IDS.WebRequest)) {
    advancedCandidates.push(OPTIONAL_PERMISSION_IDS.WebRequest)
  }

  if (
    OPTIONAL_PERMISSIONS.includes(OPTIONAL_PERMISSION_IDS.WebRequestBlocking)
  ) {
    advancedCandidates.push(OPTIONAL_PERMISSION_IDS.WebRequestBlocking)
  }

  return advancedCandidates
}

const getCookieAuthPermissions = (): ManifestOptionalPermissions[] => {
  const permissions: ManifestOptionalPermissions[] = []

  if (OPTIONAL_PERMISSIONS.includes(OPTIONAL_PERMISSION_IDS.Cookies)) {
    permissions.push(OPTIONAL_PERMISSION_IDS.Cookies)
  }

  permissions.push(...getCookieAuthAdvancedPermissions())

  return permissions
}

interface CookieImportResponse {
  success?: boolean
  data?: string
  error?: string
  errorCode?: string
}

interface UseAccountDialogProps {
  mode: DialogMode
  account?: DisplaySiteData | null
  prefill?: AddAccountPrefill | null
  isOpen: boolean
  onClose: () => void
  onPostSaveAccountRefresh?: (accountIds: string[]) => Promise<void>
  onSuccess?: (data: any) => void
}

interface ManagedSiteConfigPromptState {
  isOpen: boolean
  managedSiteLabel: string
  missingMessage: string
}

interface AihubmixPostSaveKeyPromptState {
  isOpen: boolean
  accountId: string | null
  accountName: string
  isCreating: boolean
}

/**
 * Hook encapsulating the full lifecycle of the account dialog including detection, validation, and persistence logic.
 * @param props Hook configuration supporting add/edit modes and callbacks.
 * @param props.mode Current dialog mode (add or edit).
 * @param props.account Account record to edit when in edit mode.
 * @param props.prefill Optional add-mode prefill.
 * @param props.isOpen Whether the dialog is currently open.
 * @param props.onClose Handler invoked when dialog closes.
 * @param props.onPostSaveAccountRefresh Optional handler invoked after deferred account refresh completes.
 * @param props.onSuccess Optional handler invoked after successful save.
 * @returns Aggregated state, setters, and handlers powering the dialog UI.
 */
export function useAccountDialog({
  mode,
  account,
  prefill,
  isOpen,
  onClose,
  onPostSaveAccountRefresh,
  onSuccess,
}: UseAccountDialogProps) {
  const { t } = useTranslation(["accountDialog", "settings", "messages"])
  const {
    warnOnDuplicateAccountAdd,
    managedSiteType,
    autoFillCurrentSiteUrlOnAccountAdd,
    autoProvisionKeyOnAccountAdd,
    updateWarnOnDuplicateAccountAdd,
  } = useUserPreferencesContext()

  const [url, setUrl] = useState("")
  const [isDetecting, setIsDetecting] = useState(false)
  const [isDetectingSlow, setIsDetectingSlow] = useState(false)
  const [draft, setDraft] = useState<AccountDialogDraft>(
    createEmptyAccountDialogDraft,
  )
  const checkInSelectionChangedRef = useRef(false)
  const checkInDiscoveryBaseSelectionRef =
    useRef<CheckInMethodSelection | null>(null)
  const initialFlowState = getInitialFlowState(mode)
  const [phase, setPhase] = useState<AccountDialogPhase>(initialFlowState.phase)
  const [formSource, setFormSource] = useState<AccountDialogFormSource>(
    initialFlowState.formSource,
  )
  const [isSaving, setIsSaving] = useState(false)
  const [showAccessToken, setShowAccessToken] = useState(false)
  const [detectionError, setDetectionError] = useState<AutoDetectError | null>(
    null,
  )
  const [currentTabUrl, setCurrentTabUrl] = useState<string | null>(null)
  const [isAutoConfiguring, setIsAutoConfiguring] = useState(false)
  const {
    recovery: openRouterOnboardingRecovery,
    resetSession: resetOpenRouterOnboardingSession,
    notifyUrlChange: notifyOpenRouterUrlChange,
    notifySiteChange: notifyOpenRouterSiteChange,
    notifyCredentialChange: notifyOpenRouterCredentialChange,
    tryPrepareForStart: tryPrepareOpenRouterOnboardingStart,
    releasePreparation: releaseOpenRouterOnboardingPreparation,
    abandonForOtherAutoDetect: abandonOpenRouterOnboardingForOtherAutoDetect,
    startPrepared: startPreparedOpenRouterOnboarding,
    beforeClose: beforeOpenRouterOnboardingClose,
    confirmSavedCredential: confirmSavedOpenRouterCredential,
  } = useOpenRouterAccountOnboarding()
  const [isImportingCookies, setIsImportingCookies] = useState(false)
  const [showCookiePermissionWarning, setShowCookiePermissionWarning] =
    useState(false)
  const [cookieAuthPermissionState, setCookieAuthPermissionState] =
    useState<CookieAuthPermissionState>(createInitialCookieAuthPermissionState)
  const [isImportingSub2apiSession, setIsImportingSub2apiSession] =
    useState(false)
  const [accountPostSaveWorkflowStep, setAccountPostSaveWorkflowStep] =
    useState<AccountPostSaveWorkflowStep>(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
  const [postSaveOneTimeToken, setPostSaveOneTimeToken] =
    useState<ApiToken | null>(null)
  const [postSaveOneTimeSecret, setPostSaveOneTimeSecret] =
    useState<CreatedRuntimeSecret | null>(null)
  const [postSaveSub2ApiAllowedGroups, setPostSaveSub2ApiAllowedGroups] =
    useState<string[] | null>(null)
  const [postSaveSub2ApiAccount, setPostSaveSub2ApiAccount] =
    useState<DisplaySiteData | null>(null)
  const [postSaveSub2ApiDialogSessionId, setPostSaveSub2ApiDialogSessionId] =
    useState<number | null>(null)

  const [duplicateAccountWarning, setDuplicateAccountWarning] = useState<{
    isOpen: boolean
    siteUrl: string
    existingAccountsCount: number
    existingUsername: string | null
    existingUserId: string | number | null
  }>({
    isOpen: false,
    siteUrl: "",
    existingAccountsCount: 0,
    existingUsername: null,
    existingUserId: null,
  })
  const [managedSiteConfigPrompt, setManagedSiteConfigPrompt] =
    useState<ManagedSiteConfigPromptState>({
      isOpen: false,
      managedSiteLabel: "",
      missingMessage: "",
    })
  const [aihubmixPostSaveKeyPrompt, setAihubmixPostSaveKeyPrompt] =
    useState<AihubmixPostSaveKeyPromptState>({
      isOpen: false,
      accountId: null,
      accountName: "",
      isCreating: false,
    })
  const duplicateAccountWarningResolverRef = useRef<
    ((shouldContinue: boolean) => void) | null
  >(null)
  const duplicateAccountWarningAcknowledgedSiteUrlRef = useRef<string | null>(
    null,
  )
  const selectedSiteUrlRef = useRef("")
  const selectedSiteTypeRef = useRef<AccountSiteType>(SITE_TYPES.UNKNOWN)
  const isCloseTransitionStartedRef = useRef(false)
  const currentTabSiteNameRef = useRef("")
  const hasConsumedAutoFillCurrentSiteUrlRef = useRef(false)
  const hasExplicitAuthTypeRef = useRef(false)
  // Serializes ownership of analytics, detection UI, and popup lifecycle
  // across provider changes until the admitted workflow fully unwinds.
  const autoDetectInvocationLeaseRef = useRef<symbol | null>(null)
  // Also invalidates stale results when a reset reuses the same URL.
  const autoDetectRunGenerationRef = useRef(0)
  const automaticExecutionPreferenceChangedRef = useRef(false)
  const sub2apiRefreshTokenPreferenceChangedRef = useRef(false)

  const siteName = draft.siteName
  const username = draft.username
  const accessToken = draft.accessToken
  const userId = draft.userId
  const exchangeRate = draft.exchangeRate
  const manualBalanceUsd = draft.manualBalanceUsd
  const notes = draft.notes
  const tagIds = draft.tagIds
  const excludeFromTotalBalance = draft.excludeFromTotalBalance
  const excludeFromTodayIncome = draft.excludeFromTodayIncome
  const checkIn = draft.checkIn
  const siteType = draft.siteType
  const authType = draft.authType
  const cookieAuthSessionCookie = draft.cookieAuthSessionCookie
  const sub2apiUseRefreshToken = draft.sub2apiUseRefreshToken
  const sub2apiRefreshToken = draft.sub2apiRefreshToken
  const sub2apiTokenExpiresAt = draft.sub2apiTokenExpiresAt
  const currentSitePolicy = getAccountDialogSitePolicy(siteType)
  selectedSiteUrlRef.current = url
  selectedSiteTypeRef.current = siteType
  const isDetected =
    phase === ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM &&
    formSource === ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
  const showManualForm =
    phase === ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM &&
    formSource !== ACCOUNT_DIALOG_FORM_SOURCES.DETECTED

  useEffect(() => {
    notifyOpenRouterUrlChange(url)
  }, [notifyOpenRouterUrlChange, url])

  useEffect(() => {
    notifyOpenRouterSiteChange(siteType)
  }, [notifyOpenRouterSiteChange, siteType])

  useEffect(() => {
    notifyOpenRouterCredentialChange(accessToken)
  }, [accessToken, notifyOpenRouterCredentialChange])

  const updateDraft = useCallback(
    (updater: (prev: AccountDialogDraft) => AccountDialogDraft) => {
      setDraft((prev) => updater(prev))
    },
    [],
  )
  const {
    isRedetectingCheckInMethods,
    checkInRedetectionFeedback,
    handleRedetectCheckInMethods,
    resetCheckInRedetection,
  } = useAccountCheckInRedetection({
    accountId: account?.id,
    draft,
    url,
    mode,
    selectedSiteTypeRef,
    selectedSiteUrlRef,
    discoveryBaseSelectionRef: checkInDiscoveryBaseSelectionRef,
    updateDraft,
  })
  const setDialogUrl = useCallback(
    (value: string) => {
      autoDetectRunGenerationRef.current += 1
      resetCheckInRedetection()
      notifyOpenRouterUrlChange(value)
      selectedSiteUrlRef.current = value
      setUrl(value)
    },
    [notifyOpenRouterUrlChange, resetCheckInRedetection],
  )
  const setSiteName = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, siteName: value }))
    },
    [updateDraft],
  )
  const setUsername = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, username: value }))
    },
    [updateDraft],
  )
  const setAccessToken = useCallback(
    (value: string) => {
      notifyOpenRouterCredentialChange(value)
      updateDraft((prev) => ({ ...prev, accessToken: value }))
    },
    [notifyOpenRouterCredentialChange, updateDraft],
  )
  const setUserId = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, userId: value }))
    },
    [updateDraft],
  )
  const setExchangeRate = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, exchangeRate: value }))
    },
    [updateDraft],
  )
  const setManualBalanceUsd = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, manualBalanceUsd: value }))
    },
    [updateDraft],
  )
  const setNotes = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, notes: value }))
    },
    [updateDraft],
  )
  const setTagIds = useCallback(
    (value: string[]) => {
      updateDraft((prev) => ({ ...prev, tagIds: value }))
    },
    [updateDraft],
  )
  const setExcludeFromTotalBalance = useCallback(
    (value: boolean) => {
      updateDraft((prev) => ({ ...prev, excludeFromTotalBalance: value }))
    },
    [updateDraft],
  )
  const setExcludeFromTodayIncome = useCallback(
    (value: boolean) => {
      updateDraft((prev) => ({ ...prev, excludeFromTodayIncome: value }))
    },
    [updateDraft],
  )
  const setCheckIn = useCallback(
    (value: CheckInConfig) => {
      if (
        value.automaticExecutionEnabled !== checkIn.automaticExecutionEnabled
      ) {
        automaticExecutionPreferenceChangedRef.current = true
      }
      updateDraft((prev) => ({ ...prev, checkIn: value }))
    },
    [checkIn.automaticExecutionEnabled, updateDraft],
  )
  const setCheckInSelectionDraft = useCallback(
    (value: CheckInConfig) => {
      checkInSelectionChangedRef.current = true
      setCheckIn(value)
      const candidateMethodIds = getAutoCheckinCandidateMethodIds(siteType)
      const inspection = inspectAccountCheckIn({
        config: value,
        siteType,
      })
      startAccountDialogAnalyticsAction(
        PRODUCT_ANALYTICS_ACTION_IDS.SetCheckInMethodSelection,
      ).complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: {
          checkInDiscoveryDecision: inspection.decision.outcome,
          checkInCandidateCount: candidateMethodIds.length,
          checkInSelectionSource: value.selection.mode,
          checkInRecoveryAction:
            value.selection.mode === CHECK_IN_SELECTION_MODES.Manual
              ? "manual_override"
              : "restore_automatic",
        },
      })
    },
    [setCheckIn, siteType],
  )
  const setSiteType = useCallback(
    (value: string) => {
      resetCheckInRedetection()
      const nextSiteType = isAccountSiteType(value) ? value : SITE_TYPES.UNKNOWN
      const nextPolicy = getAccountDialogSitePolicy(nextSiteType)
      selectedSiteTypeRef.current = nextSiteType
      const { clearCreatedCredential } =
        notifyOpenRouterSiteChange(nextSiteType)
      updateDraft((prev) => {
        const previousPolicy = getAccountDialogSitePolicy(prev.siteType)
        const shouldRebuildCompatibilityConfig =
          mode === DIALOG_MODES.ADD && prev.siteType !== nextSiteType
        const checkIn = shouldRebuildCompatibilityConfig
          ? createCompatibilityCheckInConfig({
              siteType: nextSiteType,
              supported: hasNewAccountCompatibilityRegistration(nextSiteType),
              automaticExecutionEnabled:
                resolveNewAccountAutomaticExecutionEnabled({
                  siteType: nextSiteType,
                  currentAutomaticExecutionEnabled:
                    prev.checkIn.automaticExecutionEnabled,
                  userPreferenceChanged:
                    automaticExecutionPreferenceChangedRef.current,
                }),
              customCheckIn: prev.checkIn.customCheckIn,
            })
          : prev.checkIn
        const shouldApplyDefaultName =
          !prev.siteName.trim() ||
          prev.siteName.trim() === (previousPolicy.defaultSiteName ?? "")
        const shouldClearOpenRouterIdentity =
          prev.siteType !== nextSiteType &&
          prev.siteType === SITE_TYPES.OPENROUTER
        return normalizeAccountDialogDraftForSitePolicy({
          draft: {
            ...prev,
            siteType: nextSiteType,
            checkIn,
            ...(shouldClearOpenRouterIdentity ? { userId: "" } : {}),
            ...(clearCreatedCredential ? { accessToken: "" } : {}),
            ...(shouldApplyDefaultName
              ? { siteName: nextPolicy.defaultSiteName ?? "" }
              : {}),
          },
          policy: nextPolicy,
        })
      })
      if (nextPolicy.canonicalSiteUrl) {
        setDialogUrl(nextPolicy.canonicalSiteUrl)
      }
    },
    [
      mode,
      setDialogUrl,
      notifyOpenRouterSiteChange,
      resetCheckInRedetection,
      updateDraft,
    ],
  )
  const setAuthType = useCallback(
    (value: AuthTypeEnum) => {
      if (!isAccountAuthType(value)) return

      hasExplicitAuthTypeRef.current = true
      updateDraft((prev) => ({ ...prev, authType: value }))
    },
    [updateDraft],
  )
  const applyAuthDefaultForUrl = useCallback(
    (siteUrl: string) => {
      if (hasExplicitAuthTypeRef.current) return

      updateDraft((prev) => ({
        ...prev,
        authType: resolveDefaultAccountAuthType({ siteUrl }),
      }))
    },
    [updateDraft],
  )
  const setCookieAuthSessionCookie = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, cookieAuthSessionCookie: value }))
    },
    [updateDraft],
  )
  const refreshCookieAuthPermissionState = useCallback(async () => {
    try {
      const cookieAuthPermissions = getCookieAuthPermissions()
      const granted = await hasPermissions(cookieAuthPermissions)

      setCookieAuthPermissionState((prev) => ({
        ...prev,
        granted,
      }))
    } catch (error) {
      logger.warn("Failed to refresh cookie auth permission state", { error })
      setCookieAuthPermissionState((prev) => ({
        ...prev,
        granted: false,
      }))
    }
  }, [])
  const setSub2apiUseRefreshToken = useCallback(
    (value: boolean) => {
      updateDraft((prev) => ({ ...prev, sub2apiUseRefreshToken: value }))
    },
    [updateDraft],
  )
  const setSub2apiRefreshToken = useCallback(
    (value: string) => {
      updateDraft((prev) => ({ ...prev, sub2apiRefreshToken: value }))
    },
    [updateDraft],
  )
  const setSub2apiTokenExpiresAt = useCallback(
    (value: number | null) => {
      updateDraft((prev) => ({ ...prev, sub2apiTokenExpiresAt: value }))
    },
    [updateDraft],
  )
  const setDraftPartial = useCallback(
    (value: Partial<AccountDialogDraft>) => {
      updateDraft((prev) => ({ ...prev, ...value }))
    },
    [updateDraft],
  )
  const enterForm = useCallback((source: AccountDialogFormSource) => {
    setPhase(ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM)
    setFormSource(source)
  }, [])

  const cancelPendingDuplicateAccountWarning = useCallback(() => {
    duplicateAccountWarningResolverRef.current?.(false)
    duplicateAccountWarningResolverRef.current = null
    duplicateAccountWarningAcknowledgedSiteUrlRef.current = null
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setDuplicateAccountWarning((prev) =>
        prev.isOpen ? { ...prev, isOpen: false } : prev,
      )
    }

    return () => {
      cancelPendingDuplicateAccountWarning()
    }
  }, [cancelPendingDuplicateAccountWarning, isOpen])

  useEffect(() => {
    if (!isOpen || authType !== AuthTypeEnum.Cookie) {
      return
    }

    void refreshCookieAuthPermissionState()
    const unsubscribe = onOptionalPermissionsChanged(() => {
      void refreshCookieAuthPermissionState()
    })

    return () => {
      unsubscribe()
    }
  }, [authType, isOpen, refreshCookieAuthPermissionState])

  const requestDuplicateAccountAddConfirmation = useCallback(
    (params: {
      siteUrl: string
      existingAccountsCount: number
      existingUsername?: string | null
      existingUserId?: string | number | null
    }) => {
      // If the user triggers the same flow multiple times quickly, cancel the
      // previous pending promise to avoid leaving it unresolved.
      if (duplicateAccountWarningResolverRef.current) {
        duplicateAccountWarningResolverRef.current(false)
      }

      setDuplicateAccountWarning({
        isOpen: true,
        siteUrl: params.siteUrl,
        existingAccountsCount: params.existingAccountsCount,
        existingUsername: params.existingUsername ?? null,
        existingUserId: params.existingUserId ?? null,
      })

      return new Promise<boolean>((resolve) => {
        duplicateAccountWarningResolverRef.current = resolve
      })
    },
    [],
  )

  const ensureExactCredentialDuplicateConfirmation = useCallback(async () => {
    if (
      !warnOnDuplicateAccountAdd ||
      siteType !== SITE_TYPES.OPENROUTER ||
      !accessToken.trim()
    ) {
      return true
    }
    if (
      mode === DIALOG_MODES.EDIT &&
      account?.token?.trim() === accessToken.trim()
    ) {
      return true
    }

    let accounts: Awaited<ReturnType<typeof accountQueries.getAllAccounts>>
    try {
      accounts = await accountQueries.getAllAccountsOrThrow()
    } catch {
      logger.warn(
        "Exact-credential duplicate lookup failed; continuing without warning",
        {
          siteType: SITE_TYPES.OPENROUTER,
          status: "storage_lookup_failed",
          category: "duplicate_check",
        },
      )
      return true
    }
    const duplicateId = findExactCredentialDuplicateAccountId({
      accounts,
      siteType: SITE_TYPES.OPENROUTER,
      accessToken,
      excludeAccountId: mode === DIALOG_MODES.EDIT ? account?.id : undefined,
    })
    if (!duplicateId) return true

    return requestDuplicateAccountAddConfirmation({
      siteUrl: url.trim(),
      existingAccountsCount: 1,
    })
  }, [
    accessToken,
    account?.id,
    account?.token,
    mode,
    requestDuplicateAccountAddConfirmation,
    siteType,
    url,
    warnOnDuplicateAccountAdd,
  ])

  const ensureDuplicateAccountAddConfirmation = useCallback(async () => {
    if (mode !== DIALOG_MODES.ADD || !warnOnDuplicateAccountAdd) {
      return true
    }

    if (siteType === SITE_TYPES.OPENROUTER) {
      return true
    }

    const baseUrl = url.trim()
    const normalizedBaseUrl = normalizeSiteUrlForDuplicateCheck({
      value: baseUrl,
      siteType,
    })
    const currentUserId = normalizeAccountIdentity(userId)
    const currentUserRecord = currentUserId
      ? { id: currentUserId, username: currentUserId }
      : null

    if (!baseUrl) {
      return true
    }

    if (
      duplicateAccountWarningAcknowledgedSiteUrlRef.current ===
      normalizedBaseUrl
    ) {
      return true
    }

    let accounts: Awaited<ReturnType<typeof accountQueries.getAllAccounts>>
    try {
      accounts = await accountQueries.getAllAccountsOrThrow()
    } catch (error) {
      logger.warn(
        "Duplicate-account lookup failed; continuing without warning",
        {
          error,
          siteUrl: normalizedBaseUrl,
        },
      )
      return true
    }
    const existingSiteAccounts = accounts.filter((acc) => {
      return isSameAccountSiteOrigin(
        {
          url: acc.site_url,
          siteType: acc.site_type,
        },
        {
          url: baseUrl,
        },
      )
    })

    if (existingSiteAccounts.length === 0) {
      return true
    }

    const warningSiteUrl = normalizeSiteUrlForDuplicateCheck({
      value: existingSiteAccounts[0].site_url,
      siteType: existingSiteAccounts[0].site_type,
    })

    const exactMatch = currentUserId
      ? existingSiteAccounts.find((acc) =>
          doAccountSiteIdentitiesMatch({
            siteType: acc.site_type,
            savedUser: acc.account_info,
            currentUser: currentUserRecord,
          }),
        )
      : undefined

    const shouldContinue = await requestDuplicateAccountAddConfirmation({
      siteUrl: warningSiteUrl,
      existingAccountsCount: existingSiteAccounts.length,
      ...(exactMatch
        ? {
            existingUserId: exactMatch.account_info.id,
            existingUsername: exactMatch.account_info.username,
          }
        : {}),
    })

    if (!shouldContinue) {
      return false
    }

    duplicateAccountWarningAcknowledgedSiteUrlRef.current = normalizedBaseUrl
    return true
  }, [
    mode,
    requestDuplicateAccountAddConfirmation,
    siteType,
    url,
    userId,
    warnOnDuplicateAccountAdd,
  ])

  const handleDuplicateAccountWarningCancel = useCallback(() => {
    setDuplicateAccountWarning((prev) =>
      prev.isOpen ? { ...prev, isOpen: false } : prev,
    )
    duplicateAccountWarningResolverRef.current?.(false)
    duplicateAccountWarningResolverRef.current = null
  }, [])

  const handleDuplicateAccountWarningContinue = useCallback(() => {
    setDuplicateAccountWarning((prev) =>
      prev.isOpen ? { ...prev, isOpen: false } : prev,
    )
    duplicateAccountWarningResolverRef.current?.(true)
    duplicateAccountWarningResolverRef.current = null
  }, [])

  const handleDuplicateAccountWarningDisableAndContinue =
    useCallback(async () => {
      let result: Awaited<
        ReturnType<typeof updateWarnOnDuplicateAccountAdd>
      > | null = null
      try {
        result = await updateWarnOnDuplicateAccountAdd(false)
      } catch (error) {
        logger.warn("Failed to disable duplicate-account warning preference", {
          error,
        })
      }

      if (!result?.ok) {
        showUpdateToast(
          result ?? false,
          t("settings:duplicateAccountWarningOnAdd.toggleLabel"),
        )
        return
      }

      setDuplicateAccountWarning((prev) =>
        prev.isOpen ? { ...prev, isOpen: false } : prev,
      )
      duplicateAccountWarningResolverRef.current?.(true)
      duplicateAccountWarningResolverRef.current = null
    }, [t, updateWarnOnDuplicateAccountAdd])

  useEffect(() => {
    const policy = getAccountDialogSitePolicy(siteType)

    updateDraft((prev) =>
      normalizeAccountDialogDraftForSitePolicy({
        draft: prev,
        policy,
      }),
    )
  }, [siteType, updateDraft])

  // useRef 保存跨渲染引用
  const newAccountRef = useRef<any>(null)
  const targetAccountRef = useRef<any>(null)
  const pendingPostSaveChannelRef = useRef<{
    displaySiteData: DisplaySiteData
    token?: ApiToken
    existingTokenIds?: number[]
  } | null>(null)
  const pendingAihubmixPostSaveSuccessRef = useRef<string | null>(null)
  const postSaveAutoConfigRunRef = useRef(0)
  const aihubmixPostSaveKeyRunRef = useRef(0)
  const nextPostSaveSub2ApiDialogSessionIdRef = useRef(0)
  const activePostSaveSub2ApiDialogSessionIdRef = useRef<number | null>(null)
  const detectSlowHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const currentTabDetectionRunRef = useRef(0)
  const detectedCookieStoreIdRef = useRef<string | null>(null)
  const currentTabCookieImportContextRef =
    useRef<CurrentTabCookieImportContext | null>(null)

  const {
    openWithAccount: openChannelDialog,
    openDefaultTokenQuickCreateDialogForAccount,
  } = useChannelDialog()

  const invalidatePostSaveAutoConfigRun = useCallback(() => {
    postSaveAutoConfigRunRef.current += 1
  }, [])

  const openPostSaveSub2ApiDialogSession = useCallback(() => {
    const nextSessionId = nextPostSaveSub2ApiDialogSessionIdRef.current + 1
    nextPostSaveSub2ApiDialogSessionIdRef.current = nextSessionId
    activePostSaveSub2ApiDialogSessionIdRef.current = nextSessionId
    setPostSaveSub2ApiDialogSessionId(nextSessionId)
    return nextSessionId
  }, [])

  const invalidatePostSaveSub2ApiDialogSession = useCallback(() => {
    activePostSaveSub2ApiDialogSessionIdRef.current = null
    setPostSaveSub2ApiDialogSessionId(null)
  }, [])

  const clearPostSaveWorkflowState = useCallback(() => {
    invalidatePostSaveAutoConfigRun()
    invalidatePostSaveSub2ApiDialogSession()
    aihubmixPostSaveKeyRunRef.current += 1
    setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
    setPostSaveOneTimeToken(null)
    setPostSaveOneTimeSecret(null)
    setPostSaveSub2ApiAllowedGroups(null)
    setPostSaveSub2ApiAccount(null)
    setAihubmixPostSaveKeyPrompt({
      isOpen: false,
      accountId: null,
      accountName: "",
      isCreating: false,
    })
    pendingAihubmixPostSaveSuccessRef.current = null
    pendingPostSaveChannelRef.current = null
  }, [invalidatePostSaveAutoConfigRun, invalidatePostSaveSub2ApiDialogSession])

  const completePendingAihubmixPostSaveSuccess = useCallback(() => {
    const savedAccountId = pendingAihubmixPostSaveSuccessRef.current
    pendingAihubmixPostSaveSuccessRef.current = null
    if (savedAccountId) {
      onSuccess?.(savedAccountId)
    }
  }, [onSuccess])

  const openAihubmixPostSaveKeyPrompt = useCallback(
    (params: { accountId: string; accountName: string }) => {
      aihubmixPostSaveKeyRunRef.current += 1
      pendingAihubmixPostSaveSuccessRef.current = params.accountId
      setAihubmixPostSaveKeyPrompt({
        isOpen: true,
        accountId: params.accountId,
        accountName: params.accountName,
        isCreating: false,
      })
    },
    [],
  )

  const handleAihubmixNormalSaveForegroundKeyFlow = useCallback(
    async (params: { accountId: string; accountName: string }) => {
      const runId = aihubmixPostSaveKeyRunRef.current
      const isCurrentRun = () => aihubmixPostSaveKeyRunRef.current === runId
      const savedAccountId = params.accountId.trim()
      if (!savedAccountId) return

      const openPrompt = () => {
        if (!isCurrentRun()) return

        openAihubmixPostSaveKeyPrompt({
          accountId: savedAccountId,
          accountName: params.accountName,
        })
      }

      try {
        const savedAccount = await accountQueries.getAccountById(savedAccountId)
        if (!isCurrentRun()) return

        if (!savedAccount) {
          openPrompt()
          return
        }

        const displaySiteData =
          (await accountReadModels.getDisplayDataById(savedAccountId)) ??
          accountPresentation.convertToDisplayData(savedAccount)
        if (!isCurrentRun()) return

        const inventoryState = await inspectAccountTokenInventory({
          displaySiteData,
        })
        if (!isCurrentRun()) return

        if (
          inventoryState.kind === ACCOUNT_TOKEN_INVENTORY_STATE_KINDS.Present
        ) {
          onSuccess?.(savedAccountId)
          return
        }

        openPrompt()
      } catch {
        openPrompt()
      }
    },
    [onSuccess, openAihubmixPostSaveKeyPrompt],
  )

  const resetForm = useCallback(
    (nextPrefill?: AddAccountPrefill | null) => {
      autoDetectRunGenerationRef.current += 1
      newAccountRef.current = null
      isCloseTransitionStartedRef.current = false
      detectedCookieStoreIdRef.current = null
      currentTabCookieImportContextRef.current = null
      currentTabSiteNameRef.current = ""
      duplicateAccountWarningAcknowledgedSiteUrlRef.current = null
      hasConsumedAutoFillCurrentSiteUrlRef.current = Boolean(nextPrefill)
      const nextSiteType = nextPrefill?.siteType ?? SITE_TYPES.UNKNOWN
      selectedSiteTypeRef.current = nextSiteType
      const policy = getAccountDialogSitePolicy(nextSiteType)
      hasExplicitAuthTypeRef.current = Boolean(nextPrefill?.authType)
      const nextUrl = nextPrefill?.siteUrl ?? ""
      selectedSiteUrlRef.current = nextUrl
      resetOpenRouterOnboardingSession({
        url: nextUrl,
        siteType: nextSiteType,
        credential: "",
      })
      setUrl(nextUrl)
      automaticExecutionPreferenceChangedRef.current = false
      sub2apiRefreshTokenPreferenceChangedRef.current = false
      const emptyDraft = createEmptyAccountDialogDraft(nextSiteType)
      const nextDraft = {
        ...emptyDraft,
        siteType: nextSiteType,
        authType: nextPrefill?.authType ?? AuthTypeEnum.AccessToken,
      }
      setDraft(
        normalizeAccountDialogDraftForSitePolicy({ draft: nextDraft, policy }),
      )
      checkInSelectionChangedRef.current = false
      checkInDiscoveryBaseSelectionRef.current = null
      const nextFlowState = getInitialFlowState(mode)
      setPhase(nextFlowState.phase)
      setFormSource(
        resolvePrefillFormSource(nextPrefill, nextFlowState.formSource),
      )
      setShowAccessToken(false)
      setDetectionError(null)
      resetCheckInRedetection()
      setCurrentTabUrl(null)
      setIsAutoConfiguring(false)
      setIsImportingCookies(false)
      setShowCookiePermissionWarning(false)
      setIsImportingSub2apiSession(false)
      clearPostSaveWorkflowState()
      targetAccountRef.current = null
    },
    [
      clearPostSaveWorkflowState,
      mode,
      resetCheckInRedetection,
      resetOpenRouterOnboardingSession,
    ],
  )

  const loadAccountData = useCallback(
    async (accountId: string) => {
      try {
        const siteAccount = await accountQueries.getAccountById(accountId)
        if (siteAccount) {
          setUrl(siteAccount.site_url)
          const refreshToken = siteAccount.sub2apiAuth?.refreshToken ?? ""
          const normalizedSiteType = resolveStoredSiteType(
            siteAccount.site_type,
            Boolean(siteAccount.sub2apiAuth),
          )
          selectedSiteUrlRef.current = siteAccount.site_url
          selectedSiteTypeRef.current = normalizedSiteType
          const policy = getAccountDialogSitePolicy(normalizedSiteType)
          const hasActiveSub2ApiRefreshToken =
            policy.allowSub2ApiRefreshTokenState && Boolean(refreshToken.trim())
          hasExplicitAuthTypeRef.current = true
          setDraft(
            normalizeAccountDialogDraftForSitePolicy({
              draft: {
                siteName: siteAccount.site_name,
                username: siteAccount.account_info.username,
                accessToken: siteAccount.account_info.access_token,
                userId:
                  normalizeAccountIdentity(siteAccount.account_info.id) ?? "",
                exchangeRate: siteAccount.exchange_rate.toString(),
                manualBalanceUsd: siteAccount.manualBalanceUsd ?? "",
                notes: siteAccount.notes || "",
                tagIds: siteAccount.tagIds || [],
                excludeFromTotalBalance:
                  siteAccount.excludeFromTotalBalance === true,
                excludeFromTodayIncome:
                  siteAccount.excludeFromTodayIncome === true,
                checkIn: {
                  ...siteAccount.checkIn,
                  customCheckIn: {
                    ...siteAccount.checkIn.customCheckIn,
                    url: siteAccount.checkIn.customCheckIn?.url ?? "",
                    turnstilePreTrigger:
                      siteAccount.checkIn.customCheckIn?.turnstilePreTrigger,
                    redeemUrl:
                      siteAccount.checkIn.customCheckIn?.redeemUrl ?? "",
                    openRedeemWithCheckIn:
                      siteAccount.checkIn.customCheckIn
                        ?.openRedeemWithCheckIn ?? true,
                    isCheckedInToday:
                      siteAccount.checkIn.customCheckIn?.isCheckedInToday ??
                      false,
                    lastCheckInDate:
                      siteAccount.checkIn.customCheckIn?.lastCheckInDate,
                  },
                },
                siteType: normalizedSiteType,
                authType: siteAccount.authType || AuthTypeEnum.AccessToken,
                cookieAuthSessionCookie:
                  siteAccount.cookieAuth?.sessionCookie || "",
                sub2apiUseRefreshToken: hasActiveSub2ApiRefreshToken,
                sub2apiRefreshToken: hasActiveSub2ApiRefreshToken
                  ? refreshToken
                  : "",
                sub2apiTokenExpiresAt: hasActiveSub2ApiRefreshToken
                  ? siteAccount.sub2apiAuth?.tokenExpiresAt ?? null
                  : null,
              },
              policy,
            }),
          )
          checkInSelectionChangedRef.current = false
          checkInDiscoveryBaseSelectionRef.current = null
          enterForm(ACCOUNT_DIALOG_FORM_SOURCES.EXISTING_ACCOUNT)
        }
      } catch (error) {
        logger.error("Failed to load account data", { error, accountId })
        toast.error(t("messages.loadFailed"))
      }
    },
    [enterForm, t],
  )

  const checkCurrentTab = useCallback(async () => {
    if (mode === DIALOG_MODES.EDIT && account) {
      return
    }
    const runId = currentTabDetectionRunRef.current + 1
    currentTabDetectionRunRef.current = runId
    const isCurrentDetectionRun = () =>
      currentTabDetectionRunRef.current === runId
    const clearCurrentTabDetection = () => {
      if (!isCurrentDetectionRun()) return

      currentTabCookieImportContextRef.current = null
      currentTabSiteNameRef.current = ""
      setCurrentTabUrl(null)
      // Preserve a user-selected or typed site name when the URL field is already owned by the user.
      if (!selectedSiteUrlRef.current.trim()) {
        setSiteName("")
      }
    }
    const canApplyCurrentTabTitle = () => !selectedSiteUrlRef.current.trim()

    try {
      const tabs = await getActiveTabs()
      const tab = tabs[0]
      if (tab?.url) {
        try {
          const urlObj = new URL(tab.url)
          const baseUrl = `${urlObj.protocol}//${urlObj.host}`
          if (!baseUrl.startsWith("http")) {
            clearCurrentTabDetection()
            return
          }
          currentTabCookieImportContextRef.current =
            createCurrentTabCookieImportContext(tab, baseUrl)
          setCurrentTabUrl(baseUrl)
          const resolvedSiteName = await getSiteName(tab)
          if (!isCurrentDetectionRun()) return

          currentTabSiteNameRef.current = resolvedSiteName
          if (canApplyCurrentTabTitle()) {
            setSiteName(resolvedSiteName)
          }
        } catch (error) {
          logger.warn("Failed to parse current tab URL", {
            error,
            tabUrl: tab.url,
          })
          clearCurrentTabDetection()
        }
      } else {
        clearCurrentTabDetection()
      }
    } catch (error) {
      logger.warn("Failed to query current tab", { error })
      clearCurrentTabDetection()
    }
  }, [account, mode, setSiteName])

  useEffect(() => {
    if (isOpen) {
      const nextPrefill =
        mode === DIALOG_MODES.ADD ? normalizeAddAccountPrefill(prefill) : null
      resetForm(nextPrefill)
      if (mode === DIALOG_MODES.EDIT && account) {
        loadAccountData(account.id)
      } else {
        // Get current tab URL for add mode
        checkCurrentTab()
      }
    }
  }, [
    isOpen,
    mode,
    account,
    prefill,
    resetForm,
    loadAccountData,
    checkCurrentTab,
  ])

  useEffect(() => {
    if (!isOpen || mode !== DIALOG_MODES.ADD) {
      return
    }
    if (!autoFillCurrentSiteUrlOnAccountAdd) {
      return
    }
    if (!currentTabUrl || url.trim()) {
      return
    }
    if (hasConsumedAutoFillCurrentSiteUrlRef.current) {
      return
    }

    hasConsumedAutoFillCurrentSiteUrlRef.current = true
    setDialogUrl(currentTabUrl)
    applyAuthDefaultForUrl(currentTabUrl)
  }, [
    applyAuthDefaultForUrl,
    autoFillCurrentSiteUrlOnAccountAdd,
    currentTabUrl,
    isOpen,
    mode,
    setDialogUrl,
    url,
  ])

  useEffect(() => {
    // 打开 popup 时立即检测一次
    checkCurrentTab()

    // Tab 激活变化时检测
    const cleanupActivated = onTabActivated(() => {
      checkCurrentTab()
    })

    // Tab URL 或状态更新时检测（只对当前 tab）
    const cleanupUpdated = onTabUpdated(async (tabId) => {
      const tabs = await getActiveTabs()
      if (tabs[0]?.id === tabId) {
        checkCurrentTab()
      }
    })

    // 清理监听器
    return () => {
      cleanupActivated()
      cleanupUpdated()
    }
  }, [checkCurrentTab])

  useEffect(() => {
    if (!isDetecting) {
      setIsDetectingSlow(false)
      if (detectSlowHintTimeoutRef.current) {
        clearTimeout(detectSlowHintTimeoutRef.current)
        detectSlowHintTimeoutRef.current = null
      }
      return
    }

    setIsDetectingSlow(false)
    detectSlowHintTimeoutRef.current = setTimeout(() => {
      setIsDetectingSlow(true)
    }, AUTO_DETECT_SLOW_HINT_DELAY_MS)

    return () => {
      if (detectSlowHintTimeoutRef.current) {
        clearTimeout(detectSlowHintTimeoutRef.current)
        detectSlowHintTimeoutRef.current = null
      }
    }
  }, [isDetecting])

  const handleUrlChange = (
    newUrl: string,
    options: { applyAuthDefault?: boolean } = {},
  ) => {
    const shouldApplyAuthDefault = options.applyAuthDefault !== false
    duplicateAccountWarningAcknowledgedSiteUrlRef.current = null
    detectedCookieStoreIdRef.current = null
    hasConsumedAutoFillCurrentSiteUrlRef.current = true
    if (newUrl.trim()) {
      try {
        const urlObj = new URL(newUrl)
        const baseUrl = `${urlObj.protocol}//${urlObj.host}`
        setDialogUrl(baseUrl)
        if (shouldApplyAuthDefault) {
          applyAuthDefaultForUrl(baseUrl)
        }
      } catch (error) {
        logger.warn("Failed to normalize URL input", { error, url: newUrl })
        setDialogUrl(newUrl)
      }
    } else {
      setDialogUrl("")
      if (mode === DIALOG_MODES.ADD) {
        setSiteName("")
      }
    }
  }

  const handleUseCurrentTabUrl = () => {
    if (currentTabUrl) {
      handleUrlChange(currentTabUrl)
      if (currentTabSiteNameRef.current.trim()) {
        setSiteName(currentTabSiteNameRef.current)
      }
    }
  }

  const handleClearUrl = () => {
    hasConsumedAutoFillCurrentSiteUrlRef.current = true
    setDialogUrl("")
    if (mode === DIALOG_MODES.ADD) {
      setSiteName("")
    }
  }

  const handleClose = useCallback(async () => {
    if (isCloseTransitionStartedRef.current) return
    isCloseTransitionStartedRef.current = true
    autoDetectRunGenerationRef.current += 1
    try {
      await beforeOpenRouterOnboardingClose()
    } catch {
      logger.warn("OpenRouter onboarding close handling failed", {
        siteType: SITE_TYPES.OPENROUTER,
        status: "reconciliation_failed",
        category: "onboarding_close",
      })
    }
    handleDuplicateAccountWarningCancel()
    cancelPendingDuplicateAccountWarning()
    completePendingAihubmixPostSaveSuccess()
    clearPostSaveWorkflowState()
    setManagedSiteConfigPrompt((prev) =>
      prev.isOpen ? { ...prev, isOpen: false } : prev,
    )
    targetAccountRef.current = null
    onClose()
  }, [
    cancelPendingDuplicateAccountWarning,
    beforeOpenRouterOnboardingClose,
    clearPostSaveWorkflowState,
    completePendingAihubmixPostSaveSuccess,
    handleDuplicateAccountWarningCancel,
    onClose,
  ])

  const handleOpenCookiePermissionSettings = useCallback(() => {
    void openSettingsTab("permissions")
  }, [])

  const getCookieImportContextForUrl = useCallback((targetUrl: string) => {
    if (detectedCookieStoreIdRef.current) {
      return { cookieStoreId: detectedCookieStoreIdRef.current }
    }

    const currentTabContext = currentTabCookieImportContextRef.current
    if (!currentTabContext) {
      return {}
    }

    const targetOrigin = tryParseOrigin(targetUrl)
    if (!targetOrigin || targetOrigin !== currentTabContext.origin) {
      return {}
    }

    return {
      ...(currentTabContext.cookieStoreId
        ? { cookieStoreId: currentTabContext.cookieStoreId }
        : {}),
      ...(typeof currentTabContext.tabId === "number"
        ? { sourceTabId: currentTabContext.tabId }
        : {}),
      ...(currentTabContext.incognito === true
        ? { sourceTabIncognito: true }
        : {}),
    }
  }, [])

  const handleRequestCookieAuthPermissions = useCallback(async () => {
    const cookieAuthPermissions = getCookieAuthPermissions()

    if (cookieAuthPermissions.length === 0) {
      setCookieAuthPermissionState((prev) => ({
        ...prev,
        granted: true,
      }))
      return
    }

    setCookieAuthPermissionState((prev) => ({ ...prev, pending: true }))

    try {
      const result = await ensurePermissionsDetailed(cookieAuthPermissions)
      const granted = result.success
      for (const permissionResult of result.requestedResults) {
        trackOptionalPermissionRequestResult(permissionResult.id, {
          success: permissionResult.success,
          failureReason: permissionResult.failureReason
            ? permissionResult.failureReason
            : undefined,
          wasGrantedBefore: permissionResult.wasGrantedBefore,
          wasGrantedAfter: permissionResult.wasGrantedAfter,
        })
      }
      await refreshCookieAuthPermissionState()

      if (granted) {
        toast.success(t("messages.cookiePermissionGranted"))
      } else {
        toast.error(t("messages.cookiePermissionGrantFailed"))
      }
    } catch (error) {
      const wasGrantedBefore = cookieAuthPermissionState.granted === true
      for (const permissionId of cookieAuthPermissions) {
        trackOptionalPermissionRequestResult(permissionId, {
          success: false,
          failureReason: error,
          wasGrantedBefore,
          wasGrantedAfter: wasGrantedBefore,
        })
      }
      logger.warn("Failed to request cookie auth permissions", {
        error,
        permissions: cookieAuthPermissions,
      })
      toast.error(t("messages.cookiePermissionGrantFailed"))
    } finally {
      setCookieAuthPermissionState((prev) => ({
        ...prev,
        pending: false,
      }))
    }
  }, [cookieAuthPermissionState.granted, refreshCookieAuthPermissionState, t])

  const shouldDeferAccountSaveSuccess = useCallback(
    (result: AccountSaveResponse) => {
      const policy = getAccountDialogSitePolicy(siteType)

      return (
        shouldDeferAccountSaveSuccessForAccountDialogSite({
          policy,
          isAddMode: mode === DIALOG_MODES.ADD,
          autoProvisionKeyOnAccountAdd,
          skipAutoProvisionKeyOnAccountAdd: false,
        }) &&
        result.success === true &&
        typeof result.accountId === "string" &&
        result.accountId.trim().length > 0
      )
    },
    [autoProvisionKeyOnAccountAdd, mode, siteType],
  )

  const handleImportCookieAuthSessionCookie = async () => {
    const analyticsAction = startAccountDialogAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountCookies,
    )

    if (!url.trim()) {
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      })
      toast.error(t("messages.urlRequired"))
      return
    }
    setIsImportingCookies(true)
    try {
      const response = await sendRuntimeMessage<CookieImportResponse>({
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: url.trim(),
        ...getCookieImportContextForUrl(url.trim()),
      })
      if (response?.success && response.data) {
        setCookieAuthSessionCookie(response.data)
        setShowCookiePermissionWarning(false)
        toast.success(t("messages.importCookiesSuccess"))
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      } else {
        setShowCookiePermissionWarning(false)

        if (!response?.errorCode) {
          analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            diagnostics: {
              failure: buildActionFailureDiagnostics({
                errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
                stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Response,
                reason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape,
              }),
            },
          })
          toast.error(
            response?.error
              ? t("messages.importCookiesFailed", { error: response.error })
              : t("messages.importCookiesEmpty"),
          )
          return
        }

        switch (response.errorCode) {
          case COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied:
            setShowCookiePermissionWarning(true)
            analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
              diagnostics: {
                failure: buildActionFailureDiagnostics({
                  errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
                  stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Permission,
                  reason: PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionDenied,
                }),
              },
            })
            toast.error(t("messages.importCookiesPermissionDenied"))
            break
          case COOKIE_IMPORT_FAILURE_REASONS.ReadFailed:
            analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
              diagnostics: {
                failure: buildActionFailureDiagnostics({
                  errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
                  stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
                  reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
                }),
              },
            })
            toast.error(
              response.error
                ? t("messages.importCookiesFailed", { error: response.error })
                : t("messages.importCookiesFailedUnknown"),
            )
            break
          case COOKIE_IMPORT_FAILURE_REASONS.NoCookiesFound:
          default:
            analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
            toast.error(t("messages.importCookiesEmpty"))
            break
        }
      }
    } catch (error) {
      logger.warn("Failed to import cookies", { error, url: url.trim() })
      toast.error(
        t("messages.importCookiesFailed", { error: getErrorMessage(error) }),
      )
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        diagnostics: {
          failure: buildActionFailureDiagnostics({ error }),
        },
      })
    } finally {
      setIsImportingCookies(false)
    }
  }

  const handleManagedSiteConfigPromptClose = useCallback(() => {
    setManagedSiteConfigPrompt((prev) =>
      prev.isOpen ? { ...prev, isOpen: false } : prev,
    )
  }, [])

  const handleOpenManagedSiteSettings = useCallback(() => {
    handleManagedSiteConfigPromptClose()

    void openSettingsTab("managedSite", { preserveHistory: true }).catch(
      (error) => {
        toast.error(
          t("messages.operationFailed", {
            error: getErrorMessage(error),
          }),
        )
        logger.error("Failed to open managed-site settings", {
          managedSiteType,
          error: getErrorMessage(error),
        })
      },
    )
  }, [handleManagedSiteConfigPromptClose, managedSiteType, t])

  const ensureManagedSiteAutoConfigReady = useCallback(async () => {
    const service = getManagedSiteServiceForType(managedSiteType)
    const managedConfig = await service.getConfig()

    if (managedConfig) {
      return true
    }

    setManagedSiteConfigPrompt({
      isOpen: true,
      managedSiteLabel: getManagedSiteLabel(t, managedSiteType),
      missingMessage: getManagedSiteConfigMissingMessage(
        t,
        service.messagesKey,
      ),
    })

    return false
  }, [managedSiteType, t])

  /**
   * Import Sub2API dashboard session credentials (including refresh_token) into the form.
   *
   * Strategy is centralized in accountBrowserSession so tab lookup, messaging,
   * temp-window fallback, and normalization stay consistent across import flows.
   */
  const handleImportSub2apiSession = async () => {
    const analyticsAction = startAccountDialogAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.ImportSub2apiSession,
    )

    if (!url.trim()) {
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      })
      toast.error(t("messages.urlRequired"))
      return
    }

    const tempWindowRequestSource = getCurrentTempWindowRequestSource()
    setIsImportingSub2apiSession(true)
    try {
      const baseUrl = url.trim()

      const hasUsableSub2apiRefreshToken = (
        value: AccountBrowserSession | null,
      ): value is AccountBrowserSession =>
        typeof value?.sub2apiAuth?.refreshToken === "string" &&
        value.sub2apiAuth.refreshToken.trim().length > 0
      const currentTab = createCurrentTabBrowserSessionContext(
        currentTabCookieImportContextRef.current,
        baseUrl,
      )
      let importError: unknown

      const imported = await withProtectionBypassUserCommand(
        mode === DIALOG_MODES.ADD
          ? PROTECTION_BYPASS_USER_COMMANDS.AddAccount
          : PROTECTION_BYPASS_USER_COMMANDS.ReauthenticateAccount,
        tempWindowRequestSource,
        (protectionBypassExecution) =>
          resolveAccountBrowserSession({
            baseUrl,
            siteType: SITE_TYPES.SUB2API,
            ...(currentTab ? { currentTab } : {}),
            useExistingTabs: true,
            useTempWindow: true,
            tempWindowRequestSource,
            protectionBypassExecution,
            requestIdPrefix: "account-dialog-sub2api-import",
            isUsableSession: hasUsableSub2apiRefreshToken,
            onError: (error, context) => {
              if (
                context.source === ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
              ) {
                importError ??= error
              }
            },
          }),
      )

      const refreshToken = imported?.sub2apiAuth?.refreshToken?.trim() ?? ""
      if (!refreshToken) {
        if (importError) throw importError
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
        toast.error(t("messages.importSub2apiSessionMissing"))
        return
      }

      const tokenExpiresAtRaw = imported?.sub2apiAuth?.tokenExpiresAt
      const importedAccessToken = imported?.accessToken?.trim() ?? ""
      const importedUserId = normalizeAccountIdentity(imported?.userId) ?? ""
      const importedUsername =
        typeof imported?.user?.username === "string"
          ? imported.user.username.trim()
          : ""
      updateDraft((prev) => ({
        ...prev,
        sub2apiRefreshToken: refreshToken,
        sub2apiTokenExpiresAt:
          typeof tokenExpiresAtRaw === "number" &&
          Number.isFinite(tokenExpiresAtRaw)
            ? tokenExpiresAtRaw
            : null,
        ...(importedAccessToken ? { accessToken: importedAccessToken } : {}),
        ...(importedUserId ? { userId: importedUserId } : {}),
        ...(importedUsername ? { username: importedUsername } : {}),
      }))

      toast.success(t("messages.importSub2apiSessionSuccess"))
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      toast.error(
        t("messages.operationFailed", { error: getErrorMessage(error) }),
      )
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        diagnostics: {
          failure: buildActionFailureDiagnostics({ error }),
        },
      })
    } finally {
      setIsImportingSub2apiSession(false)
    }
  }

  const applyAutoDetectedData = async (
    resultData: NonNullable<
      Awaited<ReturnType<typeof autoDetectAccount>>["data"]
    >,
  ) => {
    detectedCookieStoreIdRef.current =
      resultData.fetchContext &&
      typeof resultData.fetchContext.cookieStoreId === "string" &&
      resultData.fetchContext.cookieStoreId.trim()
        ? resultData.fetchContext.cookieStoreId.trim()
        : null

    const detectedCheckIn = normalizeDetectedCheckIn(resultData.checkIn)
    const preserveExistingCheckIn =
      mode === DIALOG_MODES.EDIT ||
      formSource === ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
    const nextSiteType = isAccountSiteType(resultData.siteType)
      ? resultData.siteType
      : siteType
    const policy = getAccountDialogSitePolicy(nextSiteType)

    if (
      mode === DIALOG_MODES.EDIT &&
      detectedCheckIn.methodKnowledge.lastFullDiscoveryAt !== undefined &&
      !checkInDiscoveryBaseSelectionRef.current
    ) {
      checkInDiscoveryBaseSelectionRef.current = { ...checkIn.selection }
    }
    setDraft((prev) => {
      return buildDraftFromAutoDetectResult({
        draft: prev,
        resultData,
        nextSiteType,
        nextCheckIn: detectedCheckIn,
        preserveExistingCheckIn,
        automaticExecutionPreferenceChanged:
          automaticExecutionPreferenceChangedRef.current,
        mode,
        policy,
      })
    })

    if (
      shouldAutoImportCookieAuthForAccountDialogSite({
        policy,
        authType,
        cookieAuthSessionCookie,
        url,
      })
    ) {
      try {
        const cookieResponse = await sendRuntimeMessage({
          action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
          url: url.trim(),
          ...getCookieImportContextForUrl(url.trim()),
        })
        const header =
          typeof cookieResponse?.data === "string"
            ? cookieResponse.data.trim()
            : ""
        if (header) {
          setCookieAuthSessionCookie(header)
          setShowCookiePermissionWarning(false)
        } else if (
          cookieResponse?.errorCode ===
          COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied
        ) {
          setShowCookiePermissionWarning(true)
          toast.error(t("messages.importCookiesPermissionDenied"))
          logger.info(
            "Cookie auto-import skipped because cookie permissions were denied",
            { url: url.trim() },
          )
        }
      } catch (error) {
        logger.warn("Auto-import cookie failed", {
          error,
          url: url.trim(),
        })
      }
    }

    enterForm(ACCOUNT_DIALOG_FORM_SOURCES.DETECTED)
    if (mode === DIALOG_MODES.EDIT) {
      toast.success(t("messages.autoDetectSuccess"))
    }
  }

  const applyAutoDetectRecoveryData = (
    recoveryData: AccountAutoDetectRecoveryData | undefined,
    contextSiteType: AccountSiteType | undefined,
  ) => {
    const recovery = resolveAutoDetectRecovery({
      recoveryData,
      contextSiteType,
      currentSiteType: selectedSiteTypeRef.current,
      canAdoptSiteType: mode === DIALOG_MODES.ADD,
    })

    if (recovery.shouldAdoptSiteType && recovery.recoveredSiteType) {
      setSiteType(recovery.recoveredSiteType)
    }

    if (!recoveryData) return

    if (
      recoveryData.fetchContext?.cookieStoreId &&
      recoveryData.fetchContext.cookieStoreId.trim()
    ) {
      detectedCookieStoreIdRef.current =
        recoveryData.fetchContext.cookieStoreId.trim()
    }

    updateDraft((prev) => {
      return mergeAutoDetectRecoveryIntoDraft({
        draft: prev,
        recoveryData,
        nextSiteType: recovery.nextSiteType,
        hasExplicitAuthType: hasExplicitAuthTypeRef.current,
        sub2apiRefreshTokenPreferenceChanged:
          sub2apiRefreshTokenPreferenceChangedRef.current,
      })
    })
  }

  const runAutoDetectInvocation = async (runGeneration: number) => {
    const requestedUrl = url.trim()
    const isCurrentAutoDetectRun = () =>
      autoDetectRunGenerationRef.current === runGeneration &&
      selectedSiteUrlRef.current.trim() === requestedUrl
    const isRequestedOpenRouterBootstrap =
      isCanonicalOpenRouterUrl(requestedUrl)
    const openRouterAdmission = isRequestedOpenRouterBootstrap
      ? tryPrepareOpenRouterOnboardingStart()
      : null
    if (isRequestedOpenRouterBootstrap && !openRouterAdmission) return

    const analyticsAction = startAccountDialogAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect,
    )
    const checkInDiscoveryTrigger =
      mode === DIALOG_MODES.EDIT || isDetected
        ? "redetect"
        : "initial_detection"
    const createAutoDetectAnalyticsInsights = (
      result?:
        | Awaited<ReturnType<typeof autoDetectAccount>>
        | Awaited<ReturnType<typeof startPreparedOpenRouterOnboarding>>,
      fallbackUsed = false,
    ): ProductAnalyticsActionInsights => {
      const resultData = result && "data" in result ? result.data : undefined
      const autoDetectContext =
        result && "autoDetectContext" in result
          ? result.autoDetectContext ?? resultData?.autoDetectContext
          : resultData?.autoDetectContext
      const candidateSiteType =
        result && "siteType" in result
          ? result.siteType
          : resultData?.siteType ?? autoDetectContext?.siteType
      const analyticsSiteType = isProductAnalyticsSiteType(candidateSiteType)
        ? candidateSiteType
        : undefined
      const attemptOutcome =
        result && "attemptOutcome" in result ? result.attemptOutcome : undefined
      const checkInSiteType =
        resultData && isAccountSiteType(candidateSiteType)
          ? candidateSiteType
          : undefined
      const candidateMethodIds = checkInSiteType
        ? getAutoCheckinCandidateMethodIds(checkInSiteType)
        : []
      const checkInInspection =
        resultData && checkInSiteType
          ? inspectAccountCheckIn({
              config: resultData.checkIn,
              siteType: checkInSiteType,
            })
          : undefined

      return {
        requestedAuthMode: authType,
        fallbackUsed,
        ...(checkInInspection
          ? {
              checkInDiscoveryTrigger,
              checkInDiscoveryDecision: checkInInspection.decision.outcome,
              checkInCandidateCount: candidateMethodIds.length,
              checkInSelectionSource: resultData?.checkIn.selection.methodId
                ? resultData.checkIn.selection.mode
                : ("none" as const),
            }
          : {}),
        ...(attemptOutcome
          ? { accountAutoDetectAttemptOutcome: attemptOutcome }
          : {}),
        ...(autoDetectContext?.strategy
          ? { autoDetectStrategy: autoDetectContext.strategy }
          : {}),
        ...(autoDetectContext?.fetchContextKind
          ? { fetchContextKind: autoDetectContext.fetchContextKind }
          : {}),
        ...(typeof autoDetectContext?.incognitoContextUsed === "boolean"
          ? {
              incognitoContextUsed: autoDetectContext.incognitoContextUsed,
            }
          : {}),
        ...(typeof autoDetectContext?.currentTabMatched === "boolean"
          ? {
              currentTabMatched: autoDetectContext.currentTabMatched,
            }
          : {}),
        ...(analyticsSiteType ? { siteType: analyticsSiteType } : {}),
      }
    }

    if (!requestedUrl) {
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        insights: createAutoDetectAnalyticsInsights(),
      })
      return
    }

    if (openRouterAdmission?.clearCreatedCredential) {
      setAccessToken("")
    }

    try {
      const shouldContinue = await ensureDuplicateAccountAddConfirmation()
      if (!shouldContinue) {
        if (openRouterAdmission) {
          releaseOpenRouterOnboardingPreparation(
            openRouterAdmission.preparation,
          )
        }
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
          insights: createAutoDetectAnalyticsInsights(),
        })
        return
      }
    } catch (error) {
      if (openRouterAdmission) {
        releaseOpenRouterOnboardingPreparation(openRouterAdmission.preparation)
      }
      toast.error(
        t("messages.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        diagnostics: {
          failure: buildActionFailureDiagnostics({
            error,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
          }),
        },
        insights: {
          ...createAutoDetectAnalyticsInsights(),
        },
      })
      return
    }

    if (!isRequestedOpenRouterBootstrap) {
      const { clearCreatedCredential } =
        abandonOpenRouterOnboardingForOtherAutoDetect()
      if (clearCreatedCredential) setAccessToken("")
    }
    setIsDetecting(true)
    setDetectionError(null)
    detectedCookieStoreIdRef.current = null
    const shouldTrackPopupInterruption = isExtensionPopup()
    if (shouldTrackPopupInterruption) {
      try {
        await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
      } catch (error) {
        if (openRouterAdmission) {
          releaseOpenRouterOnboardingPreparation(
            openRouterAdmission.preparation,
          )
        }
        logger.error("Failed to prepare popup auto-detect flow", { error })
        const detectionError = analyzeAutoDetectError(error)
        setDetectionError(detectionError)
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          diagnostics: {
            failure: buildActionFailureDiagnostics({
              error,
              errorCategory: getAutoDetectAnalyticsErrorCategory(
                detectionError.type,
                error,
              ),
              stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
            }),
          },
          insights: createAutoDetectAnalyticsInsights(undefined, true),
        })
        setIsDetecting(false)
        if (openRouterAdmission) return
        throw error
      }
    }

    try {
      if (isRequestedOpenRouterBootstrap) {
        if (!openRouterAdmission) return
        let onboardingError: unknown
        let shouldShowDetectionError = false
        const outcome = await withProtectionBypassUserCommand(
          PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
          getCurrentTempWindowRequestSource(),
          (protectionBypassExecution) =>
            startPreparedOpenRouterOnboarding({
              preparation: openRouterAdmission.preparation,
              protectionBypassExecution,
              onStarted: () => setSiteType(SITE_TYPES.OPENROUTER),
              onCredentialCreated: (credential) => {
                setDraft((prev) => ({ ...prev, accessToken: credential }))
              },
              onManualFallback: (failure) => {
                onboardingError = failure.error
                shouldShowDetectionError = failure.showDetectionError
                if (failure.showDetectionError) {
                  setDetectionError(
                    failure.error
                      ? analyzeAutoDetectError(failure.error)
                      : {
                          type: AutoDetectErrorType.UNKNOWN,
                          message: failure.message ?? "",
                        },
                  )
                }
                enterForm(ACCOUNT_DIALOG_FORM_SOURCES.MANUAL)
              },
              onDetected: async (resultData) => {
                await applyAutoDetectedData(resultData)
              },
            }),
        )

        if (outcome.status === "cancelled_before_dispatch") {
          analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
            insights: createAutoDetectAnalyticsInsights(outcome, false),
          })
          return
        }
        if (outcome.status === "ignored") {
          analyticsAction.complete(
            outcome.success
              ? PRODUCT_ANALYTICS_RESULTS.Success
              : PRODUCT_ANALYTICS_RESULTS.Failure,
            { insights: createAutoDetectAnalyticsInsights(outcome, false) },
          )
          return
        }
        if (outcome.status === "completed") {
          analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
            insights: createAutoDetectAnalyticsInsights(outcome, false),
          })
          return
        }

        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          ...(shouldShowDetectionError && onboardingError
            ? {
                diagnostics: {
                  failure: buildActionFailureDiagnostics({
                    error: onboardingError,
                    errorCategory: getAutoDetectAnalyticsErrorCategory(
                      analyzeAutoDetectError(onboardingError).type,
                      onboardingError,
                    ),
                    stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
                  }),
                },
              }
            : {}),
          insights: createAutoDetectAnalyticsInsights(outcome, true),
        })
        return
      }

      const result = await withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
        getCurrentTempWindowRequestSource(),
        (protectionBypassExecution) =>
          autoDetectAccount(
            requestedUrl,
            authType,
            protectionBypassExecution,
            cookieAuthSessionCookie.trim() || undefined,
          ),
      )
      if (!isCurrentAutoDetectRun()) {
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
          insights: createAutoDetectAnalyticsInsights(result, false),
        })
        return
      }
      if (!result.success) {
        applyAutoDetectRecoveryData(
          result.recoveryData,
          result.autoDetectContext?.siteType,
        )
        enterForm(ACCOUNT_DIALOG_FORM_SOURCES.MANUAL)
        setDetectionError(result.detailedError || null)
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          diagnostics: {
            failure: {
              ...buildActionFailureDiagnostics({
                errorCategory: getAutoDetectAnalyticsErrorCategory(
                  result.detailedError?.type,
                ),
                stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
                reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
              }),
              ...(result.autoDetectFailureReason
                ? {
                    accountAutoDetectFailureReason:
                      result.autoDetectFailureReason,
                  }
                : {}),
            },
          },
          insights: {
            ...createAutoDetectAnalyticsInsights(result, true),
            ...(result.autoDetectFailureReason
              ? {
                  accountAutoDetectFailureReason:
                    result.autoDetectFailureReason,
                }
              : {}),
          },
        })
        return
      }

      const resultData = result.data
      if (resultData) {
        await applyAutoDetectedData(resultData)
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: createAutoDetectAnalyticsInsights(result, false),
        })
      }
    } catch (error) {
      if (!isCurrentAutoDetectRun()) {
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
          insights: createAutoDetectAnalyticsInsights(undefined, false),
        })
        return
      }
      logger.error("Auto-detect failed", { error, url: url.trim(), authType })
      const detectionError = analyzeAutoDetectError(error)
      setDetectionError(detectionError)
      enterForm(ACCOUNT_DIALOG_FORM_SOURCES.MANUAL)
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        diagnostics: {
          failure: buildActionFailureDiagnostics({
            error,
            errorCategory: getAutoDetectAnalyticsErrorCategory(
              detectionError.type,
              error,
            ),
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
          }),
        },
        insights: createAutoDetectAnalyticsInsights(undefined, true),
      })
    } finally {
      if (openRouterAdmission) {
        releaseOpenRouterOnboardingPreparation(openRouterAdmission.preparation)
      }
      if (shouldTrackPopupInterruption) {
        await completePopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
      }
      setIsDetecting(false)
    }
  }

  const handleAutoDetect = async () => {
    if (autoDetectInvocationLeaseRef.current) return

    const lease = Symbol("account-auto-detect-invocation")
    const runGeneration = autoDetectRunGenerationRef.current + 1
    autoDetectRunGenerationRef.current = runGeneration
    autoDetectInvocationLeaseRef.current = lease
    try {
      await runAutoDetectInvocation(runGeneration)
    } finally {
      if (autoDetectInvocationLeaseRef.current === lease) {
        autoDetectInvocationLeaseRef.current = null
      }
    }
  }

  const handleShowManualForm = async () => {
    try {
      const shouldContinue = await ensureDuplicateAccountAddConfirmation()
      if (!shouldContinue) {
        return
      }
      enterForm(ACCOUNT_DIALOG_FORM_SOURCES.MANUAL)
    } catch (error) {
      toast.error(
        t("messages.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
    }
  }

  const handleSaveAccount = async (options?: {
    skipSub2ApiKeyPrompt?: boolean
    skipAutoProvisionKeyOnAccountAdd?: boolean
  }) => {
    const tempWindowRequestSource = getCurrentTempWindowRequestSource()
    const analyticsActionRef: {
      current: ReturnType<typeof startAccountDialogAnalyticsAction> | null
    } = { current: null }
    const startSaveAnalyticsAction = () => {
      if (!analyticsActionRef.current) {
        analyticsActionRef.current = startAccountDialogAnalyticsAction(
          mode === DIALOG_MODES.ADD
            ? PRODUCT_ANALYTICS_ACTION_IDS.CreateAccount
            : PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccount,
        )
      }
      return analyticsActionRef.current
    }
    let isAnalyticsActionCompleted = false

    try {
      setIsSaving(true)
      const policy = getAccountDialogSitePolicy(siteType)
      const saveAnalyticsAction = startSaveAnalyticsAction()
      const duplicateConfirmed =
        await ensureExactCredentialDuplicateConfirmation()
      if (!duplicateConfirmed) {
        saveAnalyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        isAnalyticsActionCompleted = true
        return
      }
      const shouldDeferSuccessForSitePolicy =
        shouldDeferAccountSaveSuccessForAccountDialogSite({
          policy,
          isAddMode: mode === DIALOG_MODES.ADD,
          autoProvisionKeyOnAccountAdd,
          skipAutoProvisionKeyOnAccountAdd:
            options?.skipAutoProvisionKeyOnAccountAdd === true,
        })
      const sub2apiAuth = buildSub2ApiAuthFromAccountDialogDraft({
        draft,
        policy,
      })
      const normalizedUserId = userId.trim()
      const normalizedAccessToken = accessToken.trim()

      const saveAccount = () =>
        mode === DIALOG_MODES.ADD
          ? validateAndSaveAccount(
              url.trim(),
              siteName.trim(),
              username.trim(),
              normalizedAccessToken,
              normalizedUserId,
              exchangeRate,
              notes.trim(),
              tagIds,
              checkIn,
              siteType,
              authType,
              cookieAuthSessionCookie.trim(),
              manualBalanceUsd,
              excludeFromTotalBalance,
              excludeFromTodayIncome,
              sub2apiAuth,
              {
                deferDataRefresh: true,
                skipAutoProvisionKeyOnAccountAdd:
                  options?.skipAutoProvisionKeyOnAccountAdd === true ||
                  shouldDeferSuccessForSitePolicy,
              },
            )
          : validateAndUpdateAccount(
              account!.id,
              url.trim(),
              siteName.trim(),
              username.trim(),
              normalizedAccessToken,
              normalizedUserId,
              exchangeRate,
              notes.trim(),
              tagIds,
              checkIn,
              siteType,
              authType,
              cookieAuthSessionCookie.trim(),
              manualBalanceUsd,
              excludeFromTotalBalance,
              excludeFromTodayIncome,
              sub2apiAuth,
              {
                deferDataRefresh: true,
                selectionChanged: checkInSelectionChangedRef.current,
                ...(checkInDiscoveryBaseSelectionRef.current
                  ? {
                      discoveryBaseSelection:
                        checkInDiscoveryBaseSelectionRef.current,
                    }
                  : {}),
              },
            )
      const result = await withProtectionBypassUserCommand(
        mode === DIALOG_MODES.ADD
          ? PROTECTION_BYPASS_USER_COMMANDS.AddAccount
          : PROTECTION_BYPASS_USER_COMMANDS.ReauthenticateAccount,
        tempWindowRequestSource,
        async (protectionBypassExecution) => {
          const saveResult = await saveAccount()
          const savedAccountId =
            saveResult.success &&
            typeof saveResult.accountId === "string" &&
            saveResult.accountId.trim().length
              ? saveResult.accountId.trim()
              : null

          if (savedAccountId) {
            // The execution metadata is immutable and validated at each protected request,
            // so the refresh can continue after this save command returns.
            void refreshPostSaveAccount(
              savedAccountId,
              tempWindowRequestSource,
              protectionBypassExecution,
              onPostSaveAccountRefresh,
            )
          }

          return saveResult
        },
      )

      if (!result.success) {
        saveAnalyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          diagnostics: {
            failure: buildActionFailureDiagnostics({
              error: new Error(result.message || t("messages.saveFailed")),
            }),
          },
        })
        isAnalyticsActionCompleted = true
        throw new Error(result.message || t("messages.saveFailed"))
      }

      saveAnalyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      isAnalyticsActionCompleted = true
      confirmSavedOpenRouterCredential(normalizedAccessToken)

      const savedAccountId =
        typeof result.accountId === "string" && result.accountId.trim().length
          ? result.accountId.trim()
          : null

      const feedbackMessage =
        typeof result.message === "string" && result.message.trim().length > 0
          ? result.message
          : mode === DIALOG_MODES.ADD
            ? t("messages.addSuccess", {
                name: siteName,
              })
            : t("messages.updateSuccess", {
                name: siteName,
              })

      if (result.feedbackLevel === ACCOUNT_SAVE_FEEDBACK_LEVELS.Warning) {
        const warningAccountId =
          typeof result.accountId === "string" && result.accountId.trim()
            ? result.accountId.trim()
            : null

        showWarningToast(feedbackMessage, {
          action: warningAccountId
            ? {
                label: t("common:actions.refresh"),
                pendingLabel: t("common:status.refreshing"),
                onClick: async () => {
                  const accountName =
                    siteName.trim() ||
                    t("messages:toast.success.accountSaveSuccess")
                  const toastId = toast.loading(
                    t("messages:toast.loading.refreshingAccount", {
                      accountName,
                    }),
                  )

                  try {
                    const tempWindowRequestSource =
                      getCurrentTempWindowRequestSource()
                    const refreshResult = await withProtectionBypassUserCommand(
                      mode === DIALOG_MODES.ADD
                        ? PROTECTION_BYPASS_USER_COMMANDS.AddAccount
                        : PROTECTION_BYPASS_USER_COMMANDS.ReauthenticateAccount,
                      tempWindowRequestSource,
                      (protectionBypassExecution) =>
                        accountRefresh.refreshAccount(warningAccountId, true, {
                          tempWindowRequestSource,
                          protectionBypassExecution,
                        }),
                    )

                    if (!refreshResult?.refreshed) {
                      toast.error(
                        t("messages:toast.error.refreshAccount", {
                          accountName,
                        }),
                        { id: toastId },
                      )
                      return
                    }

                    toast.success(
                      t("messages:toast.success.refreshAccount", {
                        accountName,
                      }),
                      { id: toastId },
                    )
                  } catch (error) {
                    toast.error(
                      t("messages:toast.error.refreshAccount", {
                        accountName,
                      }),
                      { id: toastId },
                    )
                    logger.error("Post-save warning refresh failed", {
                      accountId: warningAccountId,
                      error: getErrorMessage(error),
                    })
                  }
                },
              }
            : undefined,
        })
      } else {
        toast.success(feedbackMessage)
      }

      if (shouldDeferSuccessForSitePolicy && savedAccountId) {
        await handleAihubmixNormalSaveForegroundKeyFlow({
          accountId: savedAccountId,
          accountName: siteName.trim() || SITE_TYPES.AIHUBMIX,
        })
      }

      const skipSub2ApiKeyPrompt = options?.skipSub2ApiKeyPrompt === true
      if (
        savedAccountId &&
        policy.openSub2ApiTokenDialogPostSave &&
        !skipSub2ApiKeyPrompt
      ) {
        try {
          const savedDisplaySiteData =
            (await accountReadModels.getDisplayDataById(savedAccountId)) ?? null

          if (
            shouldOpenSub2ApiTokenDialogForAccountDialogSite({
              policy,
              skipSub2ApiKeyPrompt,
              hasDisplayData: Boolean(savedDisplaySiteData),
            }) &&
            savedDisplaySiteData
          ) {
            await openDefaultTokenQuickCreateDialogForAccount(
              savedDisplaySiteData,
            )
          }
        } catch (error) {
          logger.error("Post-save Sub2API token dialog failed", {
            accountId: savedAccountId,
            error: getErrorMessage(error),
          })
        }
      }

      return result
    } catch (error: any) {
      if (analyticsActionRef.current && !isAnalyticsActionCompleted) {
        analyticsActionRef.current.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          diagnostics: {
            failure: buildActionFailureDiagnostics({
              error,
            }),
          },
        })
      }
      toast.error(
        t("messages.operationFailed", { error: getErrorMessage(error) }),
      )
      throw error
    } finally {
      setIsSaving(false)
    }
  }

  const handleAihubmixPostSaveKeyPromptCancel = useCallback(() => {
    aihubmixPostSaveKeyRunRef.current += 1
    setAihubmixPostSaveKeyPrompt({
      isOpen: false,
      accountId: null,
      accountName: "",
      isCreating: false,
    })
    completePendingAihubmixPostSaveSuccess()
    toast(t("messages:aihubmix.oneTimeKeyPromptCancelled"))
  }, [completePendingAihubmixPostSaveSuccess, t])

  const handleAihubmixPostSaveKeyPromptConfirm = useCallback(async () => {
    const accountId = aihubmixPostSaveKeyPrompt.accountId
    if (!accountId) return

    const runId = aihubmixPostSaveKeyRunRef.current + 1
    aihubmixPostSaveKeyRunRef.current = runId
    const isCurrentRun = () => aihubmixPostSaveKeyRunRef.current === runId

    setAihubmixPostSaveKeyPrompt((prev) => ({
      ...prev,
      isCreating: true,
    }))

    try {
      const savedAccount = await accountQueries.getAccountById(accountId)
      if (!isCurrentRun()) return
      if (!savedAccount) {
        toast.error(t("messages:toast.error.findAccountDetailsFailed"))
        setAihubmixPostSaveKeyPrompt({
          isOpen: false,
          accountId: null,
          accountName: "",
          isCreating: false,
        })
        completePendingAihubmixPostSaveSuccess()
        return
      }

      const displaySiteData =
        (await accountReadModels.getDisplayDataById(accountId)) ??
        accountPresentation.convertToDisplayData(savedAccount)
      if (!isCurrentRun()) return

      const ensureResult = await ensureAccountTokenForPostSaveWorkflow({
        account: savedAccount,
        displaySiteData,
      })
      if (!isCurrentRun()) return

      if (
        ensureResult.kind === ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created &&
        ensureResult.oneTimeSecret
      ) {
        setAihubmixPostSaveKeyPrompt({
          isOpen: false,
          accountId: null,
          accountName: "",
          isCreating: false,
        })
        setPostSaveOneTimeToken(ensureResult.token)
        setPostSaveOneTimeSecret(
          createAIHubMixCreatedRuntimeSecret({
            account: displaySiteData,
            token: ensureResult.token,
          }),
        )
        return
      }

      toast.error(t("messages:aihubmix.oneTimeKeyUnavailableAfterCreate"))
      setAihubmixPostSaveKeyPrompt({
        isOpen: false,
        accountId: null,
        accountName: "",
        isCreating: false,
      })
      completePendingAihubmixPostSaveSuccess()
    } catch (error) {
      if (!isCurrentRun()) return

      toast.error(t("messages:aihubmix.oneTimeKeyUnavailableAfterCreate"))
      setAihubmixPostSaveKeyPrompt({
        isOpen: false,
        accountId: null,
        accountName: "",
        isCreating: false,
      })
      completePendingAihubmixPostSaveSuccess()
      logger.error("AIHubMix post-save one-time key creation failed", {
        accountId,
        error: getErrorMessage(error),
      })
    }
  }, [
    aihubmixPostSaveKeyPrompt.accountId,
    completePendingAihubmixPostSaveSuccess,
    t,
  ])

  const openPostSaveManagedSiteDialog = useCallback(
    async (
      displaySiteData: DisplaySiteData,
      token: ApiToken,
      runId = postSaveAutoConfigRunRef.current,
      targetAccount = targetAccountRef.current,
    ) => {
      if (postSaveAutoConfigRunRef.current !== runId) {
        return
      }
      const isCurrentRun = () => postSaveAutoConfigRunRef.current === runId

      setAccountPostSaveWorkflowStep(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.OpeningManagedSiteDialog,
      )
      try {
        const openResult = await openChannelDialog(
          displaySiteData,
          token,
          () => {
            if (onSuccess && targetAccount && isCurrentRun()) {
              onSuccess(targetAccount)
            }
          },
          { shouldContinue: isCurrentRun },
        )
        if (!isCurrentRun()) {
          return
        }
        if (!openResult.opened) {
          if (openResult.deferred) {
            return
          }
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
        }
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
        )
      } catch (error) {
        if (!isCurrentRun()) {
          return
        }
        setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed)
        toast.error(
          t("messages.newApiConfigFailed", {
            error: getErrorMessage(error),
          }),
        )
        logger.error("Failed to open post-save managed-site dialog", {
          error: getErrorMessage(error),
          accountId: targetAccount,
          siteType: displaySiteData.siteType,
        })
      }
    },
    [onSuccess, openChannelDialog, t],
  )

  const handlePostSaveOneTimeTokenClose = useCallback(async () => {
    const runId = postSaveAutoConfigRunRef.current
    setPostSaveOneTimeToken(null)
    setPostSaveOneTimeSecret(null)
    const pending = pendingPostSaveChannelRef.current
    pendingPostSaveChannelRef.current = null
    if (!pending?.token) {
      setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
      completePendingAihubmixPostSaveSuccess()
      return
    }

    await openPostSaveManagedSiteDialog(
      pending.displaySiteData,
      pending.token,
      runId,
    )
  }, [completePendingAihubmixPostSaveSuccess, openPostSaveManagedSiteDialog])

  const handlePostSaveSub2ApiTokenDialogCloseForSession = useCallback(
    (sessionId: number | null) => {
      if (
        sessionId === null ||
        activePostSaveSub2ApiDialogSessionIdRef.current !== sessionId
      ) {
        return
      }

      invalidatePostSaveSub2ApiDialogSession()
      pendingPostSaveChannelRef.current = null
      setPostSaveSub2ApiAllowedGroups(null)
      setPostSaveSub2ApiAccount(null)
      setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
    },
    [invalidatePostSaveSub2ApiDialogSession],
  )

  const handlePostSaveSub2ApiTokenDialogClose = useCallback(() => {
    handlePostSaveSub2ApiTokenDialogCloseForSession(
      activePostSaveSub2ApiDialogSessionIdRef.current,
    )
  }, [handlePostSaveSub2ApiTokenDialogCloseForSession])

  const handlePostSaveSub2ApiTokenCreatedForSession = useCallback(
    async (sessionId: number | null, createdToken?: ApiToken) => {
      if (
        sessionId === null ||
        activePostSaveSub2ApiDialogSessionIdRef.current !== sessionId
      ) {
        return
      }

      invalidatePostSaveSub2ApiDialogSession()
      const runId = postSaveAutoConfigRunRef.current
      const pending = pendingPostSaveChannelRef.current
      setPostSaveSub2ApiAllowedGroups(null)
      setPostSaveSub2ApiAccount(null)

      if (!pending) {
        pendingPostSaveChannelRef.current = null
        setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
        return
      }

      pendingPostSaveChannelRef.current = null
      if (createdToken) {
        await openPostSaveManagedSiteDialog(
          pending.displaySiteData,
          createdToken,
          runId,
        )
        return
      }

      try {
        const { keyManagement, request } = createDisplayAccountApiContext(
          pending.displaySiteData,
        )
        const fetchedTokens = await requireDisplayAccountKeyManagement(
          pending.displaySiteData,
          keyManagement,
        ).fetchTokens(request)
        if (postSaveAutoConfigRunRef.current !== runId) {
          return
        }
        const latestToken = Array.isArray(fetchedTokens)
          ? selectSingleNewApiTokenByIdDiff({
              existingTokenIds: pending.existingTokenIds ?? [],
              tokens: fetchedTokens,
            })
          : null

        if (!latestToken) {
          if (postSaveAutoConfigRunRef.current !== runId) {
            return
          }
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          toast.error(t("messages:accountOperations.createTokenFailed"))
          return
        }

        if (postSaveAutoConfigRunRef.current !== runId) {
          return
        }
        await openPostSaveManagedSiteDialog(
          pending.displaySiteData,
          latestToken,
          runId,
        )
      } catch (error) {
        if (postSaveAutoConfigRunRef.current !== runId) {
          return
        }
        setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed)
        toast.error(
          t("messages.newApiConfigFailed", {
            error: getErrorMessage(error),
          }),
        )
        logger.error("Failed to resolve latest Sub2API token after create", {
          accountId: pending.displaySiteData.id,
          error: getErrorMessage(error),
        })
      }
    },
    [invalidatePostSaveSub2ApiDialogSession, openPostSaveManagedSiteDialog, t],
  )

  const handlePostSaveSub2ApiTokenCreated = useCallback(
    async (createdToken?: ApiToken) => {
      await handlePostSaveSub2ApiTokenCreatedForSession(
        activePostSaveSub2ApiDialogSessionIdRef.current,
        createdToken,
      )
    },
    [handlePostSaveSub2ApiTokenCreatedForSession],
  )

  const getPostSaveSub2ApiDialogHandlers = useCallback(
    (sessionId: number | null) => ({
      onClose: () => {
        handlePostSaveSub2ApiTokenDialogCloseForSession(sessionId)
      },
      onSuccess: async (createdToken?: ApiToken) => {
        await handlePostSaveSub2ApiTokenCreatedForSession(
          sessionId,
          createdToken,
        )
      },
    }),
    [
      handlePostSaveSub2ApiTokenCreatedForSession,
      handlePostSaveSub2ApiTokenDialogCloseForSession,
    ],
  )

  const handleAutoConfig = async () => {
    const runId = postSaveAutoConfigRunRef.current + 1
    postSaveAutoConfigRunRef.current = runId
    const isCurrentRun = () => postSaveAutoConfigRunRef.current === runId

    try {
      const isManagedSiteReady = await ensureManagedSiteAutoConfigReady()
      if (!isCurrentRun()) {
        return
      }
      if (!isManagedSiteReady) {
        return
      }
    } catch (error) {
      if (!isCurrentRun()) {
        return
      }
      toast.error(
        t("messages.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
      logger.error(
        "Failed to validate managed-site auto-config prerequisites",
        {
          managedSiteType,
          error: getErrorMessage(error),
        },
      )
      return
    }

    setIsAutoConfiguring(true)
    try {
      let targetAccount: DisplaySiteData | null | string | undefined =
        account || newAccountRef.current
      let savedSiteAccount: SiteAccount | null = null
      // 如果是新增（account 不存在），就先保存
      if (!targetAccount) {
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.SavingAccount,
        )
        const saveResult = await handleSaveAccount({
          skipSub2ApiKeyPrompt: true,
          skipAutoProvisionKeyOnAccountAdd: true,
        })
        targetAccount = saveResult?.accountId
        if (!isCurrentRun()) {
          return
        }
        if (!targetAccount) {
          toast.error(t("messages.saveAccountFailed"))
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
        }
        // 缓存到 ref，避免重复保存
        newAccountRef.current = targetAccount
      }

      // 缓存目标账户
      if (!isCurrentRun()) {
        return
      }
      targetAccountRef.current = targetAccount
      const intendedTargetAccount = targetAccount
      let displaySiteData

      if (typeof targetAccount === "string") {
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.LoadingSavedAccount,
        )
        // 获取账户详细信息
        const siteAccount = await accountQueries.getAccountById(targetAccount)
        if (!isCurrentRun()) {
          return
        }
        if (!siteAccount) {
          toast.error(t("messages:toast.error.findAccountDetailsFailed"))
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
        }
        savedSiteAccount = siteAccount
        displaySiteData =
          (await accountReadModels.getDisplayDataById(siteAccount.id)) ??
          accountPresentation.convertToDisplayData(siteAccount)
        if (!isCurrentRun()) {
          return
        }
      } else {
        displaySiteData = targetAccount
      }

      // The current runtime path opens the channel dialog with prefilled data
      // so users can review it before creation. The direct auto-import helpers
      // are kept only as deprecated compatibility shims.
      if (!savedSiteAccount) {
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.OpeningManagedSiteDialog,
        )
        const openResult = await openChannelDialog(
          displaySiteData,
          null,
          () => {
            if (onSuccess && intendedTargetAccount && isCurrentRun()) {
              onSuccess(intendedTargetAccount)
            }
          },
          { shouldContinue: isCurrentRun },
        )
        if (!isCurrentRun()) {
          return
        }
        if (!openResult.opened) {
          if (openResult.deferred) {
            return
          }
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
        }
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
        )
        return
      }

      setAccountPostSaveWorkflowStep(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.CheckingToken,
      )
      const ensureResult = await ensureAccountTokenForPostSaveWorkflow({
        account: savedSiteAccount,
        displaySiteData,
      })
      if (!isCurrentRun()) {
        return
      }

      switch (ensureResult.kind) {
        case ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready:
        case ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created:
          if (
            ensureResult.kind === ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created &&
            ensureResult.oneTimeSecret
          ) {
            pendingPostSaveChannelRef.current = {
              displaySiteData,
              token: ensureResult.token,
            }
            setPostSaveOneTimeToken(ensureResult.token)
            setPostSaveOneTimeSecret(
              createAIHubMixCreatedRuntimeSecret({
                account: displaySiteData,
                token: ensureResult.token,
              }),
            )
            setAccountPostSaveWorkflowStep(
              ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForOneTimeKeyAcknowledgement,
            )
            return
          }

          await openPostSaveManagedSiteDialog(
            displaySiteData,
            ensureResult.token,
            runId,
            intendedTargetAccount,
          )
          return
        case ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired:
          openPostSaveSub2ApiDialogSession()
          pendingPostSaveChannelRef.current = {
            displaySiteData,
            existingTokenIds: ensureResult.existingTokenIds,
          }
          setPostSaveSub2ApiAccount(displaySiteData)
          setPostSaveSub2ApiAllowedGroups(ensureResult.allowedGroups)
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForSub2ApiGroupSelection,
          )
          return
        case ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked:
          toast.error(ensureResult.message)
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
      }
    } catch (error) {
      if (!isCurrentRun()) {
        return
      }
      toast.error(
        t("messages.newApiConfigFailed", {
          error: getErrorMessage(error),
        }),
      )
      setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed)
      logger.error("Auto configuration failed", { error })
    } finally {
      if (isCurrentRun()) {
        setIsAutoConfiguring(false)
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSaveAccount()
  }

  const handleSub2apiUseRefreshTokenChange = (enabled: boolean) => {
    sub2apiRefreshTokenPreferenceChangedRef.current = true
    setSub2apiUseRefreshToken(enabled)

    // If the user explicitly disables refresh-token mode, clear any captured
    // credentials to avoid accidental persistence.
    if (!enabled) {
      setSub2apiRefreshToken("")
      setSub2apiTokenExpiresAt(null)
    }
  }

  const normalizedFormSiteType = isAccountSiteType(siteType)
    ? siteType
    : SITE_TYPES.UNKNOWN
  const isFormValid = isValidAccount({
    siteName,
    username,
    userId,
    siteType: normalizedFormSiteType,
    authType,
    accessToken,
    cookieAuthSessionCookie,
    exchangeRate,
  })
  const isSub2ApiRefreshTokenValid =
    !currentSitePolicy.allowSub2ApiRefreshTokenState ||
    !sub2apiUseRefreshToken ||
    !!sub2apiRefreshToken.trim()
  const isManualBalanceUsdInvalid =
    manualBalanceUsd.trim() !== "" &&
    parseManualQuotaFromUsd(manualBalanceUsd) === undefined
  const isAccountFormValid =
    isFormValid && isSub2ApiRefreshTokenValid && !isManualBalanceUsdInvalid

  return {
    state: {
      url,
      phase,
      formSource,
      draft,
      isDetecting,
      isDetectingSlow,
      isRedetectingCheckInMethods,
      checkInRedetectionFeedback,
      siteName,
      username,
      accessToken,
      userId,
      isDetected,
      isSaving,
      showAccessToken,
      detectionError,
      showManualForm,
      exchangeRate,
      manualBalanceUsd,
      isManualBalanceUsdInvalid,
      currentTabUrl,
      notes,
      tagIds,
      excludeFromTotalBalance,
      excludeFromTodayIncome,
      checkIn,
      siteType,
      authType,
      sub2apiUseRefreshToken,
      sub2apiRefreshToken,
      sub2apiTokenExpiresAt,
      isFormValid: isAccountFormValid,
      isAutoConfiguring,
      openRouterBootstrapRecovery: openRouterOnboardingRecovery,
      cookieAuthSessionCookie,
      isImportingCookies,
      showCookiePermissionWarning,
      cookieAuthPermissionsGranted: cookieAuthPermissionState.granted,
      isRequestingCookieAuthPermissions: cookieAuthPermissionState.pending,
      isImportingSub2apiSession,
      accountPostSaveWorkflowStep,
      postSaveOneTimeToken,
      postSaveOneTimeSecret,
      postSaveSub2ApiAllowedGroups,
      postSaveSub2ApiAccount,
      postSaveSub2ApiDialogSessionId,
      duplicateAccountWarning,
      managedSiteConfigPrompt,
      aihubmixPostSaveKeyPrompt,
    },
    setters: {
      setUrl: setDialogUrl,
      setPhase,
      setFormSource,
      setDraft,
      setDraftPartial,
      setSiteName,
      setUsername,
      setAccessToken,
      setUserId,
      setShowAccessToken,
      setShowManualForm: (visible: boolean) => {
        setPhase(
          visible
            ? ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
            : ACCOUNT_DIALOG_PHASES.SITE_INPUT,
        )
        setFormSource(ACCOUNT_DIALOG_FORM_SOURCES.MANUAL)
      },
      setExchangeRate,
      setManualBalanceUsd,
      setNotes,
      setTagIds,
      setExcludeFromTotalBalance,
      setExcludeFromTodayIncome,
      setCheckIn,
      setCheckInSelection: setCheckInSelectionDraft,
      setSiteType,
      setAuthType,
      setCookieAuthSessionCookie,
      setSub2apiUseRefreshToken,
      setSub2apiRefreshToken,
      setSub2apiTokenExpiresAt,
    },
    handlers: {
      handleUseCurrentTabUrl,
      handleAutoDetect,
      handleRedetectCheckInMethods,
      handleShowManualForm,
      handleSaveAccount,
      handleClearUrl,
      handleUrlChange,
      handleSubmit,
      handleAutoConfig,
      handleClose,
      handleImportCookieAuthSessionCookie,
      handleOpenCookiePermissionSettings,
      handleRequestCookieAuthPermissions,
      handleImportSub2apiSession,
      handleSub2apiUseRefreshTokenChange,
      handleDuplicateAccountWarningCancel,
      handleDuplicateAccountWarningContinue,
      handleDuplicateAccountWarningDisableAndContinue,
      handleManagedSiteConfigPromptClose,
      handleOpenManagedSiteSettings,
      handleAihubmixPostSaveKeyPromptCancel,
      handleAihubmixPostSaveKeyPromptConfirm,
      shouldDeferAccountSaveSuccess,
      handlePostSaveOneTimeTokenClose,
      handlePostSaveSub2ApiTokenDialogClose,
      handlePostSaveSub2ApiTokenCreated,
      getPostSaveSub2ApiDialogHandlers,
    },
  }
}

/**
 * Normalizes user-supplied site URLs for duplicate-account checks.
 */
function normalizeSiteUrlForDuplicateCheck(params: {
  value: string
  siteType?: AccountSiteType | string
}): string {
  return (
    normalizeAccountSiteUrlForDuplicateCheck({
      url: params.value,
      siteType: params.siteType,
    }) ?? params.value.trim().toLowerCase()
  )
}

/**
 * Maps detailed auto-detect failure kinds to the coarse analytics taxonomy.
 */
function getAutoDetectAnalyticsErrorCategory(
  errorType?: AutoDetectErrorType,
  structuredError?: unknown,
): ProductAnalyticsErrorCategory {
  switch (errorType) {
    case AutoDetectErrorType.UNAUTHORIZED:
    case AutoDetectErrorType.FORBIDDEN:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
    case AutoDetectErrorType.TIMEOUT:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout
    case AutoDetectErrorType.NETWORK_ERROR:
    case AutoDetectErrorType.SERVER_ERROR:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
    case AutoDetectErrorType.INVALID_RESPONSE:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
    case AutoDetectErrorType.NOT_FOUND:
    case AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
    case AutoDetectErrorType.UNKNOWN:
    default:
      if (structuredError !== undefined) {
        return resolveProductAnalyticsErrorCategoryFromError(structuredError)
      }
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
  }
}

/**
 * Checks whether a detected site type is accepted by the analytics whitelist.
 */
function isProductAnalyticsSiteType(
  value: unknown,
): value is ProductAnalyticsSiteType {
  return (
    typeof value === "string" &&
    (PRODUCT_ANALYTICS_SITE_TYPES as readonly string[]).includes(value)
  )
}

/**
 * Resolves the initial flow state for add and edit dialog modes.
 */
function getInitialFlowState(mode: DialogMode): {
  phase: AccountDialogPhase
  formSource: AccountDialogFormSource
} {
  return mode === DIALOG_MODES.EDIT
    ? {
        phase: ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM,
        formSource: ACCOUNT_DIALOG_FORM_SOURCES.EXISTING_ACCOUNT,
      }
    : {
        phase: ACCOUNT_DIALOG_PHASES.SITE_INPUT,
        formSource: ACCOUNT_DIALOG_FORM_SOURCES.MANUAL,
      }
}

/**
 * Maps normalized add-account prefill sources to account-dialog form provenance.
 */
function resolvePrefillFormSource(
  prefill: AddAccountPrefill | null | undefined,
  fallback: AccountDialogFormSource,
): AccountDialogFormSource {
  if (!prefill) return fallback
  if (prefill.source === BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE) {
    return ACCOUNT_DIALOG_FORM_SOURCES.BOOKMARK_IMPORT
  }

  return ACCOUNT_DIALOG_FORM_SOURCES.SPONSOR
}

/**
 * Normalizes legacy persisted site types before hydrating edit-mode draft state.
 */
function resolveStoredSiteType(
  value: unknown,
  hasSub2ApiAuth: boolean,
): AccountSiteType {
  if (isAccountSiteType(value)) {
    return value
  }

  return hasSub2ApiAuth ? SITE_TYPES.SUB2API : SITE_TYPES.UNKNOWN
}
