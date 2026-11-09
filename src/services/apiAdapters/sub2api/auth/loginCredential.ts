import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  readAccountBrowserSessionFromTab,
} from "~/services/accountBrowserSession"
import type {
  AccountLoginCapability,
  AccountLoginCredential,
} from "~/services/apiAdapters/contracts/accountLogin"
import { fetchSub2ApiAuthIdentity } from "~/services/apiService/sub2api/auth/authIdentity"
import { STORAGE_LOCKS } from "~/services/core/storageKeys"
import { AuthTypeEnum } from "~/types"

/** Native bearer verification shares the same lock as single-use token rotation. */
export const sub2ApiLoginCredentialRecovery: NonNullable<
  AccountLoginCapability["credentialRecovery"]
> = {
  lock: STORAGE_LOCKS.SUB2API_SESSION_AUTH,
  async verify(result, target) {
    if (result.status !== BROWSER_LOGIN_STATUS.Authenticated) return result
    if (result.identity !== String(target.account_info.id))
      return { status: BROWSER_LOGIN_STATUS.IdentityMismatch }
    if (!result.credential?.accessToken?.trim())
      return { status: BROWSER_LOGIN_STATUS.Failed }
    const credential = result.credential
    target.abortSignal?.throwIfAborted()
    try {
      const verified = await fetchSub2ApiAuthIdentity({
        baseUrl: target.site_url,
        siteType: target.site_type,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: credential.accessToken,
        },
        forceTempWindow: true,
        abortSignal: target.abortSignal,
        protectionBypassExecution: target.protectionBypassExecution,
        tempWindowRequestSource: target.tempWindowRequestSource,
      })
      target.abortSignal?.throwIfAborted()
      if (String(verified.identity.userId) !== String(target.account_info.id))
        return { status: BROWSER_LOGIN_STATUS.IdentityMismatch }
      return { ...result, credential }
    } catch {
      target.abortSignal?.throwIfAborted()
      return { status: BROWSER_LOGIN_STATUS.Uncertain }
    }
  },
}

/** Read the verified login tab before its isolated context is released. */
export async function captureSub2ApiLoginCredential(
  tabId: number,
  origin: string,
): Promise<AccountLoginCredential | null> {
  const session = await readAccountBrowserSessionFromTab({
    tabId,
    baseUrl: origin,
    expectedOrigin: origin,
    siteType: SITE_TYPES.SUB2API,
    source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
  })
  return session?.accessToken
    ? {
        accessToken: session.accessToken,
        ...(session.sub2apiAuth ? { sub2apiAuth: session.sub2apiAuth } : {}),
      }
    : null
}
