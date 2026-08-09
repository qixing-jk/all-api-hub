import { SITE_TYPES } from "~/constants/siteType"
import { newApiProvider } from "~/services/checkin/autoCheckin/providers/newApi"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import { voApiV2Provider } from "~/services/checkin/autoCheckin/providers/voapiV2"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

import { anyrouterProvider, type AnyrouterCheckInParams } from "./anyrouter"
import {
  AUTO_CHECKIN_METHOD_IDS,
  createAutoCheckinMethodRegistry,
} from "./registry"
import { veloeraProvider } from "./veloera"
import { wongGongyiProvider } from "./wong"

export {
  AUTO_CHECKIN_METHOD_IDS,
  createAutoCheckinMethodRegistry,
  decodePersistedCheckInMethodId,
  type AutoCheckinMethodRegistration,
  type AutoCheckinMethodRegistry,
  type CheckInMethodId,
  type PersistedCheckInMethodId,
} from "./registry"

/**
 * Auto check-in provider contract.
 *
 * Legacy providers remain selected by `SiteAccount.site_type` through the
 * compatibility resolver and should:
 * - Quickly decide eligibility via `canCheckIn`.
 * - Perform the check-in flow via `checkIn` and return a normalized result.
 */
export interface AutoCheckinProvider {
  canCheckIn(account: SiteAccount): boolean
  checkIn(
    account: SiteAccount | AnyrouterCheckInParams,
    context: AutoCheckinProviderContext,
  ): Promise<AutoCheckinProviderResult>
}

export interface AutoCheckinProviderContext {
  tempWindowRequestSource: TempWindowRequestSource
  protectionBypassExecution: ProtectionBypassExecution
}

const REQUIRED_LEGACY_AUTO_CHECKIN_SITE_TYPES = [
  SITE_TYPES.ANYROUTER,
  SITE_TYPES.VELOERA,
  SITE_TYPES.WONG_GONGYI,
  SITE_TYPES.NEW_API,
  SITE_TYPES.MODELFLARE,
  SITE_TYPES.VO_API_V2,
] as const

export const autoCheckinMethodRegistry = createAutoCheckinMethodRegistry(
  [
    {
      id: AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
      siteTypes: [SITE_TYPES.ANYROUTER],
      legacy: { siteTypes: [SITE_TYPES.ANYROUTER] },
      newAccountCompatibility: { siteTypes: [SITE_TYPES.ANYROUTER] },
      provider: anyrouterProvider,
    },
    {
      id: AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn,
      siteTypes: [SITE_TYPES.VELOERA],
      legacy: { siteTypes: [SITE_TYPES.VELOERA] },
      newAccountCompatibility: { siteTypes: [SITE_TYPES.VELOERA] },
      provider: veloeraProvider,
    },
    {
      id: AUTO_CHECKIN_METHOD_IDS.WongGongyiDailyCheckIn,
      siteTypes: [SITE_TYPES.WONG_GONGYI],
      legacy: { siteTypes: [SITE_TYPES.WONG_GONGYI] },
      newAccountCompatibility: { siteTypes: [SITE_TYPES.WONG_GONGYI] },
      provider: wongGongyiProvider,
    },
    {
      id: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
      siteTypes: [SITE_TYPES.NEW_API, SITE_TYPES.MODELFLARE],
      legacy: { siteTypes: [SITE_TYPES.NEW_API, SITE_TYPES.MODELFLARE] },
      newAccountCompatibility: {
        siteTypes: [SITE_TYPES.NEW_API, SITE_TYPES.MODELFLARE],
      },
      provider: newApiProvider,
    },
    {
      id: AUTO_CHECKIN_METHOD_IDS.VoApiV2DailyCheckIn,
      siteTypes: [SITE_TYPES.VO_API_V2],
      legacy: { siteTypes: [SITE_TYPES.VO_API_V2] },
      newAccountCompatibility: { siteTypes: [SITE_TYPES.VO_API_V2] },
      provider: voApiV2Provider,
    },
  ],
  {
    requiredLegacySiteTypes: REQUIRED_LEGACY_AUTO_CHECKIN_SITE_TYPES,
  },
)

/**
 * Resolve the auto check-in provider based on the site type of the given account
 * @param account - The site account to resolve the provider for
 * @returns The resolved auto check-in provider, or null if no provider is found
 */
export function resolveAutoCheckinProvider(
  account: SiteAccount,
): AutoCheckinProvider | null {
  const legacyRegistrations = autoCheckinMethodRegistry.getLegacyRegistrations(
    account.site_type,
  )
  return legacyRegistrations.length === 1
    ? legacyRegistrations[0].provider
    : null
}
