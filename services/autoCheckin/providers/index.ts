import { ANYROUTER, NEW_API, VELOERA, WONG_GONGYI } from "~/constants/siteType"
import { newApiProvider } from "~/services/autoCheckin/providers/newApi"
import type { SiteAccount } from "~/types"

import { AnyrouterCheckInParams, anyrouterProvider } from "./anyrouter"
import type { AutoCheckinProviderResult } from "./types"
import { veloeraProvider } from "./veloera"
import { wongGongyiProvider } from "./wong"

/**
 * Auto check-in provider contract.
 *
 * Providers are selected by `SiteAccount.site_type` and should:
 * - Quickly decide eligibility via `canCheckIn`.
 * - Perform the check-in flow via `checkIn` and return a normalized result.
 */
export interface AutoCheckinProvider {
  canCheckIn(account: SiteAccount): boolean
  checkIn(
    account: SiteAccount | AnyrouterCheckInParams,
  ): Promise<AutoCheckinProviderResult>
}

const providers: Record<string, AutoCheckinProvider> = {
  [ANYROUTER]: anyrouterProvider,
  [VELOERA]: veloeraProvider,
  [WONG_GONGYI]: wongGongyiProvider,
  [NEW_API]: newApiProvider,
}

/**
 * Resolve the auto check-in provider based on the site type of the given account
 * @param account - The site account to resolve the provider for
 * @returns The resolved auto check-in provider, or null if no provider is found
 */
export function resolveAutoCheckinProvider(
  account: SiteAccount,
): AutoCheckinProvider | null {
  const provider = providers[account.site_type]
  return provider ?? null
}

/**
 * Determine whether the specified site type supports auto check-in.
 * @param siteType Identifier describing the current site implementation.
 * @returns True when a provider exists for the supplied site type.
 */
export function isAutoCheckinSupportedForSite(siteType: string): boolean {
  return !!providers[siteType]
}
