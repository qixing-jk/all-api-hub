import type { Dispatch, RefObject, SetStateAction } from "react"
import { useTranslation } from "react-i18next"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import {
  buildDraftFromAutoDetectResult,
  mergeAutoDetectRecoveryIntoDraft,
  normalizeDetectedCheckIn,
  resolveAutoDetectRecovery,
} from "~/features/AccountManagement/components/AccountDialog/detection/autoDetectDraft"
import { type useAccountAutoDetection } from "~/features/AccountManagement/components/AccountDialog/detection/useAccountAutoDetection"
import { type useAccountCurrentTab } from "~/features/AccountManagement/components/AccountDialog/detection/useAccountCurrentTab"
import {
  getAccountDialogSitePolicy,
  shouldAutoImportCookieAuthForAccountDialogSite,
} from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
import { type useAccountCookieSession } from "~/features/AccountManagement/components/AccountDialog/form/useAccountCookieSession"
import { type useOpenRouterAccountOnboarding } from "~/features/AccountManagement/components/AccountDialog/form/useOpenRouterAccountOnboarding"
import { type useSub2ApiAccountSession } from "~/features/AccountManagement/components/AccountDialog/form/useSub2ApiAccountSession"
import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  type AccountDialogDraft,
  type AccountDialogFormSource,
} from "~/features/AccountManagement/components/AccountDialog/models"
import { type useAccountDuplicateConfirmation } from "~/features/AccountManagement/components/AccountDialog/saving/useAccountDuplicateConfirmation"
import toast from "~/lib/notify"
import { type autoDetectAccount } from "~/services/accounts/accountAutoDetection"
import type { AccountAutoDetectRecoveryData } from "~/services/accounts/autoDetect/recovery"
import { type AuthTypeEnum } from "~/types"
import type { CheckInMethodSelection } from "~/types/checkIn"
import { getErrorMessage } from "~/utils/core/error"

type DetectionInput = {
  context: {
    mode: DialogMode
    url: string
    draft: AccountDialogDraft
    formSource: AccountDialogFormSource
    isDetected: boolean
  }
  evidence: {
    accountCredentialScopeRef: RefObject<{
      url: string
      siteType: AccountSiteType
    } | null>
    automaticExecutionPreferenceChangedRef: RefObject<boolean>
    checkInDiscoveryBaseSelectionRef: RefObject<CheckInMethodSelection | null>
    selectedSiteTypeRef: RefObject<AccountSiteType>
    hasAccountAccessTokenRef: RefObject<boolean>
    hasExplicitAuthTypeRef: RefObject<boolean>
  }
  form: {
    setDraft: Dispatch<SetStateAction<AccountDialogDraft>>
    updateDraft: (
      update: (previous: AccountDialogDraft) => AccountDialogDraft,
    ) => void
    setSiteType: (value: AccountSiteType) => void
    setAccessToken: (value: string) => void
    setAuthType: (value: AuthTypeEnum) => void
    updateAccessToken: (
      value: string,
      scope?: { url: string; siteType: AccountSiteType },
    ) => void
    enterForm: (source: AccountDialogFormSource) => void
  }
  autoDetection: Pick<ReturnType<typeof useAccountAutoDetection>, "run">
  sub2ApiSession: Pick<
    ReturnType<typeof useSub2ApiAccountSession>,
    "hasUserChangedRefreshMode"
  >
  cookieSession: Pick<
    ReturnType<typeof useAccountCookieSession>,
    "importAutomatically"
  >
  currentTab: Pick<
    ReturnType<typeof useAccountCurrentTab>,
    "rememberCookieStore"
  >
  onboarding: Pick<
    ReturnType<typeof useOpenRouterAccountOnboarding>,
    "tryPrepareForStart" | "abandonForOtherAutoDetect"
  >
  duplicateConfirmation: Pick<
    ReturnType<typeof useAccountDuplicateConfirmation>,
    "confirm"
  >
}
/** Apply detected identities and recoverable credentials within the current draft session. */
export function useAccountDialogDetection({
  context,
  evidence,
  form,
  autoDetection,
  sub2ApiSession,
  cookieSession,
  currentTab,
  onboarding,
  duplicateConfirmation,
}: DetectionInput) {
  const { t } = useTranslation(["accountDialog", "settings", "messages"])
  const { mode, url, draft, formSource, isDetected } = context
  const { siteType, checkIn, authType, cookieAuthSessionCookie } = draft
  const {
    accountCredentialScopeRef,
    automaticExecutionPreferenceChangedRef,
    checkInDiscoveryBaseSelectionRef,
    selectedSiteTypeRef,
    hasAccountAccessTokenRef,
    hasExplicitAuthTypeRef,
  } = evidence
  const {
    setDraft,
    updateDraft,
    setSiteType,
    setAccessToken,
    setAuthType,
    updateAccessToken,
    enterForm,
  } = form
  const { importAutomatically: importCookieAutomatically } = cookieSession
  const { rememberCookieStore } = currentTab
  const {
    tryPrepareForStart: tryPrepareOpenRouterOnboardingStart,
    abandonForOtherAutoDetect: abandonOpenRouterOnboardingForOtherAutoDetect,
  } = onboarding
  const { confirm: confirmDuplicateAccount } = duplicateConfirmation
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

  return { handleAutoDetect, handleShowManualForm }
}
