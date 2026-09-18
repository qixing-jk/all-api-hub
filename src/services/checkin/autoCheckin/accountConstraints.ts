import {
  ACCOUNT_LOGIN_PROVIDER_LABELS,
  isAccountLoginProvider,
  type AccountLoginProvider,
} from "~/constants/accountLogin"
import { isAgentRouterLoginUrl } from "~/services/accountLogin/providers/agentrouter/config"
import type { SiteAccount } from "~/types"
import { AUTO_CHECKIN_SKIP_REASON } from "~/types/autoCheckin"
import type { CheckInConfig } from "~/types/checkIn"
import {
  LOGIN_PROVIDER_EVIDENCE_OUTCOMES,
  type LoginProviderEvidenceMap,
} from "~/types/loginProviderEvidence"
import { t } from "~/utils/i18n/core"

/** The account that owns one provider claim, with the provider it claimed. */
export interface AgentRouterLoginProviderConflict {
  provider: AccountLoginProvider
  owner: Pick<SiteAccount, "id" | "site_name">
}

/** Reported when another account already owns the claimed login provider. */
export const AGENT_ROUTER_LOGIN_PROVIDER_IN_USE_MESSAGE_KEY =
  "messages:errors.validation.agentRouterLoginProviderInUse"

/**
 * Skip reason carrying the same condition through persisted snapshots, which
 * only hold a stable reason code and no message parameters.
 */
export const AGENT_ROUTER_LOGIN_PROVIDER_IN_USE_SKIP_REASON =
  AUTO_CHECKIN_SKIP_REASON.LOGIN_PROVIDER_IN_USE

/** Builds the translation parameters for the conflict message. */
export function getAgentRouterLoginProviderConflictMessageParams(
  provider: AccountLoginProvider,
): Record<string, string> {
  return { provider: ACCOUNT_LOGIN_PROVIDER_LABELS[provider] }
}

/**
 * Reads the login provider one enabled AgentRouter account claims.
 *
 * The browser flow signs in with whichever GitHub / Linux DO identity the
 * browser currently holds rather than with per-account credentials, so two
 * AgentRouter accounts sharing a provider would drive the same identity: the
 * first succeeds, the second reports `identity_mismatch` after being logged out
 * and re-authenticated. One provider therefore belongs to one account.
 *
 * Only accounts that opted into automatic execution claim a provider; a
 * manually run account with automatic execution disabled still reaches the
 * provider directly, so its selection is not treated as a standing claim.
 */
export function getAgentRouterLoginProviderClaim(
  account: SiteAccount,
): AccountLoginProvider | null {
  if (
    account.disabled === true ||
    account.checkIn?.automaticExecutionEnabled !== true ||
    !isAgentRouterLoginUrl(account.site_url)
  ) {
    return null
  }

  const provider = account.checkIn.loginCheckIn?.provider
  return isAccountLoginProvider(provider) ? provider : null
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
      const bestAt = evidence[best.id].at
      const candidateAt = evidence[candidate.id].at
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
export function resolveAgentRouterLoginProviderOwners(
  accounts: readonly SiteAccount[],
  evidence: LoginProviderEvidenceMap = {},
): Map<AccountLoginProvider, SiteAccount> {
  const claimantsByProvider = new Map<AccountLoginProvider, SiteAccount[]>()
  for (const account of accounts) {
    const provider = getAgentRouterLoginProviderClaim(account)
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
export function getAgentRouterLoginProviderClaimedByAnother(
  account: SiteAccount,
  owners?: ReadonlyMap<AccountLoginProvider, SiteAccount>,
): AccountLoginProvider | null {
  const provider = getAgentRouterLoginProviderClaim(account)
  if (!provider || !owners) return null
  const owner = owners.get(provider)
  return owner && owner.id !== account.id ? provider : null
}

/** Reports the provider claim that another account already owns. */
export function findAgentRouterLoginProviderConflict(input: {
  accounts: readonly SiteAccount[]
  siteUrl?: string
  checkIn?: CheckInConfig
  /** The account being saved; it never conflicts with itself. */
  accountId?: string
  evidence?: LoginProviderEvidenceMap
}): AgentRouterLoginProviderConflict | null {
  if (!isAgentRouterLoginUrl(input.siteUrl)) return null
  if (input.checkIn?.automaticExecutionEnabled !== true) return null

  const provider = input.checkIn.loginCheckIn?.provider
  if (!isAccountLoginProvider(provider)) return null

  const owner = resolveAgentRouterLoginProviderOwners(
    input.accounts,
    input.evidence,
  ).get(provider)
  if (!owner || owner.id === input.accountId) return null

  return { provider, owner: { id: owner.id, site_name: owner.site_name } }
}

/** Renders the save-time rejection message for one provider conflict. */
export function getAgentRouterLoginProviderConflictMessage(
  conflict: AgentRouterLoginProviderConflict,
): string {
  return t(AGENT_ROUTER_LOGIN_PROVIDER_IN_USE_MESSAGE_KEY, {
    ...getAgentRouterLoginProviderConflictMessageParams(conflict.provider),
    account: conflict.owner.site_name,
  })
}

/**
 * Lists the providers already owned by another account, for the settings UI.
 *
 * The editing account is excluded so a stored claim never disables its own
 * value, which would leave an account unable to change or clear the selection.
 */
export function resolveAgentRouterLoginProviderClaims(input: {
  accounts: readonly SiteAccount[]
  accountId?: string
  evidence?: LoginProviderEvidenceMap
}): AgentRouterLoginProviderConflict[] {
  return [
    ...resolveAgentRouterLoginProviderOwners(input.accounts, input.evidence),
  ]
    .filter(([, owner]) => owner.id !== input.accountId)
    .map(([provider, owner]) => ({
      provider,
      owner: { id: owner.id, site_name: owner.site_name },
    }))
}
