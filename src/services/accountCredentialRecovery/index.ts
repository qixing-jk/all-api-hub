import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import { loginAccount } from "~/services/accountLogin"
import { getAccountLoginMethods } from "~/services/accountLogin/capabilities"
import {
  isAccountLoginConfigured,
  resolveAccountLogin,
} from "~/services/accountLogin/configCodec"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import type { AccountLoginCredential } from "~/services/apiAdapters/contracts/accountLogin"
import { getAccountLoginCapability } from "~/services/apiAdapters/registry"
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

import {
  applyRecoveredCredentialToAccount,
  applyRecoveredCredentialToRequest,
  savedCredential,
} from "./credential"
import { supportsAccountCredentialRecovery } from "./policy"
import {
  AccountCredentialRecoveryError,
  verifyRecoveredCredential,
} from "./result"

/** Checks that recovery still targets the saved, enabled account. */
function matchesRequest(
  account: SiteAccount,
  request: ApiServiceRequest,
): boolean {
  return (
    account.id === request.accountId &&
    account.site_type === request.siteType &&
    new URL(account.site_url).origin === new URL(request.baseUrl).origin &&
    String(account.account_info.id) === String(request.auth.userId) &&
    account.authType === request.auth.authType &&
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

/** Assign recovery order under the lock, before concurrent retries complete. */
function withCredential(
  request: ApiServiceRequest,
  credential: AccountLoginCredential,
) {
  return {
    generation: ++recoveryGeneration,
    request: applyRecoveredCredentialToRequest(request, credential),
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
      !request.accountId
    )
      throw error
    const target = {
      site_type: request.siteType,
      authType: request.auth.authType,
      site_url: request.baseUrl,
      account_info: { id: String(request.auth.userId ?? "") },
    }
    if (!supportsAccountCredentialRecovery(target)) throw error
    assertActive(request)
    const recovered = await runAbortableTask(
      () =>
        withExtensionStorageWriteLock(
          `${
            getAccountLoginCapability(target)?.credentialRecovery?.lock ??
            STORAGE_LOCKS.ACCOUNT_CREDENTIAL_RECOVERY
          }:${request.accountId}`,
          async () => {
            assertActive(request)
            const account = (await accountConfigStore.read()).accounts.find(
              (a) => a.id === request.accountId,
            )
            if (!account || !matchesRequest(account, request)) throw error
            const login = resolveAccountLogin(account)
            if (
              login?.automaticRecovery !== true ||
              !supportsAccountCredentialRecovery(account, login.methodId) ||
              !isAccountLoginConfigured(login, getAccountLoginMethods(account))
            )
              throw error
            const credential = savedCredential(account)
            const cookie = account.cookieAuth?.sessionCookie
            const rejectedCookie =
              request.cookieSession?.cookieHeader ??
              request.auth.cookie ??
              request.cookieAuthSessionCookie
            // Another operation already rotated the saved credential while we waited.
            if (
              account.authType === AuthTypeEnum.Cookie
                ? cookie?.trim() && cookie !== rejectedCookie
                : account.account_info.access_token?.trim() &&
                  account.account_info.access_token !== request.auth.accessToken
            )
              return withCredential(request, credential)
            const cancellation = composeAbortSignals([
              request.abortSignal,
              request.abortDeadline?.signal,
            ])
            try {
              const result = await verifyRecoveredCredential(
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
              const nextCredential = result.credential
              return await accountConfigStore.mutateAccount(
                account.id,
                (current) => {
                  assertActive(request)
                  if (
                    !matchesRequest(current, request) ||
                    JSON.stringify(savedCredential(current)) !==
                      JSON.stringify(credential) ||
                    JSON.stringify(resolveAccountLogin(current)) !==
                      JSON.stringify(login)
                  )
                    throw new ApiError(
                      "Account changed during login recovery",
                      undefined,
                      error.endpoint,
                      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
                    )
                  const nextAccount = applyRecoveredCredentialToAccount(
                    current,
                    nextCredential,
                    Date.now(),
                  )
                  return {
                    nextAccount,
                    changed: true,
                    result: withCredential(request, nextCredential),
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
    if (recovered.request.auth.authType === AuthTypeEnum.Cookie)
      notifyApiTransportObserver(
        request.observer,
        "onCookieRecovered",
        recovered.request.auth.cookie!,
        recovered.generation,
      )
    return result
  }
}
