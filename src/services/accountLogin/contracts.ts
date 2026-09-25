import type { AccountLoginProvider } from "~/constants/accountLogin"
import type { BrowserOAuthResult } from "~/services/browserOAuth/browserOAuth"
import type { SiteAccount } from "~/types"

/** Login needs a site and identity, independently of check-in or API credentials. */
export type AccountLoginTarget = Pick<SiteAccount, "site_url"> & {
  account_info: Pick<SiteAccount["account_info"], "id">
}

/** Optional effects observed during login; absence does not make login fail. */
export interface AccountLoginEvidence {
  checkedIn?: boolean
}

export interface AccountLoginRequest {
  account: AccountLoginTarget
  provider: AccountLoginProvider
  requestId: string
  /**
   * Whether a person is expected to complete the provider sign-in. Absent means
   * one is; a run triggered by an alarm passes `false`.
   */
  attended?: boolean
}

export type AccountLoginResult =
  | BrowserOAuthResult<AccountLoginEvidence>
  | {
      status: "unsupported"
    }

/** A fresh browser login verifies identity without exporting or saving credentials. */
export interface AccountLoginCapability {
  supports(account: AccountLoginTarget): boolean
  login(request: AccountLoginRequest): Promise<AccountLoginResult>
}
