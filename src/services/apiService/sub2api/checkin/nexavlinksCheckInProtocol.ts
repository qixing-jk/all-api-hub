/**
 * NexaVlinks serves one read/write pair plus a captcha challenge endpoint.
 *
 * Verified at https://asia.nexavlinks.com/check-in on 2026-10-17 from the
 * deployment's own `CheckInView` / `CheckInChallengeDialog` chunks: `GET
 * /api/v1/check-in` reads status, `POST /api/v1/check-in` claims, and `GET
 * /api/v1/check-in/challenge` mints the puzzle the claim must answer — a step
 * the extension cannot perform, which is why only the read path is wired up.
 *
 * Like its sibling Sub2API plugins this protocol is served from the account's
 * own origin and discovered by probing, so sibling deployments are picked up
 * without registration. `www.nexavlinks.com` is the marketing site (no
 * `/dashboard`, no check-in routes) and `eu.`/`us.`/`na.`/`api.`/`app.` did not
 * resolve at verification time, so the console above is the only known one.
 */
export const NEXAVLINKS_CHECK_IN_ENDPOINT = "/api/v1/check-in"

/** Match the native dashboard's `?timezone=` query without coupling the path. */
export function resolveNexaVlinksCheckInTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/** Pure route builder shared by execution and diagnostic feedback. */
export function createNexaVlinksCheckInStatusEndpoint(
  timezone: string,
): string {
  return `${NEXAVLINKS_CHECK_IN_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`
}
