import { VELOERA } from "~/constants/siteType"
import type { SiteAccount } from "~/types"
import type { CheckinResultStatus } from "~/types/autoCheckin"

import { veloeraProvider } from "./veloera"

export interface AutoCheckinProvider {
  canCheckIn(account: SiteAccount): boolean
  checkIn(account: SiteAccount): Promise<{
    status: CheckinResultStatus
    message: string
    data?: any
  }>
}

const providers: Record<string, AutoCheckinProvider> = {
  [VELOERA]: veloeraProvider,
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

export function isAutoCheckinSupportedForSite(siteType: string): boolean {
  return !!providers[siteType]
}
