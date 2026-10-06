import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import type { TagIdsInput } from "~/services/accounts/accountPersistence/shared"
import {
  AuthTypeEnum,
  type CheckInConfig,
  type KimiOpenPlatformAuthConfig,
  type Sub2ApiAuthConfig,
} from "~/types"
import type { CheckInMethodSelection } from "~/types/checkIn"
import { extractSessionCookieHeader } from "~/utils/browser/cookieString"

/** Form data shared by account creation and editing. */
export interface AccountSaveInput {
  url: string
  siteName: string
  username: string
  accessToken: string
  userId: string
  exchangeRate: string
  notes: string
  tagIds: TagIdsInput
  checkInConfig: CheckInConfig
  siteType: string
  authType: AuthTypeEnum
  cookieAuthSessionCookie: string
  manualBalanceUsd?: string
  excludeFromTotalBalance?: boolean
  excludeFromTodayIncome?: boolean
  sub2apiAuth?: Sub2ApiAuthConfig
}

interface AccountSaveOptions {
  deferDataRefresh?: boolean
  kimiOpenPlatformAuth?: KimiOpenPlatformAuthConfig
}

export interface AccountCreateRequest extends AccountSaveInput {
  options?: AccountSaveOptions & { skipAutoProvisionKeyOnAccountAdd?: boolean }
}

export interface AccountUpdateRequest extends AccountSaveInput {
  accountId: string
  options?: AccountSaveOptions & {
    selectionChanged?: boolean
    discoveryBaseSelection?: CheckInMethodSelection
    loadedKimiAuth?: {
      accessToken: string
      refreshToken?: string
      organizationId?: string
    }
  }
}

/** Applies the same site, cookie, and optional flag defaults to both save paths. */
export function normalizeAccountSaveInput(input: AccountSaveInput) {
  return {
    ...input,
    excludeFromTotalBalance: input.excludeFromTotalBalance ?? false,
    excludeFromTodayIncome: input.excludeFromTodayIncome ?? false,
    normalizedSiteType: isAccountSiteType(input.siteType)
      ? input.siteType
      : SITE_TYPES.UNKNOWN,
    sessionCookieHeader:
      input.authType === AuthTypeEnum.Cookie
        ? extractSessionCookieHeader(input.cookieAuthSessionCookie)
        : "",
  }
}
