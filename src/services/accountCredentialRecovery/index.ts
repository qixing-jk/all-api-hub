import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import { loginAccount } from "~/services/accountLogin"
import { getAccountLoginMethods } from "~/services/accountLogin/capabilities"
import {
  isAccountLoginConfigured,
  resolveAccountLogin,
} from "~/services/accountLogin/configCodec"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
} from "~/services/accounts/editing/accountDefaults"
import {
  composeAbortSignals,
  runAbortableTask,
} from "~/services/apiTransport/abortableTask"
import {
  API_ERROR_CODES,
  ApiError,
  isAuthenticationRequiredError,
} from "~/services/apiTransport/errors"
import { notifyApiTransportObserver } from "~/services/apiTransport/requestExecution"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { AuthTypeEnum, type SiteAccount } from "~/types"
import { safeRandomUUID } from "~/utils/core/identifier"

import { supportsAccountCookieRecovery } from "./policy"
import { AccountCredentialRecoveryError, verifyRecoveredCookie } from "./result"

/** Checks that recovery still targets the saved, enabled Cookie account. */
function matchesRequest(
  account: SiteAccount,
  request: ApiServiceRequest,
): boolean {
  return (
    account.id === request.accountId &&
    account.site_type === request.siteType &&
    new URL(account.site_url).origin === new URL(request.baseUrl).origin &&
    String(account.account_info.id) === String(request.auth.userId) &&
    account.authType === AuthTypeEnum.Cookie &&
    account.disabled !== true
  )
}

/** Rejects cancelled operations and expired account-operation deadlines. */
function assertActive(request: ApiServiceRequest): void {
  request.abortSignal?.throwIfAborted()
  request.abortDeadline?.signal.throwIfAborted()
}

// Assigned under the account recovery lock, before concurrent retries complete.
// This process-local order is used only by in-memory request observers.
let recoveryGeneration = 0

/** Replaces retry credentials and records their recovery order. */
function withCookie(
  request: ApiServiceRequest,
  cookie: string,
): { request: ApiServiceRequest; generation: number } {
  return {
    generation: ++recoveryGeneration,
    request: {
      ...request,
      auth: { ...request.auth, cookie },
      cookieAuthSessionCookie: cookie,
      ...(request.cookieSession
        ? { cookieSession: { ...request.cookieSession, cookieHeader: cookie } }
        : {}),
    },
  }
}

/** Executes an admitted read operation with bounded account credential recovery. */
export async function executeWithAccountCredentialRecovery<T>(
  request: ApiServiceRequest,
  runner: (request: ApiServiceRequest) => Promise<T>,
): Promise<T> {
  try {
    return await runner(request)
  } catch (error) {
    if (
      !isAuthenticationRequiredError(error) ||
      request.allowAccountCredentialRecovery !== true ||
      !request.accountId ||
      !supportsAccountCookieRecovery({
        site_type: request.siteType,
        authType: request.auth.authType,
        site_url: request.baseUrl,
        account_info: { id: String(request.auth.userId ?? "") },
      })
    )
      throw error
    assertActive(request)
    const recovered = await runAbortableTask(
      () =>
        withExtensionStorageWriteLock(
          `${STORAGE_LOCKS.ACCOUNT_CREDENTIAL_RECOVERY}:${request.accountId}`,
          async () => {
            assertActive(request)
            const account = (await accountConfigStore.read()).accounts.find(
              (a) => a.id === request.accountId,
            )
            if (!account || !matchesRequest(account, request)) throw error
            const login = resolveAccountLogin(account)
            if (
              login?.automaticRecovery !== true ||
              !supportsAccountCookieRecovery(account, login.methodId) ||
              !isAccountLoginConfigured(login, getAccountLoginMethods(account))
            )
              throw error
            const cookie = account.cookieAuth?.sessionCookie
            const rejectedCookie =
              request.cookieSession?.cookieHeader ??
              request.auth.cookie ??
              request.cookieAuthSessionCookie
            // Another operation already rotated the saved credential while we waited.
            if (cookie?.trim() && cookie !== rejectedCookie)
              return withCookie(request, cookie)
            const cancellation = composeAbortSignals([
              request.abortSignal,
              request.abortDeadline?.signal,
            ])
            try {
              const result = await verifyRecoveredCookie(
                await loginAccount({
                  account: { ...account, login },
                  methodId: login.methodId,
                  requestId: safeRandomUUID("account-credential-recovery"),
                  attended: false,
                  captureCredential: true,
                  abortSignal: cancellation.signal,
                }),
                {
                  ...account,
                  abortSignal: cancellation.signal,
                  protectionBypassExecution: request.protectionBypassExecution,
                  tempWindowRequestSource: request.tempWindowRequestSource,
                  fetchContext: request.fetchContext,
                },
              )
              assertActive(request)
              if (result.status !== BROWSER_LOGIN_STATUS.Authenticated)
                throw new AccountCredentialRecoveryError(result, error)
              const nextCookie = result.credential.cookie
              return await accountConfigStore.mutateAccount(
                account.id,
                (current) => {
                  assertActive(request)
                  if (
                    !matchesRequest(current, request) ||
                    current.cookieAuth?.sessionCookie !== cookie ||
                    JSON.stringify(resolveAccountLogin(current)) !==
                      JSON.stringify(login)
                  )
                    throw new ApiError(
                      "Account changed during login recovery",
                      undefined,
                      error.endpoint,
                      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
                    )
                  const nextAccount = applySiteAccountUpdates({
                    account: current,
                    updates: { cookieAuth: { sessionCookie: nextCookie } },
                    now: Date.now(),
                    userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
                  })
                  return {
                    nextAccount,
                    changed: true,
                    result: withCookie(request, nextCookie),
                  }
                },
              )
            } finally {
              cancellation.dispose()
            }
          },
        ),
      { signals: [request.abortSignal, request.abortDeadline?.signal] },
    )
    assertActive(request)
    // Exactly one retry: a second rejection never starts another login.
    const result = await runner(recovered.request)
    notifyApiTransportObserver(
      request.observer,
      "onCookieRecovered",
      recovered.request.auth.cookie!,
      recovered.generation,
    )
    return result
  }
}
