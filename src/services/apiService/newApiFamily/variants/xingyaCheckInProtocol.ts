/**
 * 星芽 (xingya.site) check-in protocol endpoints.
 *
 * The deployment is a closed-source New API fork (`version: "xingya-rc46"`)
 * whose console check-in does not use the shared `/api/user/checkin` contract.
 * Its own dashboard reads and writes dedicated `xingya-*` routes, discovered
 * from the console bundle (`static/js/index.*.js`, module exporting
 * `/api/user/xingya-checkin` and `/api/user/xingya-daily-claim`) and verified
 * live on https://xingya.site 2026-10-25:
 *
 * - `GET /api/user/xingya-checkin[?month=YYYY-MM]` is the read-only status the
 *   console polls (staleTime 15s, refetch 60s). It never mutates.
 * - `POST /api/user/xingya-daily-claim[?turnstile=<token>]` performs the daily
 *   claim. The turnstile query parameter is only appended when the console's
 *   status gate (`turnstile_check && turnstile_site_key`) is open; the observed
 *   deployment reports `turnstile_check: false` and posts without a body.
 *
 * Discovery identifies this contract from status readback or the public
 * `xingya_checkin_available` marker. Verified console domains are only hints
 * for ranking confirmed peers, never a credential redirect target.
 */

/** Read-only status route; the console reads it without a month for today. */
export const XINGYA_CHECK_IN_STATUS_ENDPOINT = "/api/user/xingya-checkin"

/** Daily claim mutation route. */
export const XINGYA_DAILY_CLAIM_ENDPOINT = "/api/user/xingya-daily-claim"

/** Both domains served the same console and protocol marker on 2026-11-15. */
export const XINGYA_CHECK_IN_ORIGINS = [
  "https://xingya.site",
  "https://xingya.space",
] as const
