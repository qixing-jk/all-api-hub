import {
  ACCOUNT_LOGIN_PROVIDER_LABELS,
  isAccountLoginProvider,
  type AccountLoginProvider,
} from "~/constants/accountLogin"
import { isAgentRouterLoginUrl } from "~/services/accountLogin/providers/agentrouter/config"
import {
  AccountWriteRejectedError,
  type AccountWriteGuard,
} from "~/services/core/accountWriteGuard"
import type { SiteAccount } from "~/types"
import type { CheckInConfig } from "~/types/checkIn"
import {
  LOGIN_PROVIDER_EVIDENCE_OUTCOMES,
  type LoginProviderEvidenceMap,
} from "~/types/loginProviderEvidence"
import { t } from "~/utils/i18n/core"

import { loginProviderEvidence } from "./providerEvidence"

/** The account that owns one provider claim, with the provider it claimed. */
export interface LoginProviderClaimConflict {
  provider: AccountLoginProvider
  owner: Pick<SiteAccount, "id" | "site_name">
}

/** Reported when another account already owns the claimed login provider. */
const LOGIN_PROVIDER_IN_USE_MESSAGE_KEY =
  "messages:errors.validation.loginProviderInUse"

/** Builds the translation parameters for the conflict message. */
export function getLoginProviderConflictMessageParams(
  provider: AccountLoginProvider,
): Record<string, string> {
  return { provider: ACCOUNT_LOGIN_PROVIDER_LABELS[provider] }
}

/**
 * Reads the login provider selected for login-based check-in.
 *
 * There is deliberately no GitHub fallback: the browser flow signs in with
 * whichever GitHub / Linux DO identity the browser currently holds, so guessing
 * a provider would run the wrong OAuth identity and report a misleading
 * `identity_mismatch` instead of asking the user to choose.
 */
export function resolveLoginCheckInProvider(
  config?: CheckInConfig,
): AccountLoginProvider | null {
  const provider = config?.loginCheckIn?.provider
  return isAccountLoginProvider(provider) ? provider : null
}

/**
 * Sets or clears the login provider selection on a check-in configuration.
 *
 * Single write entrance for the stored selection: every UI or bootstrap writer
 * goes through here, so a future relocation of the field (for example into a
 * standalone login configuration) only touches this module plus the codec.
 */
export function setLoginProviderSelection(
  config: CheckInConfig,
  provider: AccountLoginProvider | null,
): CheckInConfig {
  if (!provider) {
    const { loginCheckIn: _cleared, ...rest } = config
    return rest
  }
  return { ...config, loginCheckIn: { provider } }
}

/**
 * Reads the login provider one enabled login-based account claims.
 *
 * The browser flow signs in with whichever GitHub / Linux DO identity the
 * browser currently holds rather than with per-account credentials, so two
 * accounts sharing a provider would drive the same identity: the first
 * succeeds, the second reports `identity_mismatch` after being logged out
 * and re-authenticated. One provider therefore belongs to one account.
 *
 * AgentRouter is currently the only login-based site, so the predicate pins its
 * canonical URL; the claim mechanics above it are site-agnostic.
 *
 * Only accounts that opted into automatic execution claim a provider; a
 * manually run account with automatic execution disabled still reaches the
 * provider directly, so its selection is not treated as a standing claim.
 */
export function getLoginProviderClaim(
  account: SiteAccount,
): AccountLoginProvider | null {
  if (
    account.disabled === true ||
    account.checkIn?.automaticExecutionEnabled !== true ||
    !isAgentRouterLoginUrl(account.site_url)
  ) {
    return null
  }

  const provider = resolveLoginCheckInProvider(account.checkIn)
  return provider
}

/**
 * Evidence tiers, best first.
 *
 * A successful login proves the browser's provider identity belongs to that
 * account. A mismatch proves the opposite, and must rank *below* "never tried":
 * otherwise an account whose identity no longer matches would hold the provider
 * forever while the account that actually works is never allowed to try.
 */
const CLAIMANT_RANK = {
  ProvenByLogin: 0,
  Untried: 1,
  RejectedByLogin: 2,
} as const

/** Ranks one claimant against the last login outcome recorded for it. */
function getClaimantRank(
  account: SiteAccount,
  provider: AccountLoginProvider,
  evidence: LoginProviderEvidenceMap,
): number {
  const entry = evidence[account.id]
  if (!entry || entry.provider !== provider) return CLAIMANT_RANK.Untried
  return entry.outcome === LOGIN_PROVIDER_EVIDENCE_OUTCOMES.Success
    ? CLAIMANT_RANK.ProvenByLogin
    : CLAIMANT_RANK.RejectedByLogin
}

/** Picks one owner among the accounts claiming the same provider. */
function pickProviderOwner(
  claimants: readonly SiteAccount[],
  provider: AccountLoginProvider,
  evidence: LoginProviderEvidenceMap,
): SiteAccount {
  return claimants.reduce((best, candidate) => {
    const bestRank = getClaimantRank(best, provider, evidence)
    const candidateRank = getClaimantRank(candidate, provider, evidence)
    if (candidateRank !== bestRank) {
      return candidateRank < bestRank ? candidate : best
    }
    // Within an observed tier, the more recent observation is the better
    // evidence of which identity the browser currently holds.
    if (bestRank !== CLAIMANT_RANK.Untried) {
      const bestAt = evidence[best.id]?.at
      const candidateAt = evidence[candidate.id]?.at
      // A ranked claimant always has evidence; without a timestamp neither
      // candidate is more recent, so the incumbent stays.
      if (bestAt === undefined || candidateAt === undefined) return best
      if (candidateAt !== bestAt) return candidateAt > bestAt ? candidate : best
    }
    // Never tried, or equally recent: stay deterministic and storage-order
    // independent. Account ids are random, so this is arbitrary by design - it
    // only decides which duplicate gets to prove itself first.
    return candidate.id < best.id ? candidate : best
  })
}

