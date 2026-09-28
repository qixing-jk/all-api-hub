import type { AccountLoginMethodId } from "~/constants/accountLogin"
import type { SiteAccount } from "~/types"

/** Adapters select their identity fields; login does not require saved API credentials. */
export type AccountLoginTarget = Pick<SiteAccount, "site_url"> &
  Partial<Pick<SiteAccount, "site_type">> & {
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
}

export interface AccountLoginMethod {
  id: AccountLoginMethodId
  label: string
}

/** Domain outcome shared by browser, native and provider-specific login implementations. */
export type AccountLoginResult =
  | {
      status: "authenticated"
      /** Verified identity normalized by the adapter, not necessarily a numeric user ID. */
      identity: string
      evidence?: AccountLoginEvidence
    }
  | {
      status:
        | "unsupported"
        | "cancelled"
        | "failed"
        | "identity_mismatch"
        | "interaction_required"
        | "session_busy"
        | "uncertain"
      message?: string
    }

/** Each adapter owns discovery, authentication and identity verification for its protocol. */
export interface AccountLoginCapability {
  /** Read-only deployment discovery; never performs login or logs out. */
  discover(account: AccountLoginTarget): Promise<AccountLoginMethod[]>
  supports(account: AccountLoginTarget): boolean
  login(request: AccountLoginRequest): Promise<AccountLoginResult>
}
