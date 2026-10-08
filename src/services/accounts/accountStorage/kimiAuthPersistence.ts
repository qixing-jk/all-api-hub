import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
} from "~/services/accounts/editing/accountDefaults"
import { resolveKimiOpenPlatformDeployment } from "~/services/kimiOpenPlatform/deployments"
import type { KimiOpenPlatformAuthConfig, SiteAccount } from "~/types"

import { accountConfigStore } from "./accountConfigStore"

/** Save a complete rotation only while the account still owns the session read. */
export async function persistKimiOpenPlatformAuth(
  snapshot: SiteAccount,
  accessToken: string,
  auth: KimiOpenPlatformAuthConfig,
): Promise<void> {
  const saved = await accountConfigStore.mutateAccount(
    snapshot.id,
    (account) => {
      if (
        account.site_type !== snapshot.site_type ||
        resolveKimiOpenPlatformDeployment(account.site_url)?.siteType !==
          snapshot.site_type ||
        resolveKimiOpenPlatformDeployment(snapshot.site_url)?.siteType !==
          snapshot.site_type ||
        account.account_info.id !== snapshot.account_info.id ||
        account.account_info.access_token !==
          snapshot.account_info.access_token ||
        account.kimiOpenPlatformAuth?.refreshToken !==
          snapshot.kimiOpenPlatformAuth?.refreshToken ||
        account.kimiOpenPlatformAuth?.organizationId !==
          snapshot.kimiOpenPlatformAuth?.organizationId
      ) {
        throw new Error("kimi_auth_identity_mismatch")
      }
      const nextAccount = applySiteAccountUpdates({
        account,
        updates: { account_info: { access_token: accessToken } },
        now: Date.now(),
        userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
      })
      // Replace the pair together; an expiry from the previous token is obsolete.
      nextAccount.kimiOpenPlatformAuth = { ...auth }
      return { nextAccount, changed: true, result: true }
    },
  )
  if (!saved) throw new Error("kimi_auth_state_write_failed")
}
