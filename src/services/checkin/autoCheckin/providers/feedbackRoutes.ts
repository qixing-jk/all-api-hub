import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"

import { getAutoCheckinCandidateMethodIds } from "./registry"

interface FeedbackStatusRoute {
  path: string
  public?: boolean
  rawToken?: boolean
}

/** Read-only protocol clues; never include executable or guessed routes. */
export function getCheckInFeedbackStatusRoutes(
  siteType: AccountSiteType,
  siteUrl?: string,
): FeedbackStatusRoute[] {
  const routes = new Map<string, FeedbackStatusRoute>()
  const add = (route: FeedbackStatusRoute) => routes.set(route.path, route)
  for (const method of getAutoCheckinCandidateMethodIds(siteType, siteUrl)) {
    switch (method) {
      // Agent Router exposes login availability through its public /api/status.
      case AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn:
        add({ path: "/api/status", public: true })
        break
      // New API GET readback, not POST execution:
      // https://github.com/QuantumNous/new-api/blob/2d8e50bf36e94200b809dfb39e73624ec48b1e23/controller/checkin.go
      // Verified sibling status route:
      // https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/controller/user.go
      case AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn:
      case AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn: {
        const now = new Date()
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
        add({ path: "/api/status", public: true })
        add({ path: `/api/user/checkin?month=${month}` })
        add({ path: "/api/user/check_in_status" })
        break
      }
      // Existing GET contract in providers/wong.ts; POST is exclusively mutation.
      case AUTO_CHECKIN_METHOD_IDS.WongGongyiDailyCheckIn:
        add({ path: "/api/user/checkin" })
        break
      // https://github.com/VoAPI/VoAPI; apiService/voapiV2/type.ts separates stats and submit.
      case AUTO_CHECKIN_METHOD_IDS.VoApiV2DailyCheckIn:
        add({ path: "/api/check_in/stats", rawToken: true })
        break
      // Verified fork contracts retained in apiService/sub2api/checkIn.ts and denxioCheckIn.ts.
      case AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn:
        add({ path: "/api/v1/redeem/checkin/status" })
        break
      // Verified deployment contract: https://codexcli.club/dashboard
      case AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn:
        add({ path: "/api/v1/user/checkin/status" })
        break
      case AUTO_CHECKIN_METHOD_IDS.DenxioDailyCheckIn:
        add({ path: "/api/v1/tbe-sponsor-checkin/status" })
        break
      default:
        // AnyRouter has no read-only status contract; never call its check-in action.
        break
    }
  }
  return [...routes.values()].slice(0, 4)
}
