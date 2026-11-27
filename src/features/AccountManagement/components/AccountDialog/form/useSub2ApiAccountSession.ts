import type { TFunction } from "i18next"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
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
import { verifyRecoveredCredential } from "~/services/accountCredentialRecovery/result"
import { loginAccount } from "~/services/accountLogin"
import { getAccountLoginMethods } from "~/services/accountLogin/capabilities"
import { isAccountLoginConfigured } from "~/services/accountLogin/configCodec"
import {
  discardAccountLoginCredential,
  getIssuedAccountLoginCredential,
} from "~/services/accountLogin/credentialCleanup"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import type {
  AccountLoginCredential,
  AccountLoginResult,
} from "~/services/apiAdapters/contracts/accountLogin"
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
import { isHttpUrl } from "~/utils/core/urlParsing"

import {
  UNOWNED_DRAFT_CREDENTIAL_LEASE,
  useDraftCredentialOwnership,
  type DraftCredentialPersistenceLease,
} from "./useDraftCredentialOwnership"
import { useSub2ApiWebsiteSessionBinding } from "./useSub2ApiWebsiteSessionBinding"

const SUB2API_SESSION_OPERATIONS = {
  WebsiteImport: "website_import",
  ConfiguredLogin: "configured_login",
} as const

type Sub2ApiSessionOperation =
  (typeof SUB2API_SESSION_OPERATIONS)[keyof typeof SUB2API_SESSION_OPERATIONS]

