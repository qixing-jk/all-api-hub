import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { isSameAccountSiteOrigin } from "~/services/accounts/utils/siteUrlNormalization"
import type { SiteAccount } from "~/types"

/**
 * Finds saved accounts for a canonical site-scoped user identity. Browser
 * sessions and add-account drafts already resolve provider-specific identity
 * fields, so neither display names nor the number of same-site accounts is
 * evidence of an identity match.
 */
export function findAccountsBySiteIdentity({
  accounts,
  siteUrl,
  userId,
}: {
  accounts: readonly SiteAccount[]
  siteUrl: string
  userId: unknown
}): SiteAccount[] {
  const identity = normalizeAccountIdentity(userId)
  if (identity === null) return []

  return accounts.filter(
    (account) =>
      normalizeAccountIdentity(account.account_info.id) === identity &&
      isSameAccountSiteOrigin(
        { url: account.site_url, siteType: account.site_type },
        { url: siteUrl },
      ),
  )
}
