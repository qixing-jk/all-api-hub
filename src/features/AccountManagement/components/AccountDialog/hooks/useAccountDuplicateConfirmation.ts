import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  findExactCredentialDuplicateAccountId,
  usesAccountCredentialIdentity,
} from "~/services/accounts/accountDedupe"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { findAccountsBySiteIdentity } from "~/services/accounts/accountMatching"
import { normalizeAccountSiteProfileUrlForDuplicateCheck } from "~/services/accounts/accountSiteProfile/urls"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import type { DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"

import type { AccountDialogDraft } from "../models"

const logger = createLogger("AccountDuplicateConfirmation")

interface DuplicateWarning {
  isOpen: boolean
  siteUrl: string
  existingAccountsCount: number
  existingUsername: string | null
  existingUserId: string | number | null
}

type WarningDetails = Omit<DuplicateWarning, "isOpen">

/** Owns duplicate lookup, confirmation, and acknowledgement for one dialog draft. */
export function useAccountDuplicateConfirmation({
  isOpen,
  mode,
  account,
  url,
  draft,
}: {
  isOpen: boolean
  mode: DialogMode
  account?: DisplaySiteData | null
  url: string
  draft: AccountDialogDraft
}) {
  const { t } = useTranslation(["settings"])
  const { warnOnDuplicateAccountAdd, updateWarnOnDuplicateAccountAdd } =
    useUserPreferencesContext()
  const [warning, setWarning] = useState<DuplicateWarning>({
    isOpen: false,
    siteUrl: "",
    existingAccountsCount: 0,
    existingUsername: null,
    existingUserId: null,
  })
  const generationRef = useRef(0)
  const openRef = useRef(isOpen)
  const pendingRef = useRef<{
    generation: number
    resolve: (confirmed: boolean) => void
  } | null>(null)
  const acknowledgedRef = useRef<string | null>(null)
  const identity = useMemo(
    () =>
      JSON.stringify([
        mode,
        account?.id,
        draft.siteType,
        normalizeUrl(url, draft.siteType),
        normalizeAccountIdentity(draft.userId),
      ]),
    [mode, account?.id, draft.siteType, url, draft.userId],
  )
  const previousIdentityRef = useRef(identity)

  const invalidate = useCallback((preserveAcknowledgement = false) => {
    generationRef.current += 1
    pendingRef.current?.resolve(false)
    pendingRef.current = null
    if (!preserveAcknowledgement) acknowledgedRef.current = null
    setWarning((previous) =>
      previous.isOpen ? { ...previous, isOpen: false } : previous,
    )
  }, [])

  useLayoutEffect(() => {
    openRef.current = isOpen
    invalidate(isOpen && previousIdentityRef.current === identity)
    previousIdentityRef.current = identity
  }, [
    isOpen,
    identity,
    url,
    draft.accessToken,
    draft.authType,
    draft.cookieAuthSessionCookie,
    account?.token,
    invalidate,
  ])

  useLayoutEffect(
    () => () => {
      openRef.current = false
      generationRef.current += 1
      pendingRef.current?.resolve(false)
      pendingRef.current = null
      acknowledgedRef.current = null
    },
    [],
  )

  const confirm = useCallback(
    async (purpose: "manual" | "save" = "save") => {
      // A newer attempt also owns lookups that have not opened a prompt yet.
      invalidate(true)
      const generation = generationRef.current
      const isCurrent = () =>
        openRef.current && generationRef.current === generation
      const permit = { isCurrent }
      if (!isCurrent()) return null
      if (!warnOnDuplicateAccountAdd) return permit

      const credentialIdentity = usesAccountCredentialIdentity(draft.siteType)
      if (credentialIdentity) {
        if (purpose === "manual" || !draft.accessToken.trim()) return permit
        if (
          mode === DIALOG_MODES.EDIT &&
          account?.token?.trim() === draft.accessToken.trim()
        )
          return permit
      } else {
        if (
          mode !== DIALOG_MODES.ADD ||
          !url.trim() ||
          !normalizeAccountIdentity(draft.userId)
        )
          return permit
        if (acknowledgedRef.current === identity) return permit
      }

      let accounts: Awaited<
        ReturnType<typeof accountQueries.getAllAccountsOrThrow>
      >
      try {
        accounts = await accountQueries.getAllAccountsOrThrow()
      } catch {
        if (!isCurrent()) return null
        logger.warn(
          credentialIdentity
            ? "Exact-credential duplicate lookup failed; continuing without warning"
            : "Duplicate-account lookup failed; continuing without warning",
          {
            siteType: draft.siteType,
            status: "storage_lookup_failed",
            category: "duplicate_check",
          },
        )
        return permit
      }
      if (!isCurrent()) return null

      let details: WarningDetails
      if (credentialIdentity) {
        const duplicateId = findExactCredentialDuplicateAccountId({
          accounts,
          siteType: draft.siteType,
          accessToken: draft.accessToken,
          excludeAccountId:
            mode === DIALOG_MODES.EDIT ? account?.id : undefined,
        })
        if (!duplicateId) return permit
        details = {
          siteUrl: url.trim(),
          existingAccountsCount: 1,
          existingUsername: null,
          existingUserId: null,
        }
      } else {
        const matches = findAccountsBySiteIdentity({
          accounts,
          siteUrl: url.trim(),
          userId: normalizeAccountIdentity(draft.userId)!,
        })
        const match = matches[0]
        if (!match) return permit
        details = {
          siteUrl: normalizeUrl(match.site_url, match.site_type),
          existingAccountsCount: matches.length,
          existingUsername: match.account_info.username,
          existingUserId: match.account_info.id,
        }
      }
      const confirmed = await new Promise<boolean>((resolve) => {
        pendingRef.current = { generation, resolve }
        setWarning({ isOpen: true, ...details })
      })
      if (!confirmed || !isCurrent()) return null
      if (!credentialIdentity) acknowledgedRef.current = identity
      return permit
    },
    [
      invalidate,
      warnOnDuplicateAccountAdd,
      draft.siteType,
      draft.accessToken,
      draft.userId,
      mode,
      account?.token,
      account?.id,
      url,
      identity,
    ],
  )

  const continueConfirmation = useCallback(() => {
    const pending = pendingRef.current
    if (
      !pending ||
      !openRef.current ||
      pending.generation !== generationRef.current
    )
      return
    pendingRef.current = null
    setWarning((previous) => ({ ...previous, isOpen: false }))
    pending.resolve(true)
  }, [])

  const disableAndContinue = useCallback(async () => {
    const pending = pendingRef.current
    if (!pending) return
    const isCurrent = () =>
      openRef.current &&
      pendingRef.current === pending &&
      generationRef.current === pending.generation
    let result: Awaited<
      ReturnType<typeof updateWarnOnDuplicateAccountAdd>
    > | null = null
    try {
      result = await updateWarnOnDuplicateAccountAdd(false)
    } catch {
      if (isCurrent())
        logger.warn("Failed to disable duplicate-account warning preference")
    }
    if (!isCurrent()) return
    if (!result?.ok) {
      showUpdateToast(
        result ?? false,
        t("settings:duplicateAccountWarningOnAdd.toggleLabel"),
      )
      return
    }
    continueConfirmation()
  }, [updateWarnOnDuplicateAccountAdd, t, continueConfirmation])

  return {
    warning,
    confirm,
    invalidate,
    continueConfirmation,
    disableAndContinue,
  }
}

/** Normalizes site aliases for duplicate confirmation identity. */
function normalizeUrl(url: string, siteType: string) {
  return (
    normalizeAccountSiteProfileUrlForDuplicateCheck({ url, siteType }) ??
    url.trim().toLowerCase()
  )
}
