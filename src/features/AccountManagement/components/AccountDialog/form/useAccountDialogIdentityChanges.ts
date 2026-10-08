import { useCallback } from "react"
import type React from "react"

import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { type useAccountAutoDetection } from "~/features/AccountManagement/components/AccountDialog/detection/useAccountAutoDetection"
import { type useAccountCurrentTab } from "~/features/AccountManagement/components/AccountDialog/detection/useAccountCurrentTab"
import { getAccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
import { type useAccountCookieSession } from "~/features/AccountManagement/components/AccountDialog/form/useAccountCookieSession"
import { type useAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/form/useAccountDialogDraft"
import { type useOpenRouterAccountOnboarding } from "~/features/AccountManagement/components/AccountDialog/form/useOpenRouterAccountOnboarding"
import { type useSub2ApiAccountSession } from "~/features/AccountManagement/components/AccountDialog/form/useSub2ApiAccountSession"
import { type AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { type useAccountDuplicateConfirmation } from "~/features/AccountManagement/components/AccountDialog/saving/useAccountDuplicateConfirmation"
import { isAccountAuthType } from "~/features/AccountManagement/utils/accountAuthType"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import { invalidateCheckInDiscovery } from "~/services/checkin/autoCheckin/state"
import { AuthTypeEnum } from "~/types"

type IdentityChanges = {
  draftModel: ReturnType<typeof useAccountDialogDraft>
  selectedSiteUrlRef: React.RefObject<string>
  selectedSiteTypeRef: React.RefObject<AccountSiteType>
  setUrl: (value: string) => void
  updateAccessToken: (value: string) => void
  sessions: {
    duplicate: Pick<
      ReturnType<typeof useAccountDuplicateConfirmation>,
      "invalidate"
    >
    cookie: Pick<ReturnType<typeof useAccountCookieSession>, "invalidate">
    sub2api: Pick<ReturnType<typeof useSub2ApiAccountSession>, "invalidate">
    detection: Pick<
      ReturnType<typeof useAccountAutoDetection>,
      "invalidate" | "clearVerificationError"
    >
    openRouter: Pick<
      ReturnType<typeof useOpenRouterAccountOnboarding>,
      "notifyUrlChange" | "notifySiteChange" | "notifyCredentialChange"
    >
    currentTab: Pick<
      ReturnType<typeof useAccountCurrentTab>,
      "notifyUrlChanged"
    >
    resetCheckInRedetection: () => void
  }
}
/** Applies identity changes and invalidates the evidence and sessions bound to them. */
export function useAccountDialogIdentityChanges({
  draftModel,
  selectedSiteUrlRef,
  selectedSiteTypeRef,
  setUrl,
  updateAccessToken,
  sessions,
}: IdentityChanges) {
  const {
    draft: { userId, siteType },
    setDraft,
    updateDraft,
    changeSiteTypeDraft,
    setAuthTypeDraft,
  } = draftModel
  const {
    duplicate: { invalidate: invalidateDuplicateConfirmation },
    cookie: { invalidate: invalidateCookieSession },
    sub2api: { invalidate: invalidateSub2ApiSession },
    detection: { invalidate: invalidateAutoDetection, clearVerificationError },
    openRouter: {
      notifyUrlChange: notifyOpenRouterUrlChange,
      notifySiteChange: notifyOpenRouterSiteChange,
      notifyCredentialChange: notifyOpenRouterCredentialChange,
    },
    currentTab: { notifyUrlChanged: notifyCurrentTabUrlChanged },
    resetCheckInRedetection,
  } = sessions
  // These credential sessions must stop before a new identity becomes observable.
  const invalidateCredentialSessions = useCallback(
    (preserveAcknowledgement = false) => {
      invalidateDuplicateConfirmation(preserveAcknowledgement)
      invalidateCookieSession()
      invalidateSub2ApiSession()
    },
    [
      invalidateDuplicateConfirmation,
      invalidateCookieSession,
      invalidateSub2ApiSession,
    ],
  )
  const setDialogUrl = useCallback(
    (value: string) => {
      invalidateCredentialSessions()
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
      invalidateCredentialSessions,
      clearVerificationError,
      invalidateAutoDetection,
      notifyCurrentTabUrlChanged,
      notifyOpenRouterUrlChange,
      resetCheckInRedetection,
      setDraft,
      selectedSiteUrlRef,
      setUrl,
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
  const setSiteType = useCallback(
    (value: string) => {
      const nextSiteType = isAccountSiteType(value) ? value : SITE_TYPES.UNKNOWN
      invalidateCredentialSessions(nextSiteType === selectedSiteTypeRef.current)
      resetCheckInRedetection()
      if (nextSiteType !== selectedSiteTypeRef.current) {
        clearVerificationError()
      }
      const nextPolicy = getAccountDialogSitePolicy(nextSiteType)
      selectedSiteTypeRef.current = nextSiteType
      const { clearCreatedCredential } =
        notifyOpenRouterSiteChange(nextSiteType)
      if (clearCreatedCredential) updateAccessToken("")
      changeSiteTypeDraft(nextSiteType)
      if (nextPolicy.canonicalSiteUrl) {
        setDialogUrl(nextPolicy.canonicalSiteUrl)
      }
    },
    [
      invalidateCredentialSessions,
      clearVerificationError,
      setDialogUrl,
      notifyOpenRouterSiteChange,
      resetCheckInRedetection,
      updateAccessToken,
      changeSiteTypeDraft,
      selectedSiteTypeRef,
    ],
  )
  const setAuthType = useCallback(
    (value: AuthTypeEnum) => {
      if (!isAccountAuthType(value)) return
      invalidateCredentialSessions(true)

      if (value !== AuthTypeEnum.AccessToken) {
        clearVerificationError()
      }
      setAuthTypeDraft(value)
    },
    [invalidateCredentialSessions, clearVerificationError, setAuthTypeDraft],
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
  return {
    setDialogUrl,
    setAccessToken,
    setUserId,
    setSiteType,
    setAuthType,
    setCookieAuthSessionCookie,
    setDraftPartial,
  }
}
