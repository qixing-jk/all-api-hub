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
  [VELOERA]: veloeraProvider
}

export function resolveAutoCheckinProvider(
  account: SiteAccount
): AutoCheckinProvider | null {
  const provider = providers[account.site_type]
  return provider ?? null
}

export function isAutoCheckinSupportedForSite(siteType: string): boolean {
  return !!providers[siteType]
}
