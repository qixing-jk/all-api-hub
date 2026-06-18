import { AccountUpdateUserTimestampMode } from "~/services/accounts/accountDefaults"
import { accountStorage } from "~/services/accounts/accountStorage"
import type {
  Sub2ApiAuthSession,
  Sub2ApiPersistAuthUpdate,
  Sub2ApiStoredAuthSnapshot,
} from "~/services/apiService/sub2api/authSession"
import type { SiteAccount } from "~/types"
import type { DeepPartial } from "~/types/utils"

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const normalizeTokenExpiresAt = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const buildStoredAuthSnapshot = (
  account: Pick<SiteAccount, "account_info" | "sub2apiAuth">,
): Sub2ApiStoredAuthSnapshot => {
  const accessToken = normalizeString(account.account_info?.access_token)
  const userId = normalizeString(account.account_info?.id)
  const refreshToken = normalizeString(account.sub2apiAuth?.refreshToken)
  const tokenExpiresAt = normalizeTokenExpiresAt(
    account.sub2apiAuth?.tokenExpiresAt,
  )

  return {
    ...(accessToken ? { accessToken } : {}),
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

const buildPersistedAuthUpdate = (
  update: Sub2ApiPersistAuthUpdate,
): DeepPartial<SiteAccount> => {
  const refreshToken = normalizeString(update.refreshToken)
  const persisted: DeepPartial<SiteAccount> = {
    account_info: {
      access_token: update.accessToken,
    },
  }

  if (refreshToken) {
    persisted.sub2apiAuth = {
      refreshToken,
      ...(typeof update.tokenExpiresAt === "number" &&
      Number.isFinite(update.tokenExpiresAt)
        ? { tokenExpiresAt: update.tokenExpiresAt }
        : {}),
    }
  }

  return persisted
}

export const accountSub2ApiAuthSession: Sub2ApiAuthSession = {
  async getLatestAuth(accountId) {
    const account = await accountStorage.getAccountById(accountId)
    return account ? buildStoredAuthSnapshot(account) : null
  },
  async persistAuthUpdate(accountId, update) {
    return accountStorage.updateAccount(
      accountId,
      buildPersistedAuthUpdate(update),
      {
        userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
      },
    )
  },
}