/** Gives each configured-login outcome a fallback when the adapter supplies no message. */
function acquisitionFailureMessage(
  t: TFunction<"accountDialog">,
  result: AccountLoginResult,
): string | undefined {
  if (result.status === BROWSER_LOGIN_STATUS.Cancelled) return undefined
  if (result.status === BROWSER_LOGIN_STATUS.IdentityMismatch)
    return t("messages.sub2apiLoginIdentityMismatch")
  if (result.status === BROWSER_LOGIN_STATUS.SessionBusy)
    return t("messages.sub2apiLoginSessionBusy")
  if ("message" in result && result.message) return result.message
  switch (result.status) {
    case BROWSER_LOGIN_STATUS.Failed:
      return t("messages.sub2apiLoginFailed")
    case BROWSER_LOGIN_STATUS.InteractionRequired:
      return t("messages.sub2apiLoginInteractionRequired")
    case BROWSER_LOGIN_STATUS.Uncertain:
      return t("messages.sub2apiLoginUncertain")
    case BROWSER_LOGIN_STATUS.Unsupported:
      return t("messages.sub2apiLoginUnsupported")
    case BROWSER_LOGIN_STATUS.Authenticated:
      return t("messages.sub2apiLoginSessionNotIssued")
  }
}

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
  const [pendingOperation, setPendingOperation] =
    useState<Sub2ApiSessionOperation>()
  const isImportingSub2apiSession = pendingOperation !== undefined
  const isAcquiringSub2apiSession =
    pendingOperation === SUB2API_SESSION_OPERATIONS.ConfiguredLogin
  const loginController = useRef<AbortController | null>(null)
  const issuedDraft = useRef<{
    scopeKey: string
    snapshotKey: string
    accessToken: string
    refreshToken: string
    tokenExpiresAt: number | null
    previousAccessToken: string
  } | null>(null)
  const credentialScopeKey = (snapshot: {
    baseUrl: string
    userId: string
    siteType: AccountSiteType
  }) =>
    JSON.stringify([
      mode,
      accountId,
      snapshot.baseUrl,
      snapshot.siteType,
      snapshot.userId,
    ])
  const snapshotKey = (
    scope: string,
    accessToken: string,
    refreshToken?: string,
  ) => JSON.stringify([scope, accessToken, refreshToken ?? ""])
  const scopeKey = credentialScopeKey({
    baseUrl: url.trim(),
    userId: draft.userId.trim(),
    siteType: draft.siteType,
  })
  const policy = getAccountDialogSitePolicy(draft.siteType)
  const websiteSessionBinding = useSub2ApiWebsiteSessionBinding({
    isOpen,
    url,
    siteSupportsRefreshToken: policy.allowSub2ApiRefreshTokenState,
    usesRefreshToken: draft.sub2apiUseRefreshToken,
    isAcquiring: isAcquiringSub2apiSession,
  })
  const { rememberBoundSessionUrl, clearBoundSessionUrl } =
    websiteSessionBinding
  const auth = buildSub2ApiAuthFromAccountDialogDraft({ draft, policy })
  const currentSnapshotKey = snapshotKey(
    scopeKey,
    draft.accessToken.trim(),
    auth?.refreshToken,
  )
  const ownership = useDraftCredentialOwnership({
    isOpen,
    snapshotKey: currentSnapshotKey,
    invalidSnapshot: () => new Error(t("messages.sub2apiLoginDraftChanged")),
    onCleanupError: () =>
      toast.error(t("messages:errors.api.browserLoginCleanupUnconfirmed")),
  })
  const discardDraftCredential = ownership.discard
  const beginPersistence = (
    snapshot: Parameters<typeof credentialScopeKey>[0] & {
      accessToken: string
      refreshToken?: string
    },
  ): DraftCredentialPersistenceLease => {
    if (
      !getAccountDialogSitePolicy(snapshot.siteType)
        .allowSub2ApiRefreshTokenState
    )
      return UNOWNED_DRAFT_CREDENTIAL_LEASE
    const key = snapshotKey(
      credentialScopeKey(snapshot),
      snapshot.accessToken,
      snapshot.refreshToken,
    )
    const lease = ownership.beginPersistence(key)
    const issued = issuedDraft.current
    return {
      settle(success: boolean) {
        if (
          success &&
          issued?.snapshotKey === key &&
          issuedDraft.current === issued
        )
          issuedDraft.current = null
        return lease.settle(success)
      },
    }
  }
  useLayoutEffect(() => {
    const issued = issuedDraft.current
    if (!issued || (isOpen && issued.snapshotKey === currentSnapshotKey)) return
    issuedDraft.current = null
    updateDraft((previous) => {
      const ownsBearer = previous.accessToken.trim() === issued.accessToken
      const ownsRefresh =
        previous.sub2apiRefreshToken.trim() === issued.refreshToken
      return {
        ...previous,
        ...(ownsBearer
          ? {
              accessToken:
                issued.scopeKey === scopeKey ? issued.previousAccessToken : "",
            }
          : {}),
        ...(ownsRefresh ? { sub2apiRefreshToken: "" } : {}),
        ...(ownsRefresh ? { sub2apiTokenExpiresAt: null } : {}),
      }
    })
    if (isOpen) toast.info(t("messages.sub2apiLoginDraftAbandoned"))
  }, [currentSnapshotKey, isOpen, scopeKey, t, updateDraft])
  const generation = useRef(0)
  const preferenceChanged = useRef(false)
  const invalidate = useCallback(() => {
    generation.current += 1
    loginController.current?.abort()
    loginController.current = null
    setPendingOperation(undefined)
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
    draft.login,
  ])
  useEffect(
    () => () => {
      generation.current += 1
      loginController.current?.abort()
    },
    [],
  )

  const reset = useCallback(() => {
    invalidate()
    clearBoundSessionUrl()
    preferenceChanged.current = false
    issuedDraft.current = null
  }, [clearBoundSessionUrl, invalidate])
  const setSub2apiUseRefreshToken = useCallback(
    (enabled: boolean) => {
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
  const setSub2apiRefreshToken = useCallback(
    (value: string) => {
      invalidate()
      updateDraft((previous) => ({
        ...previous,
        sub2apiRefreshToken: value,
        ...(value.trim() !== previous.sub2apiRefreshToken.trim()
          ? { sub2apiTokenExpiresAt: null }
          : {}),
      }))
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
      setSub2apiUseRefreshToken(enabled)
    },
    [setSub2apiUseRefreshToken],
  )

  const acquireSub2apiSession = async (operation: Sub2ApiSessionOperation) => {
    const analytics = startAccountDialogAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.ImportSub2apiSession,
    )
    const baseUrl = url.trim()
    if (!isHttpUrl(baseUrl)) {
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
    setPendingOperation(operation)
    let issuedCredential: AccountLoginCredential | undefined
    let accepted = false
    try {
      const target = {
        site_type: draft.siteType,
        site_url: baseUrl,
        authType: draft.authType,
        account_info: { id: draft.userId, access_token: draft.accessToken },
        login: draft.login,
      }
      if (operation === SUB2API_SESSION_OPERATIONS.ConfiguredLogin) {
        const login = draft.login
        if (
          !draft.userId.trim() ||
          !login ||
          !isAccountLoginConfigured(login, getAccountLoginMethods(target))
        ) {
          toast.error(t("messages.sub2apiLoginSetupRequired"))
          analytics.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
          return
        }
        const controller = new AbortController()
        loginController.current = controller
        const result = await withProtectionBypassUserCommand(
          PROTECTION_BYPASS_USER_COMMANDS.ReauthenticateAccount,
          tempWindowRequestSource,
          async (protectionBypassExecution) => {
            const loggedIn = await loginAccount({
              account: target,
              methodId: login.methodId,
              requestId: crypto.randomUUID(),
              captureCredential: true,
              attended: true,
              abortSignal: controller.signal,
            })
            issuedCredential = getIssuedAccountLoginCredential(loggedIn)
            if (!isCurrent()) return loggedIn
            return verifyRecoveredCredential(loggedIn, {
              ...target,
              abortSignal: controller.signal,
              protectionBypassExecution,
              tempWindowRequestSource,
            })
          },
        )
        if (!isCurrent()) {
          analytics.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
          return
        }
        const credential =
          result.status === BROWSER_LOGIN_STATUS.Authenticated
            ? result.credential
            : undefined
        const auth = normalizeSub2ApiAuth(credential?.sub2apiAuth)
        if (!credential?.accessToken?.trim() || !auth) {
          const message = acquisitionFailureMessage(t, result)
          if (message) toast.error(message)
          analytics.complete(
            result.status === BROWSER_LOGIN_STATUS.Cancelled
              ? PRODUCT_ANALYTICS_RESULTS.Cancelled
              : PRODUCT_ANALYTICS_RESULTS.Failure,
          )
          return
        }
        accepted = true
        // Capture the previous owner before adopting the verified replacement.
        const previousCleanup = discardDraftCredential()
        if (issuedCredential) {
          const ownedCredential = issuedCredential
          const previous = issuedDraft.current
          const accessToken = credential.accessToken.trim()
          const ownedSnapshotKey = snapshotKey(
            scopeKey,
            accessToken,
            auth.refreshToken,
          )
          issuedDraft.current = {
            scopeKey,
            snapshotKey: ownedSnapshotKey,
            accessToken,
            refreshToken: auth.refreshToken,
            tokenExpiresAt: auth.tokenExpiresAt ?? null,
            previousAccessToken:
              previous?.accessToken === draft.accessToken.trim()
                ? previous.previousAccessToken
                : draft.accessToken,
          }
          ownership.adopt(ownedSnapshotKey, () =>
            discardAccountLoginCredential(target, ownedCredential),
          )
        } else {
          issuedDraft.current = null
        }
        updateAccessToken(credential.accessToken, {
          url: baseUrl,
          siteType: draft.siteType,
        })
        updateDraft((previous) => ({
          ...previous,
          sub2apiUseRefreshToken: true,
          sub2apiRefreshToken: auth.refreshToken,
          sub2apiTokenExpiresAt: auth.tokenExpiresAt ?? null,
        }))
        toast.success(t("messages.sub2apiLoginSuccess"))
        analytics.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        await previousCleanup
        return
      }
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
              session.sub2apiWebsiteSessionBound === true ||
              Boolean(normalizeSub2ApiAuth(session.sub2apiAuth)),
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
      if (imported?.sub2apiWebsiteSessionBound === true)
        rememberBoundSessionUrl(baseUrl)
      const auth = normalizeSub2ApiAuth(imported?.sub2apiAuth)
      if (!auth) {
        if (!imported?.sub2apiWebsiteSessionBound && importError)
          throw importError
        analytics.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
        toast.error(
          imported?.sub2apiWebsiteSessionBound
            ? t("messages.importSub2apiSessionBound")
            : t("messages.importSub2apiSessionMissing"),
        )
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
      if (issuedCredential && !accepted) {
        try {
          await discardAccountLoginCredential(
            {
              site_url: baseUrl,
              site_type: draft.siteType,
              account_info: { id: draft.userId },
            },
            issuedCredential,
          )
        } catch {
          toast.error(t("messages:errors.api.browserLoginCleanupUnconfirmed"))
        }
      }
      if (isCurrent()) setPendingOperation(undefined)
    }
  }
  const handleImportSub2apiSession = () =>
    acquireSub2apiSession(SUB2API_SESSION_OPERATIONS.WebsiteImport)
  const handleAcquireSub2apiSession = () =>
    acquireSub2apiSession(SUB2API_SESSION_OPERATIONS.ConfiguredLogin)
  return {
    ...websiteSessionBinding,
    isImportingSub2apiSession,
    isAcquiringSub2apiSession,
    isValid:
      !policy.allowSub2ApiRefreshTokenState ||
      !draft.sub2apiUseRefreshToken ||
      Boolean(draft.sub2apiRefreshToken.trim()),
    auth,
    hasUserChangedRefreshMode: () => preferenceChanged.current,
    invalidate,
    reset,
    beginPersistence,
    setSub2apiUseRefreshToken,
    setSub2apiRefreshToken,
    setSub2apiTokenExpiresAt,
    handleSub2apiUseRefreshTokenChange,
    handleImportSub2apiSession,
    handleAcquireSub2apiSession,
  }
}
