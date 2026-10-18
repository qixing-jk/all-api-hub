import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import {
  normalizeAccountLogin,
  resolveAccountLogin,
} from "~/services/accountLogin/configCodec"
import { normalizePasswordCredentials } from "~/services/accountLogin/passwordCredentials"
import { createLoginProviderClaimGuard } from "~/services/accountLogin/providerClaims"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
} from "~/services/accounts/editing/accountDefaults"
import type { SiteAccount } from "~/types"

type Target = Pick<
  SiteAccount,
  "id" | "site_type" | "site_url" | "account_info"
>
export type AccountLoginConfiguration =
  import("~/types/accountLogin").AccountLoginConfiguration

/** Check identity inside the storage transaction before assigning any secrets. */
function matches(account: SiteAccount, target: Target): boolean {
  return (
    account.id === target.id &&
    account.site_type === target.site_type &&
    account.site_url === target.site_url &&
    String(account.account_info.id) === String(target.account_info.id)
  )
}

/** Internal configuration only: no caller is granted permission to log in by saving it. */
export const accountLoginConfiguration = {
  async read(target: Target): Promise<AccountLoginConfiguration | null> {
    const account = (await accountConfigStore.read()).accounts.find((item) =>
      matches(item, target),
    )
    return account ? resolveAccountLogin(account) ?? null : null
  },

  async configure(
    target: Target,
    value: AccountLoginConfiguration | null,
  ): Promise<void> {
    const credentials =
      value?.methodId === ACCOUNT_LOGIN_METHODS.Password
        ? normalizePasswordCredentials(value.credentials)
        : undefined
    if (
      value &&
      (value.methodId === ACCOUNT_LOGIN_METHODS.Password
        ? !credentials
        : !normalizeAccountLogin(value))
    )
      throw new Error("Invalid account login configuration")
    const guard = await createLoginProviderClaimGuard({
      siteUrl: target.site_url,
    })
    await accountConfigStore.mutateAccount(
      target.id,
      (account) => {
        if (!matches(account, target))
          throw new Error("Account login identity changed")
        const nextAccount = applySiteAccountUpdates({
          account,
          updates: { login: value ?? undefined },
          now: Date.now(),
          userTimestampMode: AccountUpdateUserTimestampMode.Touch,
        })
        return { nextAccount, result: undefined, changed: true }
      },
      { guard },
    )
  },
}
