import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { agentRouterProvider } from "~/services/checkin/autoCheckin/providers/agentrouter"
import { newApiProvider } from "~/services/checkin/autoCheckin/providers/newApi"
import { sub2apiProProvider } from "~/services/checkin/autoCheckin/providers/sub2apiPro"
import { voApiV2Provider } from "~/services/checkin/autoCheckin/providers/voapiV2"
import type { CheckInMethodId } from "~/types/checkIn"

import { aiRouterProvider } from "./aiRouter"
import { anyrouterProvider } from "./anyrouter"
import { clawhudProvider } from "./clawhud"
import type { AutoCheckinProvider } from "./contracts"
import { daiguaProvider } from "./daigua"
import { denxioProvider } from "./denxio"
import { freeApiProvider } from "./freeApi"
import { geniusProgrammerProvider } from "./geniusProgrammer"
import { hiyoProvider } from "./hiyo"
import { nexavlinksProvider } from "./nexavlinks"
import {
  AUTO_CHECKIN_METHOD_DEFINITIONS,
  createAutoCheckinMethodRegistry,
} from "./registry"
import { sidruneProvider } from "./sidrune"
import { toolcodeProvider } from "./toolcode"
import { veloeraProvider } from "./veloera"
import { wongGongyiProvider } from "./wong"
import { xiaobaiCodeProvider } from "./xiaobaiCode"
import { xiaoenProvider } from "./xiaoen"

const PROVIDER_BY_METHOD_ID = {
  [AUTO_CHECKIN_METHOD_IDS.SidruneDailyCheckIn]: sidruneProvider,
  [AUTO_CHECKIN_METHOD_IDS.XiaoenDailyCheckIn]: xiaoenProvider,
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
  [AUTO_CHECKIN_METHOD_IDS.XiaobaiCodeDailyCheckIn]: xiaobaiCodeProvider,
  [AUTO_CHECKIN_METHOD_IDS.AiRouterDailyCheckIn]: aiRouterProvider,
  [AUTO_CHECKIN_METHOD_IDS.ToolcodeDailyCheckIn]: toolcodeProvider,
  [AUTO_CHECKIN_METHOD_IDS.HiyoDailyCheckIn]: hiyoProvider,
  [AUTO_CHECKIN_METHOD_IDS.ClawhudDailyCheckIn]: clawhudProvider,
  [AUTO_CHECKIN_METHOD_IDS.DaiguaDailyCheckIn]: daiguaProvider,
  [AUTO_CHECKIN_METHOD_IDS.FreeApiDailyCheckIn]: freeApiProvider,
  [AUTO_CHECKIN_METHOD_IDS.NexaVlinksDailyCheckIn]: nexavlinksProvider,
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
