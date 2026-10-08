import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { CHECK_IN_SELECTION_MODES } from "~/constants/checkIn"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { startAccountDialogAnalyticsAction } from "~/features/AccountManagement/components/AccountDialog/analytics"
import { useAccountCheckInRedetection } from "~/features/AccountManagement/components/AccountDialog/checkin/useAccountCheckInRedetection"
import { useAccountAutoDetection } from "~/features/AccountManagement/components/AccountDialog/detection/useAccountAutoDetection"
import { useAccountCurrentTab } from "~/features/AccountManagement/components/AccountDialog/detection/useAccountCurrentTab"
import { useAccountDialogDetection } from "~/features/AccountManagement/components/AccountDialog/detection/useAccountDialogDetection"
import { useAccountCookieSession } from "~/features/AccountManagement/components/AccountDialog/form/useAccountCookieSession"
import { useAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/form/useAccountDialogDraft"
import { useAccountDialogIdentityChanges } from "~/features/AccountManagement/components/AccountDialog/form/useAccountDialogIdentityChanges"
import { useAccountDialogInitialization } from "~/features/AccountManagement/components/AccountDialog/form/useAccountDialogInitialization"
import { useOpenRouterAccountOnboarding } from "~/features/AccountManagement/components/AccountDialog/form/useOpenRouterAccountOnboarding"
import { useSub2ApiAccountSession } from "~/features/AccountManagement/components/AccountDialog/form/useSub2ApiAccountSession"
import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  ACCOUNT_DIALOG_PHASES,
  getInitialFlowState,
  type AccountDialogFormSource,
  type AccountDialogPhase,
  type AccountDialogRecoveryState,
  type AddAccountPrefill,
} from "~/features/AccountManagement/components/AccountDialog/models"
import { useAccountManagedSiteSetup } from "~/features/AccountManagement/components/AccountDialog/postSave/useAccountManagedSiteSetup"
import { useAccountPostSaveWorkflow } from "~/features/AccountManagement/components/AccountDialog/postSave/useAccountPostSaveWorkflow"
import { useAccountDialogSaveWorkflow } from "~/features/AccountManagement/components/AccountDialog/saving/useAccountDialogSaveWorkflow"
import { useAccountDuplicateConfirmation } from "~/features/AccountManagement/components/AccountDialog/saving/useAccountDuplicateConfirmation"
import {
  isValidAccount,
  parseManualQuotaFromUsd,
} from "~/services/accounts/accountFormValidation"
import { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/inspection"
import { getAutoCheckinCandidateMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { type CheckInConfig, type DisplaySiteData } from "~/types"
import type { CheckInMethodSelection } from "~/types/checkIn"
import { createLogger } from "~/utils/core/logger"
import { openSettingsTab } from "~/utils/navigation"

/**
 * Logger scoped to the account dialog lifecycle. Ensure we never include raw tokens/cookies in log details.
 */
const logger = createLogger("AccountDialogHook")

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
    requireAccessTokenVerification,
  } = autoDetection
  const draftModel = useAccountDialogDraft({ mode, url })
  const {
    draft,
    setDraft,
    updateDraft,
    hasExplicitAuthTypeRef,
    automaticExecutionPreferenceChangedRef,
    setSiteName,
    setUsername,
    setExchangeRate,
    setManualBalanceUsd,
    setNotes,
    setTagIds,
    setExcludeFromTotalBalance,
    setExcludeFromTodayIncome,
    setCheckIn,
    applyAuthDefaultForUrl,
  } = draftModel
  const checkInSelectionChangedRef = useRef(false)
  const checkInDiscoveryBaseSelectionRef =
    useRef<CheckInMethodSelection | null>(null)
  const initialFlowState = getInitialFlowState(mode)
  const [phase, setPhase] = useState<AccountDialogPhase>(initialFlowState.phase)
  const [formSource, setFormSource] = useState<AccountDialogFormSource>(
    initialFlowState.formSource,
  )
  const [showAccessToken, setShowAccessToken] = useState(false)
  const openRouterOnboarding = useOpenRouterAccountOnboarding()
  const {
    recovery: openRouterOnboardingRecovery,
    resetSession: resetOpenRouterOnboardingSession,
    notifyUrlChange: notifyOpenRouterUrlChange,
    notifySiteChange: notifyOpenRouterSiteChange,
    notifyCredentialChange: notifyOpenRouterCredentialChange,
    beforeClose: beforeOpenRouterOnboardingClose,
    confirmSavedCredential: confirmSavedOpenRouterCredential,
  } = openRouterOnboarding

  const {
    managedSiteConfigPrompt,
    handleManagedSiteConfigPromptClose,
    handleOpenManagedSiteSettings,
    ensureManagedSiteAutoConfigReady,
  } = useAccountManagedSiteSetup(managedSiteType)

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
  const {
    setDialogUrl,
    setAccessToken,
    setUserId,
    setSiteType,
    setAuthType,
    setCookieAuthSessionCookie,
    setDraftPartial,
  } = useAccountDialogIdentityChanges({
    draftModel,
    selectedSiteUrlRef,
    selectedSiteTypeRef,
    setUrl,
    updateAccessToken,
    sessions: {
      duplicate: duplicateConfirmation,
      cookie: cookieSession,
      sub2api: sub2ApiSession,
      detection: autoDetection,
      openRouter: openRouterOnboarding,
      currentTab,
      resetCheckInRedetection,
    },
  })
  const enterForm = useCallback((source: AccountDialogFormSource) => {
    setPhase(ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM)
    setFormSource(source)
  }, [])

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

  useAccountDialogInitialization({
    context: { mode, account, prefill, recoveryState, isOpen },
    evidence: {
      isCloseTransitionStartedRef,
      selectedSiteTypeRef,
      selectedSiteUrlRef,
      hasExplicitAuthTypeRef,
      accountCredentialScopeRef,
      loadedKimiAuthRef,
      automaticExecutionPreferenceChangedRef,
      checkInSelectionChangedRef,
      checkInDiscoveryBaseSelectionRef,
    },
    form: {
      setUrl,
      setDraft,
      setPhase,
      setFormSource,
      setShowAccessToken,
      enterForm,
    },
    sessions: {
      invalidateAutoDetection,
      resetCurrentTab,
      notifyCurrentTabUrlChanged,
      invalidateDuplicateConfirmation,
      resetOpenRouterOnboardingSession,
      resetSub2ApiSession,
      resetAutoDetection,
      resetCheckInRedetection,
      resetCookieSession,
      clearPostSaveWorkflowState,
      requireAccessTokenVerification,
      checkCurrentTab,
    },
  })

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
    handleManagedSiteConfigPromptClose()
    onClose()
  }, [
    invalidateCookieSession,
    invalidateAutoDetection,

    invalidateDuplicateConfirmation,
    invalidateSub2ApiSession,
    beforeOpenRouterOnboardingClose,
    clearPostSaveWorkflowState,
    completePendingAccountKeyProvisioningSuccess,
    handleManagedSiteConfigPromptClose,
    onClose,
  ])

  const handleOpenCookiePermissionSettings = useCallback(() => {
    void openSettingsTab(BASIC_SETTINGS_TAB_IDS.Permissions)
  }, [])

  const { handleAutoDetect, handleShowManualForm } = useAccountDialogDetection({
    context: { mode, url, draft, formSource, isDetected },
    evidence: {
      accountCredentialScopeRef,
      automaticExecutionPreferenceChangedRef,
      checkInDiscoveryBaseSelectionRef,
      selectedSiteTypeRef,
      hasAccountAccessTokenRef,
      hasExplicitAuthTypeRef,
    },
    form: {
      setDraft,
      updateDraft,
      setSiteType,
      setAccessToken,
      setAuthType,
      updateAccessToken,
      enterForm,
    },
    autoDetection,
    sub2ApiSession,
    cookieSession,
    currentTab,
    onboarding: openRouterOnboarding,
    duplicateConfirmation,
  })

  const { isSaving, handleSaveAccount, shouldDeferAccountSaveSuccess } =
    useAccountDialogSaveWorkflow({
      mode,
      account,
      url,
      draft,
      sub2ApiSession,
      autoProvisionKeyOnAccountAdd,
      autoProvisionKeyOnAccountAddMode,
      confirmDuplicateAccount,
      confirmSavedOpenRouterCredential,
      postSaveWorkflow,
      checkInSelectionChangedRef,
      checkInDiscoveryBaseSelectionRef,
      loadedKimiAuthRef,
      onPostSaveAccountRefresh,
    })

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
