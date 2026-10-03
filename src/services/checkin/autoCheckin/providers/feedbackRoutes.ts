import type { AccountSiteType } from "~/constants/siteType"

import {
  AUTO_CHECKIN_METHOD_DEFINITIONS,
  getAutoCheckinCandidateMethodIds,
} from "./registry"
import type {
  AutoCheckinMethodDefinition,
  CheckInFeedbackStatusRoute,
} from "./registry"

/** Derives read-only clues from the same registry that declares method support. */
export function getCheckInFeedbackStatusRoutes(
  siteType: AccountSiteType,
  siteUrl: string,
): CheckInFeedbackStatusRoute[] {
  const routes = new Map<string, CheckInFeedbackStatusRoute>()
  const now = new Date()
  const definitions = getAutoCheckinCandidateMethodIds(siteType, siteUrl).map(
    (method): AutoCheckinMethodDefinition =>
      AUTO_CHECKIN_METHOD_DEFINITIONS[method],
  )
  // A deployment's own contract must get a chance before generic fork probes
  // can consume the bounded scan time.
  definitions.sort(
    (a, b) =>
      Number(Boolean(b.origins?.length)) - Number(Boolean(a.origins?.length)),
  )
  for (const definition of definitions) {
    const declared = definition.feedbackStatusRoutes
    const methodRoutes =
      typeof declared === "function" ? declared(now) : declared
    for (const route of methodRoutes) routes.set(route.path, route)
  }
  // The scan reader owns request, byte and time budgets; never silently discard
  // a registered candidate here as new methods are introduced.
  return [...routes.values()]
}
