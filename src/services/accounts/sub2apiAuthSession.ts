import { AccountUpdateUserTimestampMode } from "~/services/accounts/accountDefaults"
import { normalizeAccountSiteProfileUrlForOriginKey } from "~/services/accounts/accountSiteProfile"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { sub2ApiAuthPersistence } from "~/services/accounts/accountStorage/sub2ApiAuthPersistence"
import type {
  Sub2ApiAuthSession,
  Sub2ApiStoredAuthSnapshot,
} from "~/services/apiService/sub2api/authSession"
import type { SiteAccount } from "~/types"

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const normalizeTokenExpiresAt = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const buildStoredAuthSnapshot = (
  account: Pick<
    SiteAccount,
    "account_info" | "site_type" | "site_url" | "sub2apiAuth"
  >,
): Sub2ApiStoredAuthSnapshot => {
  const accessToken = normalizeString(account.account_info?.access_token)
  const siteUrl = normalizeString(account.site_url)
  const origin = siteUrl
    ? normalizeAccountSiteProfileUrlForOriginKey({
        siteType: account.site_type,
        url: siteUrl,
      })
    : undefined
  const userId = normalizeString(account.account_info?.id)
  const refreshToken = normalizeString(account.sub2apiAuth?.refreshToken)
  const tokenExpiresAt = normalizeTokenExpiresAt(
    account.sub2apiAuth?.tokenExpiresAt,
  )

  return {
    ...(accessToken ? { accessToken } : {}),
    ...(origin ? { origin } : {}),
    ...(userId ? { userId } : {}),
    ...(refreshToken
      ? {
          sub2apiAuth: {
            refreshToken,
            ...(typeof tokenExpiresAt === "number" ? { tokenExpiresAt } : {}),
          },
        }
      : {}),
  }
}

export const accountSub2ApiAuthSession: Sub2ApiAuthSession = {
  async getLatestAuth(accountId) {
    const account = await accountQueries.getAccountById(accountId)
    return account ? buildStoredAuthSnapshot(account) : null
  },
  async persistAuthUpdate(accountId, update) {
    return sub2ApiAuthPersistence.updateSub2ApiAuth(accountId, update, {
      userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
    })
  },
}
