import type { NewApiDashboardAuthBundle } from "~/services/apiService/newApi/dashboardAuth"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import type { NewApiVerificationMethods } from "./newApiSession"

export type NewApiDashboardRefreshResult = "refreshed" | "unavailable"

export type EnsureNewApiLoginResult =
  | {
      status: "logged-in"
      methods: NewApiVerificationMethods
    }
  | {
      status: "login-2fa-required"
    }
  | {
      status: "credentials-missing"
    }
  | {
      status: "passkey-manual-required"
      methods: NewApiVerificationMethods
    }

export interface VerifyNewApiSessionResult {
  methods: NewApiVerificationMethods
  verifiedUntil?: number
}

interface NewApiSessionState {
  hasLoggedInSession: boolean
  verifiedUntil?: number
  pendingLoginFlow?: {
    unified?: boolean
    token: string
    expiresAt?: number
  }
  dashboardAuth?: {
    token: string
    /** Epoch seconds, matching the upstream AuthBundle `access_expires_at`. */
    expiresAt: number
    sessionId: string
  }
  securityProof?: {
    token: string
    /** Epoch milliseconds, matching the normalized verified-until timestamp. */
    expiresAt: number
    channelId?: number
  }
  channelKeyReadQueue?: { pending?: Promise<unknown> }
  loginPromise?: Promise<EnsureNewApiLoginResult>
  refreshPromise?: Promise<NewApiDashboardRefreshResult>
  methodsPromise?: Promise<NewApiVerificationMethods | null>
  verificationChannelId?: number
  verificationPromise?: Promise<VerifyNewApiSessionResult>
}

export const normalizeSessionScopeKey = (baseUrl: string) =>
  normalizeUrlForOriginKey(baseUrl, { stripTrailingSlashes: true }) ||
  baseUrl.trim()

const toOptionalExpiryTimestamp = (expiresAt: unknown) => {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    return undefined
  }

  return expiresAt > 1_000_000_000_000 ? expiresAt : expiresAt * 1000
}

/** Owns transient auth expiry, challenges, scoped proof and per-origin single-flight work. */
export class NewApiTransientSessionRuntime {
  private readonly sessionStates = new Map<string, NewApiSessionState>()

  constructor(private readonly verificationWindowMs: number) {}

  private getSessionState(baseUrl: string): NewApiSessionState {
    const scopeKey = normalizeSessionScopeKey(baseUrl)
    const existing = this.sessionStates.get(scopeKey)

    if (existing) {
      return existing
    }

    const created: NewApiSessionState = {
      hasLoggedInSession: false,
    }
    this.sessionStates.set(scopeKey, created)
    return created
  }

  getActiveDashboardAuth(
    baseUrl: string,
  ): Readonly<NonNullable<NewApiSessionState["dashboardAuth"]>> | undefined {
    const state = this.getSessionState(baseUrl)
    const dashboardAuth = state.dashboardAuth
    if (!dashboardAuth) return undefined

    if (dashboardAuth.expiresAt > Date.now() / 1000) {
      return dashboardAuth
    }

    state.dashboardAuth = undefined
    state.securityProof = undefined
    state.hasLoggedInSession = false
    state.verifiedUntil = undefined
    return undefined
  }

  clearVerifiedState(baseUrl: string) {
    const state = this.getSessionState(baseUrl)
    state.verifiedUntil = undefined
    state.securityProof = undefined
  }

  clearLoggedInState(baseUrl: string) {
    const state = this.getSessionState(baseUrl)
    state.hasLoggedInSession = false
    state.verifiedUntil = undefined
    state.dashboardAuth = undefined
    state.securityProof = undefined
  }

  clearPendingLoginFlow(baseUrl: string) {
    this.getSessionState(baseUrl).pendingLoginFlow = undefined
  }

  markLoggedIn(baseUrl: string) {
    const state = this.getSessionState(baseUrl)
    state.hasLoggedInSession = true
  }

  storeDashboardAuth(baseUrl: string, bundle: NewApiDashboardAuthBundle) {
    const state = this.getSessionState(baseUrl)
    state.dashboardAuth = {
      token: bundle.token,
      expiresAt: bundle.expiresAt,
      sessionId: bundle.sessionId,
    }
    state.securityProof = undefined
    state.verifiedUntil = undefined
    state.pendingLoginFlow = undefined
    state.hasLoggedInSession = true
  }

  storePendingLoginFlow(
    baseUrl: string,
    token: string,
    expiresAt: unknown,
    unified = false,
  ) {
    const state = this.getSessionState(baseUrl)
    state.pendingLoginFlow = {
      unified,
      token,
      expiresAt: toOptionalExpiryTimestamp(expiresAt),
    }
  }

