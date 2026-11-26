import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import type { NewApiDashboardAuthBundle } from "~/services/apiService/newApi/dashboardAuth"
import {
  API_DIRECT_REQUEST_REASONS,
  API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
} from "~/services/apiTransport/type"
import {
  assertSiteTabOrigin,
  focusSiteTab,
  reloadSiteTabAndWait,
  resolveOrCreateSiteTab,
  SITE_TAB_REINJECT_RETRY_OPTIONS,
  waitForSiteTabReady,
} from "~/services/browsingContext/siteTabRecovery"
import { AuthTypeEnum } from "~/types"
import {
  isMessageReceiverUnavailableError,
  sendTabMessageWithRetry,
} from "~/utils/browser/runtimeMessages"
import { injectContentScript } from "~/utils/browser/scripting"

import { createNewApiTokenInteraction } from "./browser"
import { NewApiAccessTokenCreation } from "./creation"
import { createTokenIssuanceJournal } from "./issuanceJournal"
import { NEW_API_TOKEN_VERIFICATION_ERRORS as VERIFICATION_ERRORS } from "./protocol"
import {
  isTokenSessionContentErrorCode,
  NewApiTokenSessionError,
  NEW_API_TOKEN_SESSION_ERRORS as SESSION_ERRORS,
} from "./sessionError"

/** Focus the selected site tab so the user can sign in or switch accounts. */
export async function focusNewApiTokenTab(
  siteUrl: string,
  preferredTabId?: number,
) {
  await focusSiteTab(siteUrl, preferredTabId)
}

/** Refresh the affected tab and return its ID once the site has loaded. */
export async function reloadNewApiTokenTab(
  siteUrl: string,
  preferredTabId?: number,
) {
  return reloadSiteTabAndWait({
    siteUrl,
    preferredTabId,
    createIfMissing: true,
  })
}

/** Open a session-bound creator; only its independently checked PAT may enter the account form. */
export async function openNewApiAccessTokenCreation(
  siteUrl: string,
  userId: string,
  preferredTabId?: number,
) {
  if (!userId) throw new Error(VERIFICATION_ERRORS.INVALID_CONTEXT)
  const { tabId, origin, existing } = await resolveOrCreateSiteTab(
    siteUrl,
    preferredTabId,
  )
  if (existing) await assertSiteTabOrigin(tabId, origin)
  else await waitForSiteTabReady(tabId, origin)
  let injected = false
  try {
    // Probe a read-only action before considering reinjection; preserve the
    // existing document's verified session and avoid duplicate listeners.
    await sendTabMessageWithRetry(
      tabId,
      {
        action: RuntimeActionIds.ContentNewApiDashboardSessionAuth,
        expectedOrigin: origin,
      },
      { maxAttempts: 1, frameId: 0 },
    )
  } catch (error) {
    if (!isMessageReceiverUnavailableError(error)) throw error
    injected = await injectContentScript(tabId, origin)
    if (!injected)
      throw new NewApiTokenSessionError(SESSION_ERRORS.RELOAD_REQUIRED, tabId)
  }
  let response:
    | { success: boolean; data?: NewApiDashboardAuthBundle; code?: unknown }
    | undefined
  try {
    response = await sendTabMessageWithRetry(
      tabId,
      {
        action: RuntimeActionIds.ContentPrepareNewApiTokenSession,
        expectedOrigin: origin,
        expectedIdentity: userId,
      },
      {
        ...(injected ? SITE_TAB_REINJECT_RETRY_OPTIONS : { maxAttempts: 1 }),
        frameId: 0,
      },
    )
  } catch (error) {
    if (isMessageReceiverUnavailableError(error))
      throw new NewApiTokenSessionError(SESSION_ERRORS.RELOAD_REQUIRED, tabId)
    throw error
  }
  if (!response?.success)
    throw new NewApiTokenSessionError(
      isTokenSessionContentErrorCode(response?.code)
        ? response.code
        : SESSION_ERRORS.UNAVAILABLE,
      tabId,
    )
  const session = response.data
  if (
    !session?.token ||
    !session.sessionId ||
    !Number.isFinite(session.expiresAt) ||
    session.expiresAt <= Date.now() / 1000 ||
    session.user?.id == null
  )
    throw new NewApiTokenSessionError(SESSION_ERRORS.UNAVAILABLE, tabId)
  if (String(session.user.id) !== userId)
    throw new NewApiTokenSessionError(SESSION_ERRORS.IDENTITY_MISMATCH, tabId)
  const abort = new AbortController()
  const flow = new NewApiAccessTokenCreation(
    {
      baseUrl: origin,
      siteType: SITE_TYPES.NEW_API,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId,
        accessToken: session.token,
      },
      requestHeaders: { "X-Auth-Session": session.sessionId },
      fetchContext: {
        kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId,
        origin,
      },
      currentTabFallback: API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid,
      directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
      allowAccountCredentialRecovery: false,
      abortSignal: abort.signal,
    },
    userId,
    createNewApiTokenInteraction(tabId, origin),
    createTokenIssuanceJournal(origin, userId),
  )
  return { flow, cancel: () => abort.abort() }
}
