import type { AccountLoginTarget } from "~/services/apiAdapters/contracts/accountLogin"
import { getAccountLoginCapability } from "~/services/apiAdapters/registry"

/** Resolves implemented login methods using the actual deployment adapter. */
export function getAccountLoginMethods(account: AccountLoginTarget) {
  return getAccountLoginCapability(account)?.methods ?? []
}
