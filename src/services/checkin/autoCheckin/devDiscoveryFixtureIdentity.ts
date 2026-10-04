/** Pure identity checks keep ordinary discovery outside the fixture runtime. */
import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import type { SiteAccount } from "~/types"

import { AUTO_CHECKIN_METHOD_DEFINITIONS } from "./providers/registry"

export const DEV_CHECK_IN_FIXTURE_ORIGIN =
  "https://fixture-checkin.example.invalid"
export const DEV_CHECK_IN_FIXTURE_SITE_TYPE =
  AUTO_CHECKIN_METHOD_DEFINITIONS[
    AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn
  ].siteTypes[0]
export const DEV_CHECK_IN_SCENARIOS = [
  { id: "single", label: "Single method" },
  { id: "multiple", label: "Multiple methods" },
  { id: "manual", label: "Manual choice" },
  { id: "failed", label: "Detection failed" },
  { id: "unsupported", label: "Unsupported" },
] as const

/** Registration is checked separately before any simulated result is returned. */
export function getDevCheckInFixtureScenario(account: SiteAccount) {
  if (account.site_type !== DEV_CHECK_IN_FIXTURE_SITE_TYPE) return undefined
  if (account.site_url !== DEV_CHECK_IN_FIXTURE_ORIGIN) return undefined
  return DEV_CHECK_IN_SCENARIOS.find(
    ({ id }) =>
      account.account_info.access_token === `dev-checkin-${id}` &&
      account.account_info.id === `dev-checkin-${id}`,
  )
}
