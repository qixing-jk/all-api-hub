import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { type AccountSiteType } from "~/constants/siteType"
import { startAccountDialogAnalyticsAction } from "~/features/AccountManagement/components/AccountDialog/analytics"
import {
  buildSub2ApiAuthFromAccountDialogDraft,
  getAccountDialogSitePolicy,
} from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
import type { AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import toast from "~/lib/notify"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  resolveAccountBrowserSession,
  type ResolveAccountBrowserSessionOptions,
} from "~/services/accountBrowserSession"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import { normalizeSub2ApiAuth } from "~/services/apiAdapters/sub2api/auth/authSession"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnostics/diagnosticsError"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"

/** Owns refresh-session input, import admission and stale-result rejection for the account draft. */
export function useSub2ApiAccountSession({
  isOpen,
  mode,
  accountId,
  url,
  draft,
  updateDraft,
  updateAccessToken,
  getCurrentTab,
}: {
  isOpen: boolean
  mode: DialogMode
  accountId?: string
  url: string
  draft: AccountDialogDraft
  updateDraft: (
    update: (previous: AccountDialogDraft) => AccountDialogDraft,
  ) => void
  updateAccessToken: (
    value: string,
    scope: { url: string; siteType: AccountSiteType },
  ) => void
  getCurrentTab: (
    baseUrl: string,
  ) => ResolveAccountBrowserSessionOptions["currentTab"]
}) {
  const { t } = useTranslation(["accountDialog", "settings", "messages"])
  const [isImportingSub2apiSession, setIsImporting] = useState(false)
  const generation = useRef(0)
  const preferenceChanged = useRef(false)
  const invalidate = useCallback(() => {
    generation.current += 1
    setIsImporting(false)
  }, [])
  // The reader has no abort interface. Reject its results after any context change,
  // including close/reopen and a newer import; old finally blocks never clear a new loading state.
  useLayoutEffect(invalidate, [
    invalidate,
    isOpen,
    mode,
    accountId,
    url,
    draft.siteType,
    draft.authType,
    draft.accessToken,
    draft.userId,
    draft.sub2apiUseRefreshToken,
    draft.sub2apiRefreshToken,
    draft.sub2apiTokenExpiresAt,
  ])
  useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )

  const reset = useCallback(() => {
    invalidate()
    preferenceChanged.current = false
  }, [invalidate])
  const setSub2apiUseRefreshToken = useCallback(
    (value: boolean) => {
      invalidate()
      updateDraft((previous) => ({
        ...previous,
        sub2apiUseRefreshToken: value,
      }))
    },
    [invalidate, updateDraft],
  )
  const setSub2apiRefreshToken = useCallback(
    (value: string) => {
      invalidate()
      updateDraft((previous) => ({ ...previous, sub2apiRefreshToken: value }))
    },
    [invalidate, updateDraft],
  )
  const setSub2apiTokenExpiresAt = useCallback(
    (value: number | null) => {
      invalidate()
      updateDraft((previous) => ({ ...previous, sub2apiTokenExpiresAt: value }))
    },
    [invalidate, updateDraft],
  )
  const handleSub2apiUseRefreshTokenChange = useCallback(
    (enabled: boolean) => {
      preferenceChanged.current = true
      invalidate()
      updateDraft((previous) => ({
        ...previous,
        sub2apiUseRefreshToken: enabled,
        ...(!enabled
          ? { sub2apiRefreshToken: "", sub2apiTokenExpiresAt: null }
          : {}),
      }))
    },
    [invalidate, updateDraft],
  )

  const handleImportSub2apiSession = async () => {
    const analytics = startAccountDialogAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.ImportSub2apiSession,
    )
    const baseUrl = url.trim()
    if (!baseUrl) {
      analytics.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      })
      toast.error(t("messages.urlRequired"))
      return
    }
    if (
      !isOpen ||
      !getAccountDialogSitePolicy(draft.siteType).allowSub2ApiRefreshTokenState
    ) {
      analytics.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
      return
    }
    const run = ++generation.current
    const isCurrent = () => generation.current === run
    const tempWindowRequestSource = getCurrentTempWindowRequestSource()
    setIsImporting(true)
    try {
      const currentTab = getCurrentTab(baseUrl)
      let importError: unknown
      const imported = await withProtectionBypassUserCommand(
        mode === DIALOG_MODES.ADD
          ? PROTECTION_BYPASS_USER_COMMANDS.AddAccount
          : PROTECTION_BYPASS_USER_COMMANDS.ReauthenticateAccount,
        tempWindowRequestSource,
        (protectionBypassExecution) =>
          resolveAccountBrowserSession({
            baseUrl,
            siteType: draft.siteType,
            ...(currentTab ? { currentTab } : {}),
            useExistingTabs: true,
            useTempWindow: true,
            tempWindowRequestSource,
            protectionBypassExecution,
            requestIdPrefix: "account-dialog-sub2api-import",
            isUsableSession: (session) =>
              Boolean(normalizeSub2ApiAuth(session?.sub2apiAuth)),
            onError: (error, context) => {
              if (
                context.source === ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
              )
                importError ??= error
            },
          }),
      )
      if (!isCurrent()) {
        analytics.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        return
      }
      const auth = normalizeSub2ApiAuth(imported?.sub2apiAuth)
      if (!auth) {
        if (importError) throw importError
        analytics.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
        toast.error(t("messages.importSub2apiSessionMissing"))
        return
      }
      const accessToken =
        typeof imported?.accessToken === "string"
          ? imported.accessToken.trim()
          : ""
      const userId = normalizeAccountIdentity(imported?.userId) ?? ""
      const username =
        typeof imported?.user?.username === "string"
          ? imported.user.username.trim()
          : ""
      if (accessToken)
        updateAccessToken(accessToken, {
          url: baseUrl,
          siteType: draft.siteType,
        })
      updateDraft((previous) => ({
        ...previous,
        sub2apiRefreshToken: auth.refreshToken,
        sub2apiTokenExpiresAt: auth.tokenExpiresAt ?? null,
        ...(userId ? { userId } : {}),
        ...(username ? { username } : {}),
      }))
      toast.success(t("messages.importSub2apiSessionSuccess"))
      analytics.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      if (!isCurrent()) {
        analytics.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        return
      }
      toast.error(
        t("messages.operationFailed", { error: getErrorMessage(error) }),
      )
      analytics.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        diagnostics: { failure: buildActionFailureDiagnostics({ error }) },
      })
    } finally {
      if (isCurrent()) setIsImporting(false)
    }
  }
  const policy = getAccountDialogSitePolicy(draft.siteType)
  return {
    isImportingSub2apiSession,
    isValid:
      !policy.allowSub2ApiRefreshTokenState ||
      !draft.sub2apiUseRefreshToken ||
      Boolean(draft.sub2apiRefreshToken.trim()),
    auth: buildSub2ApiAuthFromAccountDialogDraft({ draft, policy }),
    hasUserChangedRefreshMode: () => preferenceChanged.current,
    invalidate,
    reset,
    setSub2apiUseRefreshToken,
    setSub2apiRefreshToken,
    setSub2apiTokenExpiresAt,
    handleSub2apiUseRefreshTokenChange,
    handleImportSub2apiSession,
  }
}