  getPendingLoginFlowForSubmission(
    baseUrl: string,
  ): Readonly<NonNullable<NewApiSessionState["pendingLoginFlow"]>> | undefined {
    const state = this.getSessionState(baseUrl)
    const pending = state.pendingLoginFlow
    if (!pending) return undefined

    if (pending.expiresAt && pending.expiresAt <= Date.now()) {
      state.pendingLoginFlow = undefined
      throw new Error("New API login flow expired")
    }

    return pending
  }

  hasActivePendingLoginFlow(baseUrl: string) {
    const state = this.getSessionState(baseUrl)
    const pending = state.pendingLoginFlow
    if (!pending) return false
    if (pending.expiresAt && pending.expiresAt <= Date.now()) {
      state.pendingLoginFlow = undefined
      return false
    }
    return true
  }

  getTransientSessionSecrets(baseUrl: string) {
    const state = this.getSessionState(baseUrl)
    return [
      state.pendingLoginFlow?.token ?? "",
      state.dashboardAuth?.token ?? "",
      state.securityProof?.token ?? "",
    ]
  }

  markVerified(
    baseUrl: string,
    verifiedUntil?: number,
    securityProof?: { token: string; expiresAt: number; channelId?: number },
  ) {
    const state = this.getSessionState(baseUrl)
    state.hasLoggedInSession = true
    state.verifiedUntil =
      verifiedUntil ?? Date.now() + this.verificationWindowMs
    // Successful reads confirm the session but do not issue a replacement proof.
    if (securityProof) state.securityProof = securityProof
  }

  getActiveSecurityProof(
    baseUrl: string,
  ): Readonly<NonNullable<NewApiSessionState["securityProof"]>> | undefined {
    const state = this.getSessionState(baseUrl)
    const securityProof = state.securityProof
    if (!securityProof) return undefined

    if (securityProof.expiresAt > Date.now()) {
      return securityProof
    }

    state.securityProof = undefined
    state.verifiedUntil = undefined
    return undefined
  }

  isVerifiedSessionActive(baseUrl: string) {
    const state = this.getSessionState(baseUrl)
    if (state.dashboardAuth) this.getActiveDashboardAuth(baseUrl)
    if (state.securityProof) this.getActiveSecurityProof(baseUrl)
    const verifiedUntil = state.verifiedUntil
    return Boolean(verifiedUntil && verifiedUntil > Date.now())
  }

  async runDashboardRefresh(
    baseUrl: string,
    execute: () => Promise<NewApiDashboardRefreshResult>,
  ): Promise<NewApiDashboardRefreshResult> {
    const state = this.getSessionState(baseUrl)
    if (state.refreshPromise) return state.refreshPromise
    state.refreshPromise = execute()
    try {
      return await state.refreshPromise
    } finally {
      state.refreshPromise = undefined
    }
  }

  async runVerificationMethods(
    baseUrl: string,
    execute: () => Promise<NewApiVerificationMethods | null>,
  ): Promise<NewApiVerificationMethods | null> {
    const state = this.getSessionState(baseUrl)
    if (state.methodsPromise) return state.methodsPromise
    state.methodsPromise = execute()
    try {
      return await state.methodsPromise
    } finally {
      state.methodsPromise = undefined
    }
  }

  async runLogin(
    baseUrl: string,
    execute: () => Promise<EnsureNewApiLoginResult>,
  ): Promise<EnsureNewApiLoginResult> {
    const state = this.getSessionState(baseUrl)
    if (state.loginPromise) return state.loginPromise
    state.loginPromise = execute()
    try {
      return await state.loginPromise
    } finally {
      state.loginPromise = undefined
    }
  }

  async runVerification(
    baseUrl: string,
    channelId: number | undefined,
    execute: () => Promise<VerifyNewApiSessionResult>,
  ): Promise<VerifyNewApiSessionResult> {
    const state = this.getSessionState(baseUrl)
    if (state.verificationPromise) {
      if (state.verificationChannelId === channelId)
        return state.verificationPromise
      await state.verificationPromise.catch(() => undefined)
      return await this.runVerification(baseUrl, channelId, execute)
    }
    state.verificationChannelId = channelId
    state.verificationPromise = execute()
    try {
      return await state.verificationPromise
    } finally {
      state.verificationPromise = undefined
    }
  }

  getVerifiedUntil(baseUrl: string) {
    return this.getSessionState(baseUrl).verifiedUntil
  }

  getChannelKeyReadQueue(baseUrl: string) {
    return (this.getSessionState(baseUrl).channelKeyReadQueue ??= {})
  }

  clear(baseUrl?: string) {
    if (!baseUrl) {
      this.sessionStates.clear()
      return
    }
    this.sessionStates.delete(normalizeSessionScopeKey(baseUrl))
  }
}
