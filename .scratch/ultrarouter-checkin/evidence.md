# Evidence — deployment-renamed check-in routes (issue #1740)

Captured 2026-10-23 against `https://ultrarouter.org` (system_name
`Ultra Router - 艺の公益站`, `version` empty, app 4.6.0 reported `new-api`).

## Site contract

- `GET /api/status` → 200; `checkin_enabled: true`, `turnstile_check: false`,
  no per-route configuration for check-in.
- The console SPA (`/_authenticated/profile/`) loads chunk
  `static/js/async/68669.33760ed4df.js` (and a duplicate `77302.d4c0db40ad.js`)
  whose API layer calls:
  ```js
  GET  `/api/user/daily-9f3k?month=${month}`
  POST `/api/user/daily-9f3k?turnstile=${encodeURIComponent(token)}`   // or plain POST
  ```
- Read fields: `stats.checked_in_today`, `stats.records[].checkin_date/quota_awarded`,
  `stats.total_checkins/total_quota`, success payload `data.quota_awarded`.
  The page takes the availability switch from `/api/status.checkin_enabled`, not
  from the status body, so whether `data.enabled` exists is unverified.

Probe commands (all unauthenticated, read-only):

```sh
curl -sS https://ultrarouter.org/api/status | jq '.data | {checkin_enabled, turnstile_check, version}'
for p in /api/user/checkin /api/user/check_in_status /api/user/daily-9f3k /api/user/nonexistent-route; do
  curl -sS -o /dev/null -w "%{http_code} $p\n" -H "Authorization: Bearer sk-invalid" "https://ultrarouter.org$p"
done
# 401 for every path: auth middleware precedes route matching, so the fork never
# answers 404 and `detectWithStatusReadback` cannot classify the route as absent.
```

Chunk search: downloaded the main bundle plus the 1,639 async chunks named by the
webpack `d.u` map; `daily-9f3k` appears only in the two profile chunks (6 hits),
so a homepage-only scan would miss it — route discovery scans the rendered
check-in page's loaded assets instead.

## Validation gaps

- No account on this deployment: the live `GET/POST /api/user/daily-9f3k` with a
  real token is unverified, including whether `data.enabled` exists. The
  implementation therefore treats a renamed route's missing `enabled` as
  availability from the public switch (mirroring the site console) and records
  this gap here rather than claiming live validation.
- Route discovery has unit coverage with a mocked asset scan
  (`tests/services/autoCheckin/discovery/routeDiscovery.test.ts`). On 2026-10-25,
  the user confirmed that live testing correctly learned the route. This is
  user-reported manual acceptance; browser/build details and raw live artifacts
  were not supplied. It establishes route learning, not successful mutation or
  reward receipt.
