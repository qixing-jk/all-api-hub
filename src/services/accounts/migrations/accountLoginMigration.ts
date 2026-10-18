import { resolveAccountLogin } from "~/services/accountLogin/configCodec"
import type { SiteAccount } from "~/types"

/** Move operation-independent login settings without changing timestamps or execution policy. */
export function migrateAccountLogin(account: SiteAccount): SiteAccount {
  const next = {
    ...account,
    login: resolveAccountLogin(account),
    checkIn: { ...account.checkIn },
  }
  delete next.passwordAuth
  delete next.checkIn.loginCheckIn
  return next
}
