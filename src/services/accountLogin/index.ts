import type {
  AccountLoginMethod,
  AccountLoginRequest,
  AccountLoginResult,
  AccountLoginTarget,
} from "~/services/apiAdapters/contracts/accountLogin"

/** Lists this adapter's available methods without changing the site's login session. */
export async function discoverAccountLoginMethods(
  account: AccountLoginTarget,
): Promise<AccountLoginMethod[]> {
  const { getAccountLoginCapability } = await import(
    "~/services/apiAdapters/registry"
  )
  const capability = getAccountLoginCapability(account)
  return capability ? capability.discover(account) : []
}

/** Starts a fresh account login. Callers own interpretation of optional side effects. */
export async function loginAccount(
  request: AccountLoginRequest,
): Promise<AccountLoginResult> {
  const { getAccountLoginCapability } = await import(
    "~/services/apiAdapters/registry"
  )
  const capability = getAccountLoginCapability(request.account)
  return capability ? capability.login(request) : { status: "unsupported" }
}
