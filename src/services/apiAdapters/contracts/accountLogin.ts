import {
  type ACCOUNT_COOKIE_VALIDATION_REASONS,
  type ACCOUNT_COOKIE_VALIDATION_STATUS,
} from "~/constants/accountCookieValidation"
import {
  type ACCOUNT_LOGIN_CONFIGURATION_KINDS,
  type ACCOUNT_LOGIN_CREDENTIAL_KINDS,
} from "~/constants/accountLogin"
import type {
  AccountLoginMethodId,
  AccountPasswordIdentity,
} from "~/constants/accountLogin"
import type { BrowserLoginSessionMode } from "~/constants/browserLogin"
import { type BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import type { ApiTransportFetchContext } from "~/services/apiTransport/type"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

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
  /** Stops queued/active login work; local only, never sent to a content script. */
  abortSignal?: AbortSignal
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
  /** Export the verified login context's credential before that context closes. */
  captureCredential?: boolean
}

export interface AccountLoginMethod {
  id: AccountLoginMethodId
  label: string
}

/** Implemented method facts; deployment discovery separately reports current availability. */
export interface AccountLoginMethodDefinition extends AccountLoginMethod {
  configuration:
    | { kind: typeof ACCOUNT_LOGIN_CONFIGURATION_KINDS.None }
    | {
        kind: typeof ACCOUNT_LOGIN_CONFIGURATION_KINDS.Password
        identity: AccountPasswordIdentity
      }
  /** Credential this method can export after verifying the target identity. */
  credentialRecovery?: typeof ACCOUNT_LOGIN_CREDENTIAL_KINDS.Cookie
}

export type AccountCookieValidationTarget = AccountLoginTarget &
  Partial<Pick<SiteAccount, "cookieAuth">> & {
    abortSignal?: AbortSignal
    protectionBypassExecution?: ProtectionBypassExecution
    tempWindowRequestSource?: TempWindowRequestSource
    fetchContext?: ApiTransportFetchContext
  }

/** A fresh confirmation belongs to one exact draft credential and account scope. */
export type AccountCookieValidationEvidence = {
  cookie: string
  siteUrl: string
  siteType: SiteAccount["site_type"]
  userId: string
}

/** A saved-credential diagnostic is independent of normal account health. */
export type AccountCookieValidationResult =
  | {
      status: Exclude<
        (typeof ACCOUNT_COOKIE_VALIDATION_STATUS)[keyof typeof ACCOUNT_COOKIE_VALIDATION_STATUS],
        typeof ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable
      >
    }
  | {
      status: typeof ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable
      reason: (typeof ACCOUNT_COOKIE_VALIDATION_REASONS)[keyof typeof ACCOUNT_COOKIE_VALIDATION_REASONS]
    }

/** Domain outcome shared by browser, native and provider-specific login implementations. */
export type AccountLoginResult =
  | {
      status: typeof BROWSER_LOGIN_STATUS.Authenticated
      /** Verified identity normalized by the adapter, not necessarily a numeric user ID. */
      identity: string
      credential?: { cookie: string }
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
  readonly methods: readonly AccountLoginMethodDefinition[]
  /** Read-only deployment discovery; never performs login or logs out. */
  discover(account: AccountLoginTarget): Promise<AccountLoginMethod[]>
  supports(account: AccountLoginTarget): boolean
  login(request: AccountLoginRequest): Promise<AccountLoginResult>
}
