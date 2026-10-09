import type { Dispatch, RefObject, SetStateAction } from "react"
import { useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { type useAccountCurrentTab } from "~/features/AccountManagement/components/AccountDialog/detection/useAccountCurrentTab"
import type { createAccountCredentialEvidence } from "~/features/AccountManagement/components/AccountDialog/form/accountCredentialEvidence"
import {
  getAccountDialogSitePolicy,
  normalizeAccountDialogDraftForSitePolicy,
} from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
import { type useOpenRouterAccountOnboarding } from "~/features/AccountManagement/components/AccountDialog/form/useOpenRouterAccountOnboarding"
import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  ACCOUNT_DIALOG_PHASES,
  createEmptyAccountDialogDraft,
  getInitialFlowState,
  type AccountDialogDraft,
  type AccountDialogFormSource,
  type AccountDialogPhase,
  type AccountDialogRecoveryState,
  type AddAccountPrefill,
} from "~/features/AccountManagement/components/AccountDialog/models"
import { normalizeAddAccountPrefill } from "~/features/AccountManagement/sponsors/pendingAddAccountIntent"
import { BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE } from "~/features/AccountManagement/sponsors/types"
import toast from "~/lib/notify"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"
import type { CheckInMethodSelection } from "~/types/checkIn"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("AccountDialogHook")

type InitializationInput = {
  context: {
    mode: DialogMode
    account: DisplaySiteData | null | undefined
    prefill: AddAccountPrefill | null | undefined
    recoveryState: AccountDialogRecoveryState | null | undefined
    isOpen: boolean
  }
  evidence: {
    isCloseTransitionStartedRef: RefObject<boolean>
    selectedSiteTypeRef: RefObject<AccountSiteType>
    selectedSiteUrlRef: RefObject<string>
    hasExplicitAuthTypeRef: RefObject<boolean>
    credentialEvidence: ReturnType<typeof createAccountCredentialEvidence>
    automaticExecutionPreferenceChangedRef: RefObject<boolean>
    checkInSelectionChangedRef: RefObject<boolean>
    checkInDiscoveryBaseSelectionRef: RefObject<CheckInMethodSelection | null>
  }
  form: {
    setUrl: Dispatch<SetStateAction<string>>
    setDraft: Dispatch<SetStateAction<AccountDialogDraft>>
    setPhase: Dispatch<SetStateAction<AccountDialogPhase>>
    setFormSource: Dispatch<SetStateAction<AccountDialogFormSource>>
    setShowAccessToken: Dispatch<SetStateAction<boolean>>
    enterForm: (source: AccountDialogFormSource) => void
  }
  sessions: {
    invalidateAutoDetection: () => void
    resetCurrentTab: ReturnType<typeof useAccountCurrentTab>["reset"]
    invalidateDuplicateConfirmation: () => void
    resetOpenRouterOnboardingSession: ReturnType<
      typeof useOpenRouterAccountOnboarding
    >["resetSession"]
    resetSub2ApiSession: () => void
    resetAutoDetection: () => void
    resetCheckInRedetection: () => void
    resetCookieSession: () => void
    clearPostSaveWorkflowState: () => void
    notifyCurrentTabUrlChanged: ReturnType<
      typeof useAccountCurrentTab
    >["notifyUrlChanged"]
    requireAccessTokenVerification: () => void
    checkCurrentTab: ReturnType<typeof useAccountCurrentTab>["checkCurrentTab"]
  }
}

/** Reset and hydrate the draft when opening an add, edit, or recovery session. */
export function useAccountDialogInitialization({
  context,
  evidence,
  form,
  sessions,
}: InitializationInput) {
  const { i18n } = useTranslation(["accountDialog", "settings", "messages"])
  const { mode, account, prefill, recoveryState, isOpen } = context
  const {
    isCloseTransitionStartedRef,
    selectedSiteTypeRef,
    selectedSiteUrlRef,
    hasExplicitAuthTypeRef,
    credentialEvidence,
    automaticExecutionPreferenceChangedRef,
    checkInSelectionChangedRef,
    checkInDiscoveryBaseSelectionRef,
  } = evidence
  const {
    setUrl,
    setDraft,
    setPhase,
    setFormSource,
    setShowAccessToken,
    enterForm,
  } = form
  const {
    invalidateAutoDetection,
    resetCurrentTab,
    invalidateDuplicateConfirmation,
    resetOpenRouterOnboardingSession,
    resetSub2ApiSession,
    resetAutoDetection,
    resetCheckInRedetection,
    resetCookieSession,
    clearPostSaveWorkflowState,
    notifyCurrentTabUrlChanged,
    requireAccessTokenVerification,
    checkCurrentTab,
  } = sessions
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
      credentialEvidence.reset()
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
      credentialEvidence,
      automaticExecutionPreferenceChangedRef,
      checkInDiscoveryBaseSelectionRef,
      checkInSelectionChangedRef,
      hasExplicitAuthTypeRef,
      isCloseTransitionStartedRef,
      selectedSiteTypeRef,
      selectedSiteUrlRef,
      setDraft,
      setFormSource,
      setPhase,
      setShowAccessToken,
      setUrl,
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
          credentialEvidence.acceptLoadedCredential({
            accessToken: siteAccount.account_info.access_token,
            scope: { url: siteAccount.site_url, siteType: normalizedSiteType },
            loadedKimiAuth: siteAccount.kimiOpenPlatformAuth
              ? {
                  accessToken: siteAccount.account_info.access_token,
                  refreshToken: siteAccount.kimiOpenPlatformAuth.refreshToken,
                  organizationId:
                    siteAccount.kimiOpenPlatformAuth.organizationId,
                }
              : undefined,
          })
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
    [
      enterForm,
      i18n,
      credentialEvidence,
      checkInDiscoveryBaseSelectionRef,
      checkInSelectionChangedRef,
      hasExplicitAuthTypeRef,
      selectedSiteTypeRef,
      selectedSiteUrlRef,
      setUrl,
      setDraft,
    ],
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
        credentialEvidence.rememberScope({
          url: recoveryState.url,
          siteType: recoveredDraft.siteType,
        })
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
    credentialEvidence,
    automaticExecutionPreferenceChangedRef,
    checkInDiscoveryBaseSelectionRef,
    checkInSelectionChangedRef,
    hasExplicitAuthTypeRef,
    selectedSiteTypeRef,
    selectedSiteUrlRef,
    setDraft,
    setFormSource,
    setPhase,
    setUrl,
  ])
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
