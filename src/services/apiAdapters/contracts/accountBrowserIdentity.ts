import type { AccountSiteType } from "~/constants/siteType"

export type AccountBrowserIdentityContext = {
  origin: string
  siteType: AccountSiteType
  candidateUserIds: readonly string[]
}

/** One bounded GET using only the current page's session, without auth recovery. */
export type BrowserIdentityRead = (request: {
  url: string
  headers?: Record<string, string>
}) => Promise<Record<string, unknown> | null>

export type BrowserIdentityObservation = {
  /** Page-local session evidence; never persist, send through messaging, or log it. */
  sessionKey: string
  expiresAt?: number
  verify: (read: BrowserIdentityRead) => Promise<unknown>
}

/** Passive browser capability, separate from account bootstrap and session recovery. */
export type AccountBrowserIdentityCapability = {
  canObserve: (context: AccountBrowserIdentityContext) => boolean
  observe: (
    context: AccountBrowserIdentityContext,
  ) => BrowserIdentityObservation | null
}
