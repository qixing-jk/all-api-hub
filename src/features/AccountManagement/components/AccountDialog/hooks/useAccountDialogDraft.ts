import { useCallback, useEffect, useRef, useState } from "react"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import type { AccountSiteType } from "~/constants/siteType"
import {
  getAccountDialogSitePolicy,
  normalizeAccountDialogDraftForSitePolicy,
} from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
import { resolveDefaultAccountAuthType } from "~/features/AccountManagement/utils/accountAuthType"
import { usesAccountCredentialIdentity } from "~/services/accounts/accountDedupe"
import {
  createCompatibilityCheckInConfig,
  resolveNewAccountAutomaticExecutionEnabled,
} from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
import { invalidateCheckInDiscovery } from "~/services/checkin/autoCheckin/state"
import { type AuthTypeEnum, type CheckInConfig } from "~/types"

import {
  createEmptyAccountDialogDraft,
  type AccountDialogDraft,
} from "../models"

/** Owns editable account facts and user choices independently of asynchronous sessions. */
export function useAccountDialogDraft({
  mode,
  url,
}: {
  mode: DialogMode
  url: string
}) {
  const [draft, setDraft] = useState<AccountDialogDraft>(
    createEmptyAccountDialogDraft,
  )
  const hasExplicitAuthTypeRef = useRef(false)
  const automaticExecutionPreferenceChangedRef = useRef(false)
  const { siteType, checkIn } = draft
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
  useEffect(() => {
    const policy = getAccountDialogSitePolicy(siteType)

    updateDraft((prev) =>
      normalizeAccountDialogDraftForSitePolicy({
        draft: prev,
        policy,
      }),
    )
  }, [siteType, updateDraft])

  const changeSiteTypeDraft = useCallback(
    (nextSiteType: AccountSiteType) => {
      const nextPolicy = getAccountDialogSitePolicy(nextSiteType)
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
    },
    [mode, url, updateDraft],
  )
  const setAuthTypeDraft = useCallback(
    (value: AuthTypeEnum) => {
      hasExplicitAuthTypeRef.current = true
      updateDraft((prev) => ({ ...prev, authType: value }))
    },
    [updateDraft],
  )
  return {
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
    changeSiteTypeDraft,
    setAuthTypeDraft,
    applyAuthDefaultForUrl,
  }
}