/**
 * Resolves which account owns each claimed provider.
 *
 * A stored claim is never rewritten. When several accounts already claim one
 * provider, the one whose last login proved the browser identity wins; an
 * untried account outranks one that was rejected, so ownership converges on
 * whichever account can actually sign in. The rest are reported as conflicts
 * and skipped.
 */
export function resolveLoginProviderOwners(
  accounts: readonly SiteAccount[],
  evidence: LoginProviderEvidenceMap = {},
): Map<AccountLoginProvider, SiteAccount> {
  const claimantsByProvider = new Map<AccountLoginProvider, SiteAccount[]>()
  for (const account of accounts) {
    const provider = getLoginProviderClaim(account)
    if (!provider) continue
    const claimants = claimantsByProvider.get(provider)
    if (claimants) claimants.push(account)
    else claimantsByProvider.set(provider, [account])
  }

  const owners = new Map<AccountLoginProvider, SiteAccount>()
  for (const [provider, claimants] of claimantsByProvider) {
    owners.set(provider, pickProviderOwner(claimants, provider, evidence))
  }
  return owners
}

/**
 * Returns the provider this account claims when another account already owns it.
 *
 * `owners` must come from the full stored account list. Without it the guard
 * cannot be evaluated, and an account that owns its provider (or claims nothing)
 * stays unblocked rather than being skipped on missing evidence.
 */
export function getLoginProviderClaimedByAnother(
  account: SiteAccount,
  owners?: ReadonlyMap<AccountLoginProvider, SiteAccount>,
): AccountLoginProvider | null {
  const provider = getLoginProviderClaim(account)
  if (!provider || !owners) return null
  const owner = owners.get(provider)
  return owner && owner.id !== account.id ? provider : null
}

/** Reports the provider claim that another account already owns. */
export function findLoginProviderConflict(input: {
  accounts: readonly SiteAccount[]
  siteUrl?: string
  checkIn?: CheckInConfig
  /** The account being saved; it never conflicts with itself. */
  accountId?: string
  evidence?: LoginProviderEvidenceMap
}): LoginProviderClaimConflict | null {
  if (!isAgentRouterLoginUrl(input.siteUrl)) return null
  if (input.checkIn?.automaticExecutionEnabled !== true) return null

  const provider = resolveLoginCheckInProvider(input.checkIn)
  if (!provider) return null

  const owner = resolveLoginProviderOwners(input.accounts, input.evidence).get(
    provider,
  )
  if (!owner || owner.id === input.accountId) return null

  return { provider, owner: { id: owner.id, site_name: owner.site_name } }
}

/**
 * Renders the rejection message for one provider conflict.
 *
 * Reached through {@link LoginProviderClaimConflictError}, which raises it as the
 * reason a refused write could not be saved.
 */
function getLoginProviderConflictMessage(
  conflict: LoginProviderClaimConflict,
): string {
  return t(LOGIN_PROVIDER_IN_USE_MESSAGE_KEY, {
    ...getLoginProviderConflictMessageParams(conflict.provider),
    account: conflict.owner.site_name,
  })
}

/**
 * Lists the providers already owned by another account, for the settings UI.
 *
 * The editing account is excluded so a stored claim never disables its own
 * value, which would leave an account unable to change or clear the selection.
 */
export function resolveLoginProviderClaims(input: {
  accounts: readonly SiteAccount[]
  accountId?: string
  evidence?: LoginProviderEvidenceMap
}): LoginProviderClaimConflict[] {
  return [...resolveLoginProviderOwners(input.accounts, input.evidence)]
    .filter(([, owner]) => owner.id !== input.accountId)
    .map(([provider, owner]) => ({
      provider,
      owner: { id: owner.id, site_name: owner.site_name },
    }))
}

/** Raised when a write would leave two enabled accounts owning one provider. */
export class LoginProviderClaimConflictError extends AccountWriteRejectedError {
  constructor(readonly conflict: LoginProviderClaimConflict) {
    super(getLoginProviderConflictMessage(conflict))
    this.name = "LoginProviderClaimConflictError"
  }
}

/**
 * Rejects a write that would let two enabled accounts own one login provider.
 *
 * The check runs against the config being written, so a rule that spans accounts
 * cannot race a concurrent save. The candidate replaces its stored self (updates)
 * or is appended conceptually (creations); either way it is compared against the
 * claims of every other account.
 */
function assertLoginProviderClaimAllowed(input: {
  accounts: readonly SiteAccount[]
  candidate: SiteAccount
  evidence: LoginProviderEvidenceMap
}): void {
  const conflict = findLoginProviderConflict({
    accounts: input.accounts,
    siteUrl: input.candidate.site_url,
    checkIn: input.candidate.checkIn,
    accountId: input.candidate.id,
    evidence: input.evidence,
  })
  if (conflict) throw new LoginProviderClaimConflictError(conflict)
}

/**
 * Builds the write guard for saves of one site, or nothing when the site has no
 * login-provider claim to protect.
 *
 * The observed login outcomes are read once here: they only order claimants that
 * already share a provider, and the guard still rejects the write when they are
 * unavailable, so a read failure narrows the tiebreak rather than the rule.
 */
export async function createLoginProviderClaimGuard(input: {
  siteUrl?: string
}): Promise<AccountWriteGuard | undefined> {
  if (!isAgentRouterLoginUrl(input.siteUrl)) return undefined

  const evidence = await loginProviderEvidence.readAll()
  return (config, nextAccount) =>
    assertLoginProviderClaimAllowed({
      accounts: config.accounts,
      candidate: nextAccount,
      evidence,
    })
}
