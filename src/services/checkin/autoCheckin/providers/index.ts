import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { newApiProvider } from "~/services/checkin/autoCheckin/providers/newApi"
import { voApiV2Provider } from "~/services/checkin/autoCheckin/providers/voapiV2"
import type { CheckInMethodId } from "~/types/checkIn"

import { anyrouterProvider } from "./anyrouter"
import type { AutoCheckinProvider } from "./contracts"
import {
  AUTO_CHECKIN_METHOD_DEFINITIONS,
  createAutoCheckinMethodRegistry,
} from "./registry"
import { veloeraProvider } from "./veloera"
import { wongGongyiProvider } from "./wong"

const PROVIDER_BY_METHOD_ID = {
  [AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn]: anyrouterProvider,
  [AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn]: veloeraProvider,
  [AUTO_CHECKIN_METHOD_IDS.WongGongyiDailyCheckIn]: wongGongyiProvider,
  [AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn]: newApiProvider,
  [AUTO_CHECKIN_METHOD_IDS.VoApiV2DailyCheckIn]: voApiV2Provider,
} as const satisfies Record<CheckInMethodId, AutoCheckinProvider>

export const autoCheckinMethodRegistry = createAutoCheckinMethodRegistry(
  Object.values(AUTO_CHECKIN_METHOD_DEFINITIONS).map(({ id, siteTypes }) => ({
    id,
    siteTypes,
    provider: PROVIDER_BY_METHOD_ID[id],
    compatibilityRegistration:
      AUTO_CHECKIN_METHOD_DEFINITIONS[id].legacy &&
      AUTO_CHECKIN_METHOD_DEFINITIONS[id].newAccountCompatibility,
  })),
)
