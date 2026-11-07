import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import { isAccountSiteType } from "~/constants/siteType"
import { loginAccount } from "~/services/accountLogin"
import { getAccountLoginMethods } from "~/services/accountLogin/capabilities"
import {
  isAccountLoginConfigured,
  normalizeAccountLogin,
} from "~/services/accountLogin/configCodec"
import type { AccountLoginTarget } from "~/services/apiAdapters/contracts/accountLogin"
import { isProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { AuthTypeEnum } from "~/types"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { resolveAuthTypeEnum } from "~/utils/core/authType"
import { isRecord } from "~/utils/core/object"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

import { supportsAccountCookieRecovery } from "./policy"
import {
  verifyRecoveredCookie,
  type AccountCookieRecoveryResult,
} from "./result"

/** Manual editor recovery returns a credential for the caller-owned draft. */
async function recoverCookie(
  request: unknown,
  abortSignal: AbortSignal,
): Promise<AccountCookieRecoveryResult> {
  if (
    !isRecord(request) ||
    typeof request.requestId !== "string" ||
    !request.requestId.trim() ||
    !isRecord(request.account)
  )
    return { status: BROWSER_LOGIN_STATUS.Unsupported }
  const input = request.account
  const authType = resolveAuthTypeEnum(input.authType)
  if (input.authType !== undefined && authType === undefined)
    return { status: BROWSER_LOGIN_STATUS.Unsupported }
  if (
    !isAccountSiteType(input.site_type) ||
    typeof input.site_url !== "string" ||
    !isRecord(input.account_info)
  )
    return { status: BROWSER_LOGIN_STATUS.Unsupported }
  const login = normalizeAccountLogin(input.login)
  const url = tryParseHttpUrl(input.site_url)
  if (!url || url.username || url.password)
    return { status: BROWSER_LOGIN_STATUS.Unsupported }
  const identity = input.account_info.id
  if (
    !login ||
    (typeof identity !== "string" && typeof identity !== "number") ||
    (typeof identity === "number" && !Number.isFinite(identity)) ||
    !String(identity).trim()
  )
    return { status: BROWSER_LOGIN_STATUS.Failed }
  const account: AccountLoginTarget & { authType?: AuthTypeEnum } = {
    authType,
    site_type: input.site_type,
    site_url: input.site_url,
    account_info: { id: String(identity).trim() },
    login,
  }
  if (!supportsAccountCookieRecovery(account, login.methodId))
    return { status: BROWSER_LOGIN_STATUS.Unsupported }
  if (!isAccountLoginConfigured(login, getAccountLoginMethods(account)))
    return { status: BROWSER_LOGIN_STATUS.Failed }
  const result = await loginAccount({
    account,
    methodId: login.methodId,
    requestId: request.requestId,
    attended: true,
    captureCredential: true,
    abortSignal,
  })
  return verifyRecoveredCookie(result, {
    ...account,
    abortSignal,
    tempWindowRequestSource: normalizeTempWindowRequestSource(
      request.tempWindowRequestSource,
    ),
    protectionBypassExecution: isProtectionBypassExecution(
      request.protectionBypassExecution,
    )
      ? request.protectionBypassExecution
      : undefined,
  })
}

const activeRecoveries = new Map<string, AbortController>()

/** Cancels only the editor attempt identified by its unguessable request ID. */
export function cancelAccountCookieRecovery(requestId: unknown): boolean {
  if (typeof requestId !== "string") return false
  const controller = activeRecoveries.get(requestId)
  controller?.abort()
  return Boolean(controller)
}

/** Owns one editor recovery until login, verification and cleanup finish. */
export async function recoverAccountCookieForDialog(
  request: unknown,
): Promise<AccountCookieRecoveryResult> {
  if (
    !isRecord(request) ||
    typeof request.requestId !== "string" ||
    !request.requestId.trim()
  )
    return { status: BROWSER_LOGIN_STATUS.Unsupported }
  const requestId = request.requestId
  if (activeRecoveries.has(requestId))
    return { status: BROWSER_LOGIN_STATUS.SessionBusy }
  const controller = new AbortController()
  activeRecoveries.set(requestId, controller)
  try {
    const result = await recoverCookie(request, controller.signal)
    return controller.signal.aborted
      ? { status: BROWSER_LOGIN_STATUS.Cancelled }
      : result
  } catch (error) {
    if (controller.signal.aborted)
      return { status: BROWSER_LOGIN_STATUS.Cancelled }
    throw error
  } finally {
    activeRecoveries.delete(requestId)
  }
}
