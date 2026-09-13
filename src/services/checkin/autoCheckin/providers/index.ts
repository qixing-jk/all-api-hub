import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { agentRouterProvider } from "~/services/checkin/autoCheckin/providers/agentrouter"
import { newApiProvider } from "~/services/checkin/autoCheckin/providers/newApi"
import { sub2apiProProvider } from "~/services/checkin/autoCheckin/providers/sub2apiPro"
import { voApiV2Provider } from "~/services/checkin/autoCheckin/providers/voapiV2"
import type { CheckInMethodId } from "~/types/checkIn"

import { anyrouterProvider } from "./anyrouter"
import type { AutoCheckinProvider } from "./contracts"
import { denxioProvider } from "./denxio"
import { geniusProgrammerProvider } from "./geniusProgrammer"
import {
  AUTO_CHECKIN_METHOD_DEFINITIONS,
  createAutoCheckinMethodRegistry,
} from "./registry"
import { veloeraProvider } from "./veloera"
import { wongGongyiProvider } from "./wong"

const PROVIDER_BY_METHOD_ID = {
  [AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn]: agentRouterProvider,
  [AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn]: anyrouterProvider,
  [AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn]: veloeraProvider,
  [AUTO_CHECKIN_METHOD_IDS.WongGongyiDailyCheckIn]: wongGongyiProvider,
  [AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn]: newApiProvider,
  [AUTO_CHECKIN_METHOD_IDS.VoApiV2DailyCheckIn]: voApiV2Provider,
  [AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn]: sub2apiProProvider,
  [AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn]:
    geniusProgrammerProvider,
  [AUTO_CHECKIN_METHOD_IDS.DenxioDailyCheckIn]: denxioProvider,
} as const satisfies Record<CheckInMethodId, AutoCheckinProvider>

export const autoCheckinMethodRegistry = createAutoCheckinMethodRegistry(
  Object.values(AUTO_CHECKIN_METHOD_DEFINITIONS).map((definition) => ({
    id: definition.id,
    siteTypes: definition.siteTypes,
    ...("origins" in definition ? { origins: definition.origins } : {}),
    ...("excludedOrigins" in definition
      ? { excludedOrigins: definition.excludedOrigins }
      : {}),
    provider: PROVIDER_BY_METHOD_ID[definition.id],
    compatibilityRegistration: definition.newAccountCompatibility,
  })),
)
