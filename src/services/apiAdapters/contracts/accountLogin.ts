import type { AccountLoginMethodId } from "~/constants/accountLogin"
import type { BrowserLoginSessionMode } from "~/constants/browserLogin"
import { type BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import type { SiteAccount } from "~/types"

/** Adapters select their identity fields; login does not require saved API credentials. */
export type AccountLoginTarget = Pick<SiteAccount, "site_url"> &
  Partial<Pick<SiteAccount, "site_type" | "login">> & {
    account_info: Partial<Pick<SiteAccount["account_info"], "id" | "username">>
  }

/** Optional effects observed during login; absence does not make login fail. */
export interface AccountLoginEvidence {
  checkedIn?: boolean
}

export interface AccountLoginRequest {
  account: AccountLoginTarget
  /** An ID returned by this adapter's discovery; never interpreted by the caller. */
  methodId: AccountLoginMethodId
  requestId: string
  /**
   * Whether a person is expected to complete the provider sign-in. Absent means
   * one is; a run triggered by an alarm passes `false`.
   */
  attended?: boolean
  /** Fresh login is required only when the task depends on the login action itself. */
  sessionMode?: BrowserLoginSessionMode
}

export interface AccountLoginMethod {
  id: AccountLoginMethodId
  label: string
}

/** Domain outcome shared by browser, native and provider-specific login implementations. */
export type AccountLoginResult =
  | {
      status: typeof BROWSER_LOGIN_STATUS.Authenticated
      /** Verified identity normalized by the adapter, not necessarily a numeric user ID. */
      identity: string
      evidence?: AccountLoginEvidence
    }
  | {
      status:
        | typeof BROWSER_LOGIN_STATUS.Unsupported
        | typeof BROWSER_LOGIN_STATUS.Cancelled
        | typeof BROWSER_LOGIN_STATUS.Failed
        | typeof BROWSER_LOGIN_STATUS.IdentityMismatch
        | typeof BROWSER_LOGIN_STATUS.InteractionRequired
        | typeof BROWSER_LOGIN_STATUS.SessionBusy
        | typeof BROWSER_LOGIN_STATUS.Uncertain
      message?: string
    }

/** Each adapter owns discovery, authentication and identity verification for its protocol. */
export interface AccountLoginCapability {
  /** Read-only deployment discovery; never performs login or logs out. */
  discover(account: AccountLoginTarget): Promise<AccountLoginMethod[]>
  supports(account: AccountLoginTarget): boolean
  login(request: AccountLoginRequest): Promise<AccountLoginResult>
}
