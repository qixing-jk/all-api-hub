import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import { CHECK_IN_SELECTION_MODES } from "~/constants/checkIn"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
  type ManagedSiteType,
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
  getAccountDialogSitePolicy,
  normalizeAccountDialogDraftForSitePolicy,
  shouldAutoImportCookieAuthForAccountDialogSite,
  shouldDeferAccountSaveSuccessForAccountDialogSite,
} from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
import { normalizeAddAccountPrefill } from "~/features/AccountManagement/sponsors/pendingAddAccountIntent"
import { BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE } from "~/features/AccountManagement/sponsors/types"
import {
  isAccountAuthType,
  resolveDefaultAccountAuthType,
} from "~/features/AccountManagement/utils/accountAuthType"
import toast from "~/lib/notify"
import { type autoDetectAccount } from "~/services/accounts/accountAutoDetection"
import { validateAndSaveAccount } from "~/services/accounts/accountCreation"
import { usesAccountCredentialIdentity } from "~/services/accounts/accountDedupe"
import {
  isValidAccount,
  parseManualQuotaFromUsd,
} from "~/services/accounts/accountFormValidation"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { ACCOUNT_SAVE_FEEDBACK_LEVELS } from "~/services/accounts/accountPersistence/constants"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { validateAndUpdateAccount } from "~/services/accounts/accountUpdate"
import type { AccountAutoDetectRecoveryData } from "~/services/accounts/autoDetect/recovery"
import { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"
import type { ManagedSiteMessagesKey } from "~/services/accountSiteDefinitions/contracts"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import {
  createCompatibilityCheckInConfig,
  resolveNewAccountAutomaticExecutionEnabled,
} from "~/services/checkin/autoCheckin/compatibilityConfig"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/inspection"
import { getAutoCheckinCandidateMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import { invalidateCheckInDiscovery } from "~/services/checkin/autoCheckin/state"
import {
  getManagedSiteConfigMissingMessage,
  getManagedSiteLabel,
  getManagedSiteMessagesKeyFromSiteType,
  getManagedSiteSettingsTarget,
} from "~/services/managedSites/utils/managedSite"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnosticsError"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, type CheckInConfig, type DisplaySiteData } from "~/types"
import { ACCOUNT_KEY_AUTO_PROVISION_MODES } from "~/types/accountKeyAutoProvisioning"
import type { CheckInMethodSelection } from "~/types/checkIn"
import type { AccountSaveResponse } from "~/types/serviceResponse"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import {
  isMessageReceiverUnavailableError,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { openSettingsTab, openSettingsTabInNewTab } from "~/utils/navigation"

import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  ACCOUNT_DIALOG_PHASES,
  createEmptyAccountDialogDraft,
  type AccountDialogDraft,
  type AccountDialogFormSource,
  type AccountDialogPhase,
  type AccountDialogRecoveryState,
  type AddAccountPrefill,
} from "../models"
import { useAccountAutoDetection } from "./useAccountAutoDetection"
import { useAccountCookieSession } from "./useAccountCookieSession"
import { useAccountCurrentTab } from "./useAccountCurrentTab"
import { useAccountDuplicateConfirmation } from "./useAccountDuplicateConfirmation"
import { useAccountPostSaveWorkflow } from "./useAccountPostSaveWorkflow"
import { useOpenRouterAccountOnboarding } from "./useOpenRouterAccountOnboarding"
import { useSub2ApiAccountSession } from "./useSub2ApiAccountSession"

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
      discoverCheckInAfterSave: true,
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

interface UseAccountDialogProps {
  mode: DialogMode
  account?: DisplaySiteData | null
  prefill?: AddAccountPrefill | null
  recoveryState?: AccountDialogRecoveryState | null
  isOpen: boolean
  onClose: () => void
  onPostSaveAccountRefresh?: (accountIds: string[]) => Promise<void>
  onSuccess?: (data: any) => void
}

interface ManagedSiteConfigPromptState {
  isOpen: boolean
  siteType: ManagedSiteType
  messagesKey: ManagedSiteMessagesKey
}

/**
 * Hook encapsulating the full lifecycle of the account dialog including detection, validation, and persistence logic.
 * @param props Hook configuration supporting add/edit modes and callbacks.
 * @param props.mode Current dialog mode (add or edit).
 * @param props.account Account record to edit when in edit mode.
 * @param props.prefill Optional add-mode prefill.
 * @param props.recoveryState Form carried from a popup for manual token recovery.
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
  recoveryState,
  isOpen,
  onClose,
  onPostSaveAccountRefresh,
  onSuccess,
}: UseAccountDialogProps) {
  const { t, i18n } = useTranslation(["accountDialog", "settings", "messages"])
  const {
    managedSiteType,
    autoFillCurrentSiteUrlOnAccountAdd,
    autoProvisionKeyOnAccountAdd,
    autoProvisionKeyOnAccountAddMode,
  } = useUserPreferencesContext()

  const [url, setUrl] = useState("")
  const autoDetection = useAccountAutoDetection({
    isOpen,
    mode,
    accountId: account?.id,
  })
  const { isDetecting, isDetectingSlow, detectionError } = autoDetection.state
  const {
    invalidate: invalidateAutoDetection,
    reset: resetAutoDetection,
    clearVerificationError,
    requireAccessTokenVerification,
  } = autoDetection
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
  const {
    recovery: openRouterOnboardingRecovery,
    resetSession: resetOpenRouterOnboardingSession,
    notifyUrlChange: notifyOpenRouterUrlChange,
    notifySiteChange: notifyOpenRouterSiteChange,
    notifyCredentialChange: notifyOpenRouterCredentialChange,
    tryPrepareForStart: tryPrepareOpenRouterOnboardingStart,
    abandonForOtherAutoDetect: abandonOpenRouterOnboardingForOtherAutoDetect,
    beforeClose: beforeOpenRouterOnboardingClose,
    confirmSavedCredential: confirmSavedOpenRouterCredential,
  } = useOpenRouterAccountOnboarding()

  const [managedSiteConfigPromptState, setManagedSiteConfigPrompt] =
    useState<ManagedSiteConfigPromptState | null>(null)
  const managedSiteConfigPrompt = {
    isOpen: managedSiteConfigPromptState?.isOpen ?? false,
    managedSiteType: managedSiteConfigPromptState?.siteType ?? null,
    managedSiteLabel: managedSiteConfigPromptState
      ? getManagedSiteLabel(t, managedSiteConfigPromptState.siteType)
      : "",
    missingMessage: managedSiteConfigPromptState
      ? getManagedSiteConfigMissingMessage(
          t,
          managedSiteConfigPromptState.messagesKey,
        )
      : "",
  }
  const selectedSiteUrlRef = useRef("")
  const loadedKimiAuthRef = useRef<
    | { accessToken: string; refreshToken?: string; organizationId?: string }
    | undefined
  >(undefined)
  const accountCredentialScopeRef = useRef<{
    url: string
    siteType: AccountSiteType
  } | null>(null)
  const hasAccountAccessTokenRef = useRef(false)
  const selectedSiteTypeRef = useRef<AccountSiteType>(SITE_TYPES.UNKNOWN)
  const isCloseTransitionStartedRef = useRef(false)
  const hasExplicitAuthTypeRef = useRef(false)
  const automaticExecutionPreferenceChangedRef = useRef(false)

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
  const duplicateConfirmation = useAccountDuplicateConfirmation({
    isOpen,
    mode,
    account,
    url,
    draft,
  })
  const {
    warning: duplicateAccountWarning,
    confirm: confirmDuplicateAccount,
    invalidate: invalidateDuplicateConfirmation,
    continueConfirmation: handleDuplicateAccountWarningContinue,
    disableAndContinue: handleDuplicateAccountWarningDisableAndContinue,
  } = duplicateConfirmation
  const handleDuplicateAccountWarningCancel = useCallback(() => {
    invalidateDuplicateConfirmation(true)
  }, [invalidateDuplicateConfirmation])
  selectedSiteUrlRef.current = url
  selectedSiteTypeRef.current = siteType
  const isDetected =
    phase === ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM &&
    formSource === ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
  const showManualForm =
    phase === ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM &&
    formSource !== ACCOUNT_DIALOG_FORM_SOURCES.DETECTED

  useLayoutEffect(() => {
    hasAccountAccessTokenRef.current = Boolean(accessToken.trim())
  }, [accessToken])

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
      setDraft((prev) => {
        const next = updater(prev)
        const credentialsChanged =
          prev.accessToken.trim() !== next.accessToken.trim() ||
          prev.userId.trim() !== next.userId.trim() ||
          prev.authType !== next.authType ||
          prev.cookieAuthSessionCookie.trim() !==
            next.cookieAuthSessionCookie.trim() ||
          prev.siteType !== next.siteType
        // A completion that supplies fresh method facts owns that evidence;
        // editing the credentials alone invalidates the previous round.
        return credentialsChanged &&
          next.checkIn.methodKnowledge === prev.checkIn.methodKnowledge
          ? { ...next, checkIn: invalidateCheckInDiscovery(next.checkIn) }
          : next
      })
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
  const updateAccessToken = useCallback(
    (
      value: string,
      scope = {
        url: selectedSiteUrlRef.current,
        siteType: selectedSiteTypeRef.current,
      },
    ) => {
      invalidateDuplicateConfirmation(true)
      const hasAccessToken = Boolean(value.trim())
      hasAccountAccessTokenRef.current = hasAccessToken
      accountCredentialScopeRef.current = hasAccessToken ? scope : null
      updateDraft((prev) => ({ ...prev, accessToken: value }))
    },
    [invalidateDuplicateConfirmation, updateDraft],
  )
  const currentTab = useAccountCurrentTab({
    mode,
    accountId: account?.id,
    url,
    setSiteName,
  })
  const { currentTabUrl, checkCurrentTab, getCookieImportContextForUrl } =
    currentTab
  const {
    reset: resetCurrentTab,
    notifyUrlChanged: notifyCurrentTabUrlChanged,
    rememberCookieStore,
    getBrowserSessionContext,
    consumeAutoFill,
    claimCurrentTab,
  } = currentTab
  const applyImportedCookie = useCallback(
    (value: string) =>
      updateDraft((prev) => ({ ...prev, cookieAuthSessionCookie: value })),
    [updateDraft],
  )
  const cookieSession = useAccountCookieSession({
    isOpen,
    mode,
    accountId: account?.id,
    url,
    authType,
    getContext: getCookieImportContextForUrl,
    applyCookie: applyImportedCookie,
  })
  const {
    isImportingCookies,
    showCookiePermissionWarning,
    cookieAuthPermissionState,
  } = cookieSession.state
  const {
    invalidate: invalidateCookieSession,
    reset: resetCookieSession,
    importManually: handleImportCookieAuthSessionCookie,
    importAutomatically: importCookieAutomatically,
    requestPermissions: handleRequestCookieAuthPermissions,
  } = cookieSession
  const sub2ApiSession = useSub2ApiAccountSession({
    isOpen,
    mode,
    accountId: account?.id,
    url,
    draft,
    updateDraft,
    updateAccessToken,
    getCurrentTab: getBrowserSessionContext,
  })
  const {
    isImportingSub2apiSession,
    handleImportSub2apiSession,
    handleSub2apiUseRefreshTokenChange,
    setSub2apiUseRefreshToken,
    setSub2apiRefreshToken,
    setSub2apiTokenExpiresAt,
    invalidate: invalidateSub2ApiSession,
    reset: resetSub2ApiSession,
  } = sub2ApiSession
  const setDialogUrl = useCallback(
    (value: string) => {
      invalidateDuplicateConfirmation()
      invalidateCookieSession()
      invalidateSub2ApiSession()
      notifyCurrentTabUrlChanged(value)
      invalidateAutoDetection()
      if (value !== selectedSiteUrlRef.current) {
        clearVerificationError()
      }
      resetCheckInRedetection()
      notifyOpenRouterUrlChange(value)
      if (selectedSiteUrlRef.current.trim() !== value.trim()) {
        setDraft((prev) => ({
          ...prev,
          checkIn: invalidateCheckInDiscovery(prev.checkIn),
        }))
      }
      selectedSiteUrlRef.current = value
      setUrl(value)
    },
    [
      invalidateDuplicateConfirmation,
      invalidateCookieSession,
      clearVerificationError,
      invalidateAutoDetection,
      notifyCurrentTabUrlChanged,
      invalidateSub2ApiSession,
      notifyOpenRouterUrlChange,
      resetCheckInRedetection,
    ],
  )
  const setAccessToken = useCallback(
    (value: string) => {
      invalidateSub2ApiSession()
      updateAccessToken(value)
      notifyOpenRouterCredentialChange(value)
    },
    [
      invalidateSub2ApiSession,
      notifyOpenRouterCredentialChange,
      updateAccessToken,
    ],
  )
  const setUserId = useCallback(
    (value: string) => {
      invalidateDuplicateConfirmation(value.trim() === userId.trim())
      updateDraft((prev) => ({ ...prev, userId: value }))
    },
    [invalidateDuplicateConfirmation, userId, updateDraft],
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
      const candidateMethodIds = getAutoCheckinCandidateMethodIds(siteType, url)
      const inspection = inspectAccountCheckIn({
        config: value,
        siteUrl: url,
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
    [setCheckIn, siteType, url],
  )
  const setSiteType = useCallback(
    (value: string) => {
      const nextSiteType = isAccountSiteType(value) ? value : SITE_TYPES.UNKNOWN
      invalidateDuplicateConfirmation(
        nextSiteType === selectedSiteTypeRef.current,
      )
      invalidateCookieSession()
      invalidateSub2ApiSession()
      resetCheckInRedetection()
      if (nextSiteType !== selectedSiteTypeRef.current) {
        clearVerificationError()
      }
      const nextPolicy = getAccountDialogSitePolicy(nextSiteType)
      selectedSiteTypeRef.current = nextSiteType
      const { clearCreatedCredential } =
        notifyOpenRouterSiteChange(nextSiteType)
      if (clearCreatedCredential) updateAccessToken("")
      updateDraft((prev) => {
        const previousPolicy = getAccountDialogSitePolicy(prev.siteType)
        const shouldRebuildCompatibilityConfig =
          mode === DIALOG_MODES.ADD && prev.siteType !== nextSiteType
        const checkIn = shouldRebuildCompatibilityConfig
          ? createCompatibilityCheckInConfig({
              siteType: nextSiteType,
              supported: false,
              automaticExecutionEnabled:
                resolveNewAccountAutomaticExecutionEnabled({
                  siteType: nextSiteType,
                  siteUrl: url,
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
        const shouldClearCredentialIdentity =
          prev.siteType !== nextSiteType &&
          usesAccountCredentialIdentity(prev.siteType)
        return normalizeAccountDialogDraftForSitePolicy({
          draft: {
            ...prev,
            siteType: nextSiteType,
            checkIn,
            ...(shouldClearCredentialIdentity ? { userId: "" } : {}),
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
      invalidateDuplicateConfirmation,
      invalidateCookieSession,
      clearVerificationError,
      mode,
      invalidateSub2ApiSession,
      setDialogUrl,
      notifyOpenRouterSiteChange,
      resetCheckInRedetection,
      updateAccessToken,
      updateDraft,
      url,
    ],
  )
  const setAuthType = useCallback(
    (value: AuthTypeEnum) => {
      if (!isAccountAuthType(value)) return
      invalidateDuplicateConfirmation(true)
      invalidateCookieSession()
      invalidateSub2ApiSession()

      if (value !== AuthTypeEnum.AccessToken) {
        clearVerificationError()
      }
      hasExplicitAuthTypeRef.current = true
      updateDraft((prev) => ({ ...prev, authType: value }))
    },
    [
      invalidateDuplicateConfirmation,
      invalidateCookieSession,
      clearVerificationError,
      invalidateSub2ApiSession,
      updateDraft,
    ],
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
      invalidateDuplicateConfirmation(true)
      invalidateCookieSession()
      updateDraft((prev) => ({ ...prev, cookieAuthSessionCookie: value }))
    },
    [invalidateDuplicateConfirmation, invalidateCookieSession, updateDraft],
  )
  const setDraftPartial = useCallback(
    (value: Partial<AccountDialogDraft>) => {
      const changesIdentity =
        (value.userId !== undefined &&
          normalizeAccountIdentity(value.userId) !==
            normalizeAccountIdentity(userId)) ||
        (value.siteType !== undefined && value.siteType !== siteType)
      invalidateDuplicateConfirmation(!changesIdentity)
      updateDraft((prev) => ({ ...prev, ...value }))
    },
    [invalidateDuplicateConfirmation, siteType, userId, updateDraft],
  )
  const enterForm = useCallback((source: AccountDialogFormSource) => {
    setPhase(ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM)
    setFormSource(source)
  }, [])

  useEffect(() => {
    const policy = getAccountDialogSitePolicy(siteType)

    updateDraft((prev) =>
      normalizeAccountDialogDraftForSitePolicy({
        draft: prev,
        policy,
      }),
    )
  }, [siteType, updateDraft])

  const postSaveWorkflow = useAccountPostSaveWorkflow({
    onSuccess,
    managedSiteType,
  })
  const {
    isAutoConfiguring,
    accountPostSaveWorkflowStep,
    postSaveOneTimeSecret,
    postSaveKeyProvisioning,
    postSaveKeyInputAccount,
    postSaveKeyInputSessionId,
    aihubmixPostSaveKeyPrompt,
  } = postSaveWorkflow.state
  const {
    handleAihubmixPostSaveKeyPromptCancel,
    handleAihubmixPostSaveKeyPromptConfirm,
    handlePostSaveOneTimeSecretClose,
    handlePostSaveKeyProvisioningClose,
    handlePostSaveKeyInputTokenDialogClose,
    handlePostSaveKeyInputTokenCreated,
    getPostSaveKeyInputDialogHandlers,
  } = postSaveWorkflow.handlers
  const clearPostSaveWorkflowState = postSaveWorkflow.clear
  const completePendingAccountKeyProvisioningSuccess =
    postSaveWorkflow.completePendingSuccess

  const resetForm = useCallback(
    (nextPrefill?: AddAccountPrefill | null) => {
      invalidateAutoDetection()
      isCloseTransitionStartedRef.current = false
      resetCurrentTab(Boolean(nextPrefill))
      invalidateDuplicateConfirmation()
      const nextSiteType = nextPrefill?.siteType ?? SITE_TYPES.UNKNOWN
      selectedSiteTypeRef.current = nextSiteType
      const policy = getAccountDialogSitePolicy(nextSiteType)
      hasExplicitAuthTypeRef.current = Boolean(nextPrefill?.authType)
      const nextUrl = nextPrefill?.siteUrl ?? ""
      selectedSiteUrlRef.current = nextUrl
      accountCredentialScopeRef.current = null
      loadedKimiAuthRef.current = undefined
      resetOpenRouterOnboardingSession({
        url: nextUrl,
        siteType: nextSiteType,
        credential: "",
      })
      setUrl(nextUrl)
      automaticExecutionPreferenceChangedRef.current = false
      resetSub2ApiSession()
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
      resetAutoDetection()
      resetCheckInRedetection()
      resetCookieSession()
      clearPostSaveWorkflowState()
    },
    [
      invalidateDuplicateConfirmation,
      resetCookieSession,
      invalidateAutoDetection,
      resetAutoDetection,
      resetCurrentTab,

      clearPostSaveWorkflowState,
      resetSub2ApiSession,
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
          loadedKimiAuthRef.current = siteAccount.kimiOpenPlatformAuth
            ? {
                accessToken: siteAccount.account_info.access_token,
                refreshToken: siteAccount.kimiOpenPlatformAuth.refreshToken,
                organizationId: siteAccount.kimiOpenPlatformAuth.organizationId,
              }
            : undefined
          setUrl(siteAccount.site_url)
          const refreshToken = siteAccount.sub2apiAuth?.refreshToken ?? ""
          const normalizedSiteType = resolveStoredSiteType(
            siteAccount.site_type,
            Boolean(siteAccount.sub2apiAuth),
          )
          accountCredentialScopeRef.current = {
            url: siteAccount.site_url,
            siteType: normalizedSiteType,
          }
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
                kimiOpenPlatformAuth: siteAccount.kimiOpenPlatformAuth ?? null,
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
        toast.error(i18n.t("accountDialog:messages.loadFailed"))
      }
    },
    [enterForm, i18n],
  )

  useEffect(() => {
    if (isOpen) {
      const nextPrefill =
        mode === DIALOG_MODES.ADD ? normalizeAddAccountPrefill(prefill) : null
      resetForm(nextPrefill)
      if (recoveryState) {
        const recoveredDraft = recoveryState.draft
        selectedSiteUrlRef.current = recoveryState.url
        selectedSiteTypeRef.current = recoveredDraft.siteType
        notifyCurrentTabUrlChanged(recoveryState.url)
        hasExplicitAuthTypeRef.current = true
        automaticExecutionPreferenceChangedRef.current = true
        checkInSelectionChangedRef.current =
          recoveryState.checkInSelectionChanged
        checkInDiscoveryBaseSelectionRef.current =
          recoveryState.checkInDiscoveryBaseSelection
        setUrl(recoveryState.url)
        accountCredentialScopeRef.current = {
          url: recoveryState.url,
          siteType: recoveredDraft.siteType,
        }
        setDraft(
          normalizeAccountDialogDraftForSitePolicy({
            draft: recoveredDraft,
            policy: getAccountDialogSitePolicy(recoveredDraft.siteType),
          }),
        )
        setPhase(ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM)
        setFormSource(
          mode === DIALOG_MODES.EDIT
            ? ACCOUNT_DIALOG_FORM_SOURCES.EXISTING_ACCOUNT
            : ACCOUNT_DIALOG_FORM_SOURCES.MANUAL,
        )
        requireAccessTokenVerification()
      } else if (mode === DIALOG_MODES.EDIT && account) {
        loadAccountData(account.id)
      } else {
        // Get current tab URL for add mode
        checkCurrentTab()
      }
    }
  }, [
    notifyCurrentTabUrlChanged,
    requireAccessTokenVerification,

    isOpen,
    mode,
    account,
    prefill,
    recoveryState,
    resetForm,
    loadAccountData,
    checkCurrentTab,
    i18n,
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
    if (!consumeAutoFill()) return
    setDialogUrl(currentTabUrl)
    applyAuthDefaultForUrl(currentTabUrl)
  }, [
    consumeAutoFill,

    applyAuthDefaultForUrl,
    autoFillCurrentSiteUrlOnAccountAdd,
    currentTabUrl,
    isOpen,
    mode,
    setDialogUrl,
    url,
  ])

  const handleUrlChange = (
    newUrl: string,
    options: { applyAuthDefault?: boolean } = {},
  ) => {
    const shouldApplyAuthDefault = options.applyAuthDefault !== false
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
      const candidate = claimCurrentTab()
      if (candidate.siteName.trim()) setSiteName(candidate.siteName)
    }
  }

  const handleClearUrl = () => {
    setDialogUrl("")
    if (mode === DIALOG_MODES.ADD) {
      setSiteName("")
    }
  }

  const handleClose = useCallback(async () => {
    if (isCloseTransitionStartedRef.current) return
    invalidateDuplicateConfirmation()
    invalidateCookieSession()
    invalidateSub2ApiSession()
    isCloseTransitionStartedRef.current = true
    invalidateAutoDetection()
    try {
      await beforeOpenRouterOnboardingClose()
    } catch {
      logger.warn("OpenRouter onboarding close handling failed", {
        siteType: SITE_TYPES.OPENROUTER,
        status: "reconciliation_failed",
        category: "onboarding_close",
      })
    }
    completePendingAccountKeyProvisioningSuccess()
    clearPostSaveWorkflowState()
    setManagedSiteConfigPrompt((prev) =>
      prev?.isOpen ? { ...prev, isOpen: false } : prev,
    )
    onClose()
  }, [
    invalidateCookieSession,
    invalidateAutoDetection,

    invalidateDuplicateConfirmation,
    invalidateSub2ApiSession,
    beforeOpenRouterOnboardingClose,
    clearPostSaveWorkflowState,
    completePendingAccountKeyProvisioningSuccess,
    onClose,
  ])

  const handleOpenCookiePermissionSettings = useCallback(() => {
    void openSettingsTab("permissions")
  }, [])

  const shouldDeferAccountSaveSuccess = useCallback(
    (result: AccountSaveResponse) => {
      const policy = getAccountDialogSitePolicy(siteType)

      return (
        shouldDeferAccountSaveSuccessForAccountDialogSite({
          policy,
          isAddMode: mode === DIALOG_MODES.ADD,
          autoProvisionKeyOnAccountAdd,
          autoProvisionKeyOnAccountAddMode,
          skipAutoProvisionKeyOnAccountAdd: false,
        }) &&
        result.success === true &&
        typeof result.accountId === "string" &&
        result.accountId.trim().length > 0
      )
    },
    [
      autoProvisionKeyOnAccountAdd,
      autoProvisionKeyOnAccountAddMode,
      mode,
      siteType,
    ],
  )

  const handleManagedSiteConfigPromptClose = useCallback(() => {
    setManagedSiteConfigPrompt((prev) =>
      prev?.isOpen ? { ...prev, isOpen: false } : prev,
    )
  }, [])

  const handleOpenManagedSiteSettings = useCallback(() => {
    // Land on the provider whose prompt was shown, not on a stale preference.
    const promptedSiteType = managedSiteConfigPromptState?.siteType
    handleManagedSiteConfigPromptClose()

    const settingsTarget = getManagedSiteSettingsTarget(
      promptedSiteType ?? managedSiteType,
    )
    // The settings tab opens in the background so this account form, and the
    // popup holding it, keep their focus; name the tab so it is findable.
    void openSettingsTabInNewTab(settingsTarget.tabId, {
      ...(settingsTarget.anchor ? { anchor: settingsTarget.anchor } : {}),
      keepCurrentWindow: true,
    })
      .then(() => {
        toast.success(
          t("messages.managedSiteSettingsOpened", {
            managedSite: getManagedSiteLabel(
              t,
              promptedSiteType ?? managedSiteType,
            ),
          }),
        )
      })
      .catch((error) => {
        toast.error(
          t("messages.operationFailed", {
            error: getErrorMessage(error),
          }),
        )
        logger.error("Failed to open managed-site settings", {
          managedSiteType,
          error: getErrorMessage(error),
        })
      })
  }, [
    handleManagedSiteConfigPromptClose,
    managedSiteConfigPromptState?.siteType,
    managedSiteType,
    t,
  ])

  const ensureManagedSiteAutoConfigReady = useCallback(async () => {
    const managedSite = getManagedSiteCapabilities(managedSiteType)
    const managedConfig = await managedSite.config.get()

    if (managedConfig) {
      return true
    }

    setManagedSiteConfigPrompt({
      isOpen: true,
      siteType: managedSiteType,
      messagesKey: getManagedSiteMessagesKeyFromSiteType(managedSite.siteType),
    })

    return false
  }, [managedSiteType])

  const applyAutoDetectedData = async (
    resultData: NonNullable<
      Awaited<ReturnType<typeof autoDetectAccount>>["data"]
    >,
    isCurrent: () => boolean,
  ) => {
    if (!isCurrent()) return false
    rememberCookieStore(resultData.fetchContext?.cookieStoreId)

    const detectedCheckIn = normalizeDetectedCheckIn(resultData.checkIn)
    const preserveExistingCheckIn =
      mode === DIALOG_MODES.EDIT ||
      formSource === ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
    const nextSiteType = isAccountSiteType(resultData.siteType)
      ? resultData.siteType
      : siteType
    accountCredentialScopeRef.current = {
      url: url.trim(),
      siteType: nextSiteType,
    }
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
        siteUrl: url,
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
      if (!(await importCookieAutomatically(isCurrent))) return false
    }
    if (!isCurrent()) return false

    enterForm(ACCOUNT_DIALOG_FORM_SOURCES.DETECTED)
    if (mode === DIALOG_MODES.EDIT) {
      toast.success(t("messages.autoDetectSuccess"))
    }
    return true
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
    if (!hasAccountAccessTokenRef.current && recoveryData.accessToken?.trim()) {
      accountCredentialScopeRef.current = {
        url: url.trim(),
        siteType: recovery.recoveredSiteType ?? recovery.nextSiteType,
      }
    }

    if (
      recoveryData.fetchContext?.cookieStoreId &&
      recoveryData.fetchContext.cookieStoreId.trim()
    ) {
      rememberCookieStore(recoveryData.fetchContext.cookieStoreId)
    }

    updateDraft((prev) => {
      return mergeAutoDetectRecoveryIntoDraft({
        draft: prev,
        recoveryData,
        nextSiteType: recovery.nextSiteType,
        hasExplicitAuthType: hasExplicitAuthTypeRef.current,
        sub2apiRefreshTokenPreferenceChanged:
          sub2ApiSession.hasUserChangedRefreshMode(),
      })
    })
  }

  const handleAutoDetect = () =>
    autoDetection.run({
      url,
      mode,
      isDetected,
      draft,
      credentialScope: accountCredentialScopeRef.current,
      form: {
        applyDetected: applyAutoDetectedData,
        applyRecovery: applyAutoDetectRecoveryData,
        enterManual: () => enterForm(ACCOUNT_DIALOG_FORM_SOURCES.MANUAL),
        setAccessToken,
        setAuthType,
        beforeDetect: () => rememberCookieStore(undefined),
        onOpenRouterStarted: () => setSiteType(SITE_TYPES.OPENROUTER),
        onOpenRouterCredentialCreated: (credential, requestedUrl) =>
          updateAccessToken(credential, {
            url: requestedUrl,
            siteType: SITE_TYPES.OPENROUTER,
          }),
      },
      onboarding: {
        tryPrepareForStart: tryPrepareOpenRouterOnboardingStart,
        abandonForOtherAutoDetect:
          abandonOpenRouterOnboardingForOtherAutoDetect,
      },
    })

  const handleShowManualForm = async () => {
    try {
      const shouldContinue = await confirmDuplicateAccount("manual")
      if (!shouldContinue?.isCurrent()) {
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
      const duplicateConfirmed = await confirmDuplicateAccount()
      if (!duplicateConfirmed?.isCurrent()) {
        saveAnalyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        isAnalyticsActionCompleted = true
        // Let callers distinguish cancellation from a failed save.
        return null
      }
      const shouldDeferSuccessForSitePolicy =
        shouldDeferAccountSaveSuccessForAccountDialogSite({
          policy,
          isAddMode: mode === DIALOG_MODES.ADD,
          autoProvisionKeyOnAccountAdd,
          autoProvisionKeyOnAccountAddMode,
          skipAutoProvisionKeyOnAccountAdd:
            options?.skipAutoProvisionKeyOnAccountAdd === true,
        })
      const sub2apiAuth = sub2ApiSession.auth
      const normalizedUserId = userId.trim()
      const normalizedAccessToken = accessToken.trim()

      const saveInput = {
        url: url.trim(),
        siteName: siteName.trim(),
        username: username.trim(),
        accessToken: normalizedAccessToken,
        userId: normalizedUserId,
        exchangeRate: exchangeRate,
        notes: notes.trim(),
        tagIds: tagIds,
        checkInConfig: checkIn,
        siteType: siteType,
        authType: authType,
        cookieAuthSessionCookie: cookieAuthSessionCookie.trim(),
        manualBalanceUsd: manualBalanceUsd,
        excludeFromTotalBalance: excludeFromTotalBalance,
        excludeFromTodayIncome: excludeFromTodayIncome,
        sub2apiAuth: sub2apiAuth,
      }
      const saveAccount = () =>
        mode === DIALOG_MODES.ADD
          ? validateAndSaveAccount({
              ...saveInput,
              options: {
                deferDataRefresh: true,
                skipAutoProvisionKeyOnAccountAdd:
                  options?.skipAutoProvisionKeyOnAccountAdd === true ||
                  shouldDeferSuccessForSitePolicy,
                ...(draft.kimiOpenPlatformAuth
                  ? { kimiOpenPlatformAuth: draft.kimiOpenPlatformAuth }
                  : {}),
              },
            })
          : validateAndUpdateAccount({
              accountId: account!.id,
              ...saveInput,
              options: {
                deferDataRefresh: true,
                ...(draft.kimiOpenPlatformAuth
                  ? { kimiOpenPlatformAuth: draft.kimiOpenPlatformAuth }
                  : {}),
                selectionChanged: checkInSelectionChangedRef.current,
                loadedKimiAuth: loadedKimiAuthRef.current,
                ...(checkInDiscoveryBaseSelectionRef.current
                  ? {
                      discoveryBaseSelection:
                        checkInDiscoveryBaseSelectionRef.current,
                    }
                  : {}),
              },
            })
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

        toast.warning(feedbackMessage, {
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
        await postSaveWorkflow.beginProvisioning({
          accountId: savedAccountId,
          accountName: siteName.trim() || policy.defaultSiteName || siteType,
          mode: autoProvisionKeyOnAccountAddMode,
          confirmOneTimeKey: policy.deferSuccessForOneTimeKeyPostSaveFlow,
        })
      }

      // A single provisioning owner must finish before any legacy default-key prompt opens.
      const autoProvisioningAllGroups =
        mode === DIALOG_MODES.ADD &&
        autoProvisionKeyOnAccountAdd &&
        autoProvisionKeyOnAccountAddMode ===
          ACCOUNT_KEY_AUTO_PROVISION_MODES.AllGroups &&
        options?.skipAutoProvisionKeyOnAccountAdd !== true
      const skipSub2ApiKeyPrompt =
        options?.skipSub2ApiKeyPrompt === true ||
        autoProvisioningAllGroups ||
        shouldDeferSuccessForSitePolicy
      if (
        savedAccountId &&
        policy.openSub2ApiTokenDialogPostSave &&
        !skipSub2ApiKeyPrompt
      ) {
        try {
          await postSaveWorkflow.openDefaultKeyPrompt(savedAccountId)
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

  const handleAutoConfig = () =>
    postSaveWorkflow.executeAutoConfig({
      account,
      ensureManagedSiteAutoConfigReady,
      saveAccount: () =>
        handleSaveAccount({
          skipSub2ApiKeyPrompt: true,
          skipAutoProvisionKeyOnAccountAdd: true,
        }),
    })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSaveAccount()
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
  const isManualBalanceUsdInvalid =
    manualBalanceUsd.trim() !== "" &&
    parseManualQuotaFromUsd(manualBalanceUsd) === undefined
  const isAccountFormValid =
    isFormValid && sub2ApiSession.isValid && !isManualBalanceUsdInvalid

  const tokenRecoveryState = useMemo<AccountDialogRecoveryState | null>(() => {
    if (
      detectionError?.type !==
      AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED
    )
      return null
    return {
      url,
      draft,
      ...(mode === DIALOG_MODES.EDIT && account
        ? { accountId: account.id }
        : {}),
      checkInSelectionChanged: checkInSelectionChangedRef.current,
      checkInDiscoveryBaseSelection: checkInDiscoveryBaseSelectionRef.current,
    }
  }, [account, detectionError?.type, draft, mode, url])

  return {
    state: {
      url,
      phase,
      formSource,
      draft,
      tokenRecoveryState,
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
      postSaveOneTimeSecret,
      postSaveKeyProvisioning,
      postSaveKeyInputAccount,
      postSaveKeyInputSessionId,
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
      handlePostSaveOneTimeSecretClose,
      handlePostSaveKeyProvisioningClose,
      handlePostSaveKeyInputTokenDialogClose,
      handlePostSaveKeyInputTokenCreated,
      getPostSaveKeyInputDialogHandlers,
    },
  }
}

/**
 * Maps detailed auto-detect failure kinds to the coarse analytics taxonomy.
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
