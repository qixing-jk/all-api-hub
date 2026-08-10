import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

export interface AnyrouterCheckInParams {
  id?: string
  site_url: string
  cookieAuthSessionCookie?: string
  account_info: {
    id: number
  }
}

/** Execution dependencies supplied by the check-in scheduler. */
export interface AutoCheckinProviderContext {
  tempWindowRequestSource: TempWindowRequestSource
  protectionBypassExecution: ProtectionBypassExecution
}

/** Executable compatibility contract for a registered check-in method. */
export interface AutoCheckinProvider {
  canCheckIn(account: SiteAccount): boolean
  checkIn(
    account: SiteAccount | AnyrouterCheckInParams,
    context: AutoCheckinProviderContext,
  ): Promise<AutoCheckinProviderResult>
}
