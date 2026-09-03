import { SITE_TYPES } from "~/constants/siteType"
import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
  type AccountUpdateOptions,
} from "~/services/accounts/accountDefaults"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { normalizeAccountSiteProfileUrlForOriginKey } from "~/services/accounts/accountSiteProfile"
import {
  SUB2API_AUTH_PERSISTENCE_STATUSES,
  type Sub2ApiAuthPersistenceResult,
  type Sub2ApiPersistAuthUpdate,
} from "~/services/apiService/sub2api/authSession"
import type { SiteAccount } from "~/types"
import type { DeepPartial } from "~/types/utils"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { accountConfigStore } from "./accountConfigStore"

const logger = createLogger("Sub2ApiAuthPersistence")

class Sub2ApiAuthPersistence {
  async updateSub2ApiAuth(
    id: string,
    update: Sub2ApiPersistAuthUpdate,
    options: AccountUpdateOptions = {
      userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
    },
  ): Promise<Sub2ApiAuthPersistenceResult> {
    try {
      const expectedOrigin = normalizeAccountSiteProfileUrlForOriginKey({
        siteType: SITE_TYPES.SUB2API,
        url: update.expectedOrigin,
      })
      const expectedUserId = normalizeAccountIdentity(update.expectedUserId)
      const updateUserId = normalizeAccountIdentity(update.userId)

      return await accountConfigStore.mutate<Sub2ApiAuthPersistenceResult>(
        (config) => {
          const index = config.accounts.findIndex((item) => item.id === id)
          if (index === -1) {
            return {
              result: {
                status: SUB2API_AUTH_PERSISTENCE_STATUSES.ACCOUNT_MISSING,
              },
              changed: false,
            }
          }
          const account = config.accounts[index]

          const actualOrigin = normalizeAccountSiteProfileUrlForOriginKey({
            siteType: account.site_type,
            url: account.site_url,
          })
          const actualUserId = normalizeAccountIdentity(account.account_info.id)
          if (
            account.site_type !== SITE_TYPES.SUB2API ||
            !expectedUserId ||
            !actualUserId ||
            actualOrigin !== expectedOrigin ||
            actualUserId !== expectedUserId ||
            (update.userId !== undefined && updateUserId !== expectedUserId)
          ) {
            return {
              result: {
                status: SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH,
              },
              changed: false,
            }
          }

          const authUpdates: DeepPartial<SiteAccount> = {
            account_info: {
              access_token: update.accessToken,
              ...(updateUserId ? { id: updateUserId } : {}),
            },
          }
          const refreshToken = update.refreshToken?.trim()
          if (refreshToken) {
            authUpdates.sub2apiAuth = {
              refreshToken,
              ...(typeof update.tokenExpiresAt === "number" &&
              Number.isFinite(update.tokenExpiresAt)
                ? { tokenExpiresAt: update.tokenExpiresAt }
                : {}),
            }
          }
          config.accounts[index] = applySiteAccountUpdates({
            account,
            updates: authUpdates,
            now: Date.now(),
            userTimestampMode: options.userTimestampMode,
          })
          return {
            result: { status: SUB2API_AUTH_PERSISTENCE_STATUSES.PERSISTED },
            changed: true,
          }
        },
      )
    } catch (error) {
      logger.error("Failed to persist Sub2API credentials", {
        accountId: id,
        error: getErrorMessage(error),
      })
      return { status: SUB2API_AUTH_PERSISTENCE_STATUSES.WRITE_FAILED }
    }
  }
}

export const sub2ApiAuthPersistence = new Sub2ApiAuthPersistence()
