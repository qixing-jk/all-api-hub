# VoAPI v2 Account Adapter Design

Date: 2026-07-06

## Purpose

Add first-class support for the newer VoAPI account-site surface, first
observed on `https://demo.voapi.top/`, without treating it as the existing
`VoAPI` site type.

The current `VoAPI` support in this repository is an older compatibility bucket
that routes through the New API-family adapter. The observed deployment is not
New API-compatible: it uses different routes, different response envelopes, and
a dashboard JWT stored in the browser page rather than a New API-style long
access token. It should therefore become a new account site type instead of a
variant of the old `VoAPI` bucket.

The upstream `VoAPI/VoAPI` repository describes the project as a new
next-generation AI model API aggregation and distribution system and documents
Docker/self-hosted deployment. The adapter must therefore be deployment-neutral:
`demo.voapi.top` is evidence for the protocol contract, not the only supported
origin. Other operators may use different hostnames, ports, branding, or page
titles while keeping the same backend API shape.

## Current Findings

The observed demo site identifies itself as `VoAPI公益站` and uses these routes:

- dashboard: `/dash?_userMenuKey=dash`
- key management page: `/keys?_userMenuKey=keys`
- check-in page: `/checkIn?_userMenuKey=checkIn`
- site API key page: `/profile/api-key`

The authenticated web API uses a JWT-like value from:

```text
JSON.parse(localStorage.getItem("userStore")).auth.token
```

The token persists across page refresh and browser reopen with the same
profile. It is a three-part JWT with payload fields such as `userId`, `sign`,
`role`, `exp`, `nbf`, and `iat`. `localStorage.userStore.auth` also contains
safe identity metadata such as `email`, `phone`, `role`, and `registerTime`.
`localStorage.user` contains legacy-looking user fields such as `id`,
`username`, `display_name`, `email`, `role`, `status`, and quota fields, but
its `access_token` field is `null` and must not be used as the VoAPI v2
dashboard API token. Implementations must parse the `userStore` localStorage
JSON object; `userStore.auth.token` is a JSON path, not a literal
localStorage key name.

Logged-in demo-profile verification did not reveal a refresh-token contract.
In the logged-in `/profile/api-key` page, `localStorage.userStore.auth`
contained only `email`, `phone`, `registerTime`, `role`, and `token`.
The JWT payload contained `exp`, `iat`, `nbf`, `role`, `sign`, and `userId`.
No `refreshToken`, `refresh_token`, or refresh-like field was present in
`localStorage`, `sessionStorage`, or cookies. The page-load network trace
showed reads such as `/api/user/info`, `/api/i18n/pack/...`,
`/api/notice`, `/api/notify_inbox/unread-count`, and `/api/user_api_key`,
but no refresh or token-renewal endpoint. The shipped frontend bundle also
uses `userStore.auth.token` directly as `Authorization` and clears auth plus
routes to `/auth` when the backend returns `code === 2`; it does not perform a
refresh retry.

Requests send this value as a raw authorization header:

```http
Authorization: <jwt>
```

They do not use:

```http
Authorization: Bearer <jwt>
```

The existing `localStorage.user.access_token` value was observed as `null`.

Expired or invalid JWTs return business errors inside a successful HTTP
response:

```ts
{
  code: 2,
  data: null,
  msg: "Auth expire"
}
```

The adapter must therefore treat non-zero `code` values as failures instead of
relying on HTTP 401 or 403.

The account-info endpoint is:

```http
GET /api/user/info
```

It returns an envelope shaped like:

```ts
{
  code: 0,
  data: {
    basicBalance,
    bindBalance,
    usedBasicBalance,
    usedBindBalance,
    level,
    bud,
    id,
    currency,
    nickname,
    loginTime,
    role,
    inviteAmount,
    inviteTotal,
    totalRequest,
    totalToken,
    username,
    ban,
    customAvatar,
    hasPassword,
    passkeyCount,
    twoFactorEnabled,
    oauthList
  }
}
```

Balance fields are decimal strings. Dashboard UI renders `basicBalance` and
`bindBalance` as currency balances. `totalRequest` and `totalToken` are
lifetime counters.

Dashboard statistics endpoints exist for time-windowed usage:

```http
GET /api/dash/statistics?t=h&s=<start>&e=<end>
GET /api/dash/statistics/requests?t=h&s=<start>&e=<end>
GET /api/dash/statistics/models?t=h&s=<start>&e=<end>
GET /api/dash/statistics/tokens?t=h&s=<start>&e=<end>
```

The aggregate statistics payload includes `data.d.requests`,
`data.d.usedBasicBalance`, `data.d.usedBindBalance`, `data.d.errors`, and
`data.d.maxRpm` when called with a valid time window. The child endpoints
return arrays keyed by `created`; the request/model variants include request
and error counts. These endpoints return business errors when required time
window parameters are omitted.

Key inventory uses:

```http
GET /api/keys?page=1&size=10&sl[name]=true&sl[token]=true&sl[note]=true
GET /api/keys/template
```

Known list fields include:

```ts
{
  id,
  name,
  tokenMasked,
  groups,
  enable,
  expireTime,
  amount,
  used
}
```

Key templates use:

```http
GET /api/keys/template
```

The template response is `HTTP 200 { code: 0, data }`. `data.groups` is an
array with fields such as `id`, `name`, `visibleLevels`, `ratio`, `timeRatio`,
`chargingType`, `subBalanceType`, and `note`. `data.models` is an array with
fields such as `idKey`, `firm`, price strings, `flags`, `modalities`,
`sortOrder`, `enable`, and `hidden`. `data.ssb` is a boolean.

Confirmed key mutation endpoints:

```http
POST /api/keys
PUT /api/keys/{id}
POST /api/keys/{id}/token
DELETE /api/keys/{id}
```

Create and update/delete responses use `HTTP 200 { code: 0, data: null }`.
Create accepts `name`, `groups`, `amount`, `genCount`, `enable`, and
`expireTime`; it does not return the full secret. Enable and disable are done
by `PUT /api/keys/{id}` with `enable: true|false`, not by a separate status
endpoint. Secret reveal uses `POST /api/keys/{id}/token` with no body and
returns `HTTP 200 { code: 0, token }`, where `token` is the full `sk-` secret.

Check-in reads use:

```http
GET /api/check_in/template
GET /api/check_in/stats
GET /api/check_in?year=2026&month=7
```

`stats.todaySigned === false` means the account has not checked in today.
`stats.nextAmount` appears to represent the next reward.

The submit request is:

```http
POST /api/check_in
```

It sends no request body and uses raw JWT authorization. A request with
`Content-Type: application/json` and an omitted/empty body is accepted.
Successful submit returns `HTTP 200 { code: 0, data: { amount, bonusAmount } }`.
Repeating the submit after today's sign-in returns
`HTTP 200 { code: 1, msg: "Signed in today" }`.

The `/profile/api-key` page manages long-lived site API keys with a `voak-*`
format. These keys can authenticate some site API reads with raw
`Authorization: voak-*`, including `/api/user/info`, but the same key was
rejected for `/api/keys` and `/api/check_in/*` with an operation-not-allowed
message. Therefore `voak-*` is not the primary authentication mechanism for the
first account adapter version.

## Problem

The implementation has three pressure points:

1. **Site identity**: the new VoAPI surface must not be routed through the
   existing New API-family `VoAPI` adapter.
2. **Auth transport**: the generic `fetchApi` helper currently sends saved
   access tokens as Bearer tokens, which is wrong for this backend.
3. **Storage shape**: existing account storage has one primary
   `account_info.access_token` slot and no generic secondary site API key slot.
   The first version should avoid adding a partial secondary credential that
   only supports account-info reads.

## Goals

- Add a new site type, recommended string value: `voapi-v2`.
- Store the dashboard JWT in the existing `account_info.access_token` field.
- Keep `authType = AuthTypeEnum.AccessToken`.
- Extend `fetchApi` with a narrow request option that controls whether
  `Authorization` uses Bearer or raw token formatting.
- Build a VoAPI v2 account adapter for account balance, API key management,
  and check-in.
- Treat dashboard JWT expiry as a recoverable re-login/re-detection health
  state, with a narrow re-read of the logged-in page-session JWT when browser
  session state is available.
- Keep old `VoAPI` behavior unchanged.
- Keep Sub2API behavior unchanged; it continues to use Bearer JWTs and its
  existing refresh/resync logic.

## Non-Goals

- Do not merge this backend into the New API-family adapter.
- Do not expand saved account storage for `voak-*` in the first version.
- Do not use `voak-*` as a fallback for key management or check-in.
- Do not migrate AIHubMix or other raw-token sites onto the new transport
  option in this slice.
- Do not add VoAPI v2 refresh-token storage, refresh locks, proactive refresh,
  or a Sub2API-style renewal flow. Logged-in storage, cookies, frontend
  behavior, and observed network requests did not expose a stable refresh-token
  contract. A best-effort re-read of the current logged-in dashboard JWT is
  allowed because it uses the same `userStore.auth.token` extraction contract as
  account detection.
- Do not redesign Sub2API refresh-token storage, locks, or browser-session
  resync.
- Do not perform real check-in during protocol probing unless the user
  explicitly approves it for that probe.

## Approaches Considered

### Approach A: Adapter-Local `fetch`

The VoAPI v2 adapter could bypass `fetchApi` and hand-build raw `fetch`
requests. This avoids changing shared transport, but it loses established
features such as site request limiting, current-tab transport, temp-window
fallback, abort-signal wiring, and shared HTTP error handling.

This is not recommended.

### Approach B: Add A New Auth Type

A new auth type such as `RawAccessToken` would make the account auth mode more
explicit. However, it would require storage, UI, import/export, and product
policy updates for what is currently only a request-header formatting
difference. It also risks making existing saved-account surfaces understand a
site-specific protocol detail.

This is too broad for the first adapter version.

### Approach C: Add A Request-Level Token Formatting Option

Extend `fetchApi` with a small option, for example:

```ts
authTokenMode?: "bearer" | "raw"
```

Default behavior remains `"bearer"`. VoAPI v2 calls pass `"raw"`, while
existing New API-family, Sub2API, and other callers continue to behave as they
do today.

This is the recommended path. It is the smallest shared abstraction that maps
to the observed backend contract without widening account storage or auth-type
semantics.

## Design

### 1. Site Type And Definition

Add a new account site type:

```ts
SITE_TYPES.VO_API_V2 = "voapi-v2"
```

Add it to the account-site definition registry with:

- account scope only;
- insert it before old `SITE_TYPES.VO_API` in `ACCOUNT_SITE_TYPE_ORDER` so the
  specific v2 matcher runs before the old broad `VoAPI` compatibility matcher;
- a new adapter family such as `VoApiV2`, or a direct registry branch if the
  current adapter-family set remains deliberately small;
- allowed/default auth type: `AccessToken`;
- cookie auth disabled by default for saved accounts;
- built-in check-in detection enabled once check-in submit is verified;
- route overrides:
  - usage path: `/dash?_userMenuKey=dash`
  - key management path/admin credentials path: `/keys?_userMenuKey=keys`
  - check-in path: `/checkIn?_userMenuKey=checkIn`

Do not add `demo.voapi.top` as the only or required recognition rule. The
definition may record known official/demo hostnames as hints, but any origin
that exposes the VoAPI v2 backend signature must be eligible for detection.

Adapter registry wiring should mirror existing non-New-API sites such as
Sub2API and AIHubMix: add `apiAdapters/voapiV2` capabilities and return them
from `getSiteTypeCapabilities(SITE_TYPES.VO_API_V2)` by either adding a
dedicated adapter-family enum value or an explicit registry branch. The old
`VoAPI` definition must remain in the New API-family compatibility bucket.

Detection should be deployment-neutral and should prefer backend request
signatures over rendered-page or temporary-window signals. In particular, do
not make `demo.voapi.top`, `VoAPI公益站`, or the demo route titles the primary
contract for recognizing this backend.

Recommended detection order:

1. Parse URL/domain only as a cheap sanity step. Known hostnames may be used as
   positive evidence for official or configured deployments, but hostname
   matching must not be required for self-hosted VoAPI v2 instances.
2. Run direct API signature probes before fetching rendered/original titles and
   before any temp-window-only title path. These probes should use ordinary
   fetch with `credentials: "omit"`, no dashboard JWT, no cookies, no extension
   auth headers, and no mutation. Candidate probes:
   - `GET /api/user/info`
   - optionally `GET /api/keys/template` as a confirming second protected
     endpoint when the first result is ambiguous
3. Recognize the VoAPI v2 unauthenticated protected-endpoint signature as a JSON
   response with a numeric `code`, `data: null`, and an auth failure message such
   as `Unauthorized` or `Auth expire`; the observed demo currently returns HTTP
   403 with `{ code: 2, data: null, msg: "Unauthorized", rid }` for these
   no-auth probes. Treat this as a backend fingerprint, not as an account auth
   failure during site detection.
4. Use content-session evidence from
   `JSON.parse(localStorage.getItem("userStore"))` with a usable `auth.token`
   as a strong logged-in-page signal during account completion or current-tab
   onboarding.
5. Use page title patterns only as a fallback or supporting signal. If used, the
   pattern must be specific to the observed v2 title, such as an exact
   `/(^| - )VoAPI公益站$/`-style matcher, rather than a broad `VoAPI` matcher.
6. Run the old New API-family `VoAPI` compatibility matcher only after the v2
   API signature/content-session checks have had a chance to match.

The implementation should add an explicit VoAPI v2 API-probe helper to
`detectSiteType` instead of relying on `fetchSiteOriginalTitle(...)`, because
the current title helper may open a temporary browser context before falling
back to direct fetch. Temp-window title detection remains useful for WAF-heavy
HTML pages, but it should not be the first-class recognition path for this
backend.

The narrow first version can implement this as a dedicated
`detectVoApiV2FromProtectedEndpoint(...)` helper, similar in spirit to the
current Sub2API endpoint probe. If the implementation broadens this pattern for
future self-hosted backends, add a typed backend-signature/probe field to
`AccountSiteDetectionMetadata`; otherwise keep the VoAPI v2 probe local to
`detectSiteType` to avoid over-generalizing before a second backend needs the
same metadata shape.

Recommended `getAccountSiteType(url)` order after adding VoAPI v2:

1. exact configured domain rules;
2. safe backend signature probes, including VoAPI v2 and existing Sub2API;
3. original-title matching, including the precise VoAPI v2 title fallback;
4. New API-family compatible auth-error fallback.

If domain rules return old `VoAPI` for a known old deployment, keep that result.
For unknown/self-hosted domains, the VoAPI v2 backend probe must run before the
old broad `VoAPI` title matcher.

The implementation must avoid broad title matching that would steal old `VoAPI`
deployments from the existing New API-family bucket. Route strings such as
`/dash`, `/keys`, `/checkIn`, and `?_userMenuKey=...` are useful positive
evidence, but the current account-site metadata registry does not project
route-based detection rules. Do not rely on route matching unless the
implementation explicitly adds that metadata and tests it.

Required detection tests:

- a self-hosted/custom origin such as `https://example.invalid` with the VoAPI
  v2 API signature maps to `voapi-v2`; do not use the real demo hostname in
  this test;
- a direct no-auth `GET /api/user/info` probe returning the VoAPI v2 protected
  endpoint envelope maps to `voapi-v2` without calling the title/temp-window
  path;
- a direct authenticated `GET /api/user/info` probe with raw authorization and
  account-data fields is treated as a strong VoAPI v2 confirmation when the
  caller already has a content-session JWT;
- an inconclusive or unavailable VoAPI v2 API probe falls back to the existing
  title and New API-family probes without throwing;
- `VoAPI公益站` plus a v2 content-session result maps to `voapi-v2`;
- a custom title plus a v2 content-session result maps to `voapi-v2`;
- `VoAPI公益站` title alone must not be the only required proof for
  self-hosted recognition;
- old `VoAPI` title-only compatibility signals still map to old `VoAPI`;
- old `voapi-user` compatible auth-error signals still map to old `VoAPI`;
- the v2 content-session extractor runs before the generic compatible
  `localStorage.user` extractor so the JWT is not lost.

### 2. Raw Token Support In `fetchApi`

Extend the transport types:

```ts
export const API_AUTH_TOKEN_MODES = {
  Bearer: "bearer",
  Raw: "raw",
} as const

export type ApiAuthTokenMode =
  (typeof API_AUTH_TOKEN_MODES)[keyof typeof API_AUTH_TOKEN_MODES]

export interface FetchApiOptions {
  endpoint: string
  options?: RequestInit
  responseType?: TempWindowResponseType
  tempWindowFallback?: TempWindowFallbackAllowlist
  currentTabTransport?: "prefer" | "disabled"
  authTokenMode?: ApiAuthTokenMode
}
```

`createRequestHeaders(...)` should default to Bearer:

```ts
if (auth.accessToken) {
  headers["Authorization"] =
    authTokenMode === "raw"
      ? auth.accessToken
      : `Bearer ${auth.accessToken}`
}
```

The option is request-scoped, not stored-account scoped. This keeps storage
stable and avoids making every account auth consumer understand a
backend-specific header format.

Tests should prove:

- existing callers still send `Authorization: Bearer <token>` by default;
- `authTokenMode: "raw"` sends `Authorization: <token>`;
- caller-provided headers still follow the existing override rules;
- cookie-auth behavior remains unchanged.

### 3. VoAPI v2 Service Module

Create a dedicated backend module:

```text
src/services/apiService/voapiV2/
```

It should own:

- endpoint constants;
- raw-token `fetchVoApiV2Data(...)` wrapper;
- `{ code, data?, msg?, message?, token? }` envelope parsing;
- account balance normalization;
- key inventory and key mutation normalization;
- check-in status and submit normalization;
- redaction-safe logging helpers if needed.

The local fetch wrapper should use the shared transport:

```ts
fetchApi<unknown>(
  request,
  {
    endpoint,
    options,
    authTokenMode: "raw",
  },
  true,
)
```

Envelope parsing should treat `code === 0` as success. It must support both
ordinary data envelopes and VoAPI v2's reveal response where the secret is in
top-level `token` instead of `data`. Non-zero `code`, missing `data` or `token`
where required, HTTP failures, and invalid JSON should become `ApiError`
instances with local fallback messages. `code === 2` and an auth-expired
message should be classified as a session-expired/auth failure, not as an
unknown backend error.

### 4. Account Balance Mapping

The first implementation should normalize `/api/user/info` into
`AccountData`.

Confirmed mapping rules:

- parse `basicBalance`, `bindBalance`, `usedBasicBalance`, and
  `usedBindBalance` as decimal strings;
- treat those decimal strings as USD/display-currency amounts for the
  extension's existing quota model and convert them to internal quota points
  with `UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR` (`500000`, USD to quota);
- `quota`: convert `basicBalance + bindBalance` to internal quota points as the
  usable balance shown by the dashboard, unless a later backend contract proves
  only one balance bucket is usable for runtime requests;
- `today_quota_consumption`: sum
  `/api/dash/statistics` aggregate `data.d.usedBasicBalance` and
  `data.d.usedBindBalance` for a current-day time window when the endpoint is
  available, then convert the decimal amount to internal quota points;
- `today_requests_count`: use `/api/dash/statistics` aggregate
  `data.d.requests` for a current-day time window when available;
- `today_prompt_tokens`: `0` unless a stable daily prompt-token field is
  identified;
- `today_completion_tokens`: `0` unless a stable daily completion-token field
  is identified;
- `today_income`: `0`;
- `checkIn.enableDetection`: preserve saved setting, but site status should be
  populated from the VoAPI v2 check-in endpoints when enabled.

Do not map lifetime `usedBasicBalance` or `usedBindBalance` into "today"
fields from `/api/user/info`. Those fields are lifetime balances, not daily
usage.

Numeric policy:

| Source field | Backend unit | Internal field | Conversion |
| --- | --- | --- | --- |
| `basicBalance`, `bindBalance` | decimal amount string in `currency` | `quota` | sum, clamp invalid values to `0`, multiply by `CONVERSION_FACTOR`, round to nearest integer |
| `usedBasicBalance`, `usedBindBalance` from `/api/user/info` | lifetime decimal amount string | no daily mapping | do not use for today fields |
| `data.d.usedBasicBalance`, `data.d.usedBindBalance` from `/api/dash/statistics` | time-window decimal amount string | `today_quota_consumption` | sum, clamp invalid values to `0`, multiply by `CONVERSION_FACTOR`, round to nearest integer |
| key `amount`, key `used` | decimal amount string | `remain_quota`, `used_quota` | multiply by `CONVERSION_FACTOR`, round to nearest integer |

When writing key quota values back to VoAPI v2, divide internal quota points by
`CONVERSION_FACTOR` and serialize the amount as a decimal string. Keep
`expired_time < 0` mapped to VoAPI v2's non-expiring sentinel if the UI sends
one; otherwise send the epoch-millisecond `expireTime` expected by the backend.
For current-day statistics, use a local current-day start/end window consistent
with the dashboard's `s`/`e` millisecond timestamp query parameters. If the
statistics endpoint fails, return zeroed today fields instead of failing the
whole account refresh. Honor `includeTodayCashflow === false` by skipping the
statistics call and returning zeroed today fields.

### 5. API Key Management

The adapter should provide key-management and token-provisioning capabilities
using the confirmed VoAPI v2 key endpoints.

Known inventory mapping:

- `id` -> token id;
- `name` -> token name;
- `tokenMasked` -> masked key field;
- `enable: true` -> `status: 1`; `enable: false` -> `status: 2`;
- `expireTime` -> `expired_time` after converting epoch milliseconds to epoch
  seconds for the shared `ApiToken` shape;
- `amount` -> `remain_quota` after decimal-amount-to-quota conversion;
- `used` -> `used_quota` after decimal-amount-to-quota conversion;
- `groups` -> `group` by selecting the first group name/id that can be
  represented in the existing single-group product model;
- missing `user_id` -> default to `request.auth.userId` when available,
  otherwise `0`;
- missing model/IP fields -> default `model_limits_enabled: false`,
  `model_limits: ""`, and `allow_ips: ""`;
- `DeletedAt` -> `null`.

Template mapping:

- `groups`: build user-group choices from `id`, `name`, `ratio`, `timeRatio`,
  `chargingType`, `subBalanceType`, and `note` where the existing product
  model has matching fields;
- `models`: use `idKey` as the model id and preserve enabled/hidden state when
  mapping available-model options;
- `ssb`: preserve as a backend flag if a product caller needs it later, but do
  not invent UI behavior around it in the first implementation.

Mutation contract:

- create: translate `CreateTokenRequest` to `POST /api/keys` with:
  - `name`: `tokenData.name`;
  - `groups`: an array containing the selected numeric VoAPI v2 group id
    resolved from `tokenData.group`;
  - `amount`: decimal string converted from `tokenData.remain_quota`;
  - `genCount`: `1`;
  - `enable`: `true`;
  - `expireTime`: epoch milliseconds converted from `tokenData.expired_time`;
  success is `HTTP 200 { code: 0, data: null }`;
- update: translate `CreateTokenRequest` to `PUT /api/keys/{id}` with `id`,
  `name`, `groups`, `enable`, `expireTime`, `amount`, preserved `used`, and
  preserved `note`; success is
  `HTTP 200 { code: 0, data: null }`;
- enable/disable: use the same update endpoint with `enable: true|false`;
- reveal: `POST /api/keys/{id}/token` with no body returns
  `HTTP 200 { code: 0, token }`;
- delete: `DELETE /api/keys/{id}` returns `HTTP 200 { code: 0, data: null }`.

Create does not return the full secret. `resolveApiTokenKey` should use the
VoAPI v2 reveal endpoint. It must not fall through to New API-family
`/api/token/{id}/key` behavior. All key CRUD operations must use VoAPI v2
endpoints; do not fall back to New API-family create, update, status, reveal,
or delete routes. No separate reset or rotate endpoint is part of the confirmed
first-version contract.

`fetchAvailableModels(request)` should return enabled, non-hidden
`data.models[].idKey` values from `/api/keys/template`. `userGroups.fetch`
should map `data.groups` into the existing `Record<string, UserGroupInfo>`
shape by using the stringified backend group id as the key and exposing `ratio`
plus `note` as `desc` where possible. Because the existing create form has only
one `group` field, first-version writes should resolve that selected id/name
back to the backend group id and submit a single numeric id in `groups`.
Multi-group create can be added later only if the product form grows an
explicit multi-group selection.

VoAPI v2 unlimited quota behavior is not confirmed. First-version
token-provisioning should reject `tokenData.unlimited_quota === true` with a
local unsupported-field error instead of guessing an `amount` sentinel.

### 6. Check-In

The adapter should support built-in check-in with the VoAPI v2 check-in
endpoints.

Known read endpoints:

- `/api/check_in/template`
- `/api/check_in/stats`
- `/api/check_in?year=<year>&month=<month>`

Expected submit endpoint:

```http
POST /api/check_in
```

Known response shapes:

- `GET /api/check_in/template`: `data.consecutiveBonus`,
  `data.notice`, and `data.now`;
- `GET /api/check_in/stats`: `data.consecutiveDays`, `currentDayNo`,
  `monthCount`, `monthTotal`, `nextAmount`, `nextBonus`,
  `nextConsecutiveNo`, `todayRecord`, `todaySigned`, and `totalCount`;
- `GET /api/check_in?year=<year>&month=<month>`: array of records with `id`,
  `created`, `updated`, `uid`, `ymd`, `amount`, `consecutiveNo`, and
  `bonusAmount`.

Submit contract:

- `POST /api/check_in`;
- no request body;
- `Content-Type: application/json` is accepted even with an omitted/empty body,
  so VoAPI v2 does not require a transport option to suppress the default JSON
  content type for this route;
- raw JWT authorization;
- success response is `HTTP 200 { code: 0, data: { amount, bonusAmount } }`;
- repeated same-day submit is `HTTP 200 { code: 1, msg: "Signed in today" }`;
- after success, `GET /api/check_in/stats` reports `todaySigned: true` and a
  `todayRecord`; `/api/user/info.bindBalance` increases by the signed
  `amount`.

The first check-in implementation should be API-based. Do not click the page's
native check-in button unless a later probe proves the API route cannot be used
reliably.

Parser code should accept the successful amount response and should refetch
stats after submit, so final status confirmation does not rely solely on the
submit body. The duplicate-sign-in response should be classified as
already-checked rather than as an unknown failure.

Check-in submit is currently owned by the auto-checkin provider layer, not by
account-data adapters alone. Implementation should either add a VoAPI v2
provider to the existing `resolveAutoCheckinProvider(...)` map or introduce an
explicit adapter-backed check-in submit seam before wiring scheduled/manual
submit. Status reads can remain in the VoAPI v2 account-data service.

### 7. Account Completion And Browser Session

Auto-detection should read the dashboard JWT from page storage through the
existing account-site onboarding/content-session path where possible.

Add a dedicated VoAPI v2 content-session extractor before the generic
compatible `localStorage.user` extractor. The generic compatible extractor can
see `localStorage.user`, but it cannot supply the VoAPI v2 JWT. If it runs
first, account completion may receive identity without the required
`accessToken`.

Recommended content-session extractor behavior:

- detect `JSON.parse(localStorage.getItem("userStore")).auth.token`;
- return `siteTypeHint: SITE_TYPES.VO_API_V2` when the token is present, even
  if the earlier URL/title detection result was `UNKNOWN` or old `VoAPI`;
- normalize the token as `accessToken`;
- extract identity from `localStorage.user.id`, `localStorage.user.username`,
  `localStorage.user.display_name`, and `localStorage.user.email` when present;
- optionally read `userStore.auth.email`, `phone`, `role`, and `registerTime`
  as supporting metadata, but do not treat those fields as the account access
  token;
- avoid returning `localStorage.user.access_token` when it is `null`;
- never log the token or raw localStorage payload.

`accountCompletion` should:

- require a non-empty detected access token;
- require a non-empty stored account id, derived from `localStorage.user.id`
  when present or from `/api/user/info.id` as a fallback;
- derive saved username/display name using this priority:
  `localStorage.user.username`, `localStorage.user.display_name`,
  `localStorage.user.email`, `/api/user/info.username`,
  `/api/user/info.nickname`, then the stored id string;
- classify a missing dashboard JWT as the existing access-token-missing
  completion failure rather than silently falling back to cookie or
  `localStorage.user.access_token`;
- save it into `account_info.access_token`;
- set `authType: AuthTypeEnum.AccessToken`;
- disable cookie auth for the saved account;
- set initial check-in config according to the adapter's verified support.

JWT expiry should be handled as a recoverable account health problem, not as a
refresh-token flow. Because expired JWTs return `HTTP 200 { code: 2, data:
null, msg: "Auth expire" }`, the envelope parser should classify that code as
an auth failure and surface a re-detection or re-login recovery path. The
adapter must not invent Sub2API-style refresh-token storage, refresh locks, or
proactive refresh. It may make one best-effort re-read of the current logged-in
dashboard JWT from browser-session state because logged-in verification found no
stable VoAPI v2 refresh-token field or renewal endpoint.

`refreshAccountData` should not rely on generic `determineHealthStatus` for
this auth-expired case. It should return a VoAPI v2-specific warning/error
health status that tells the product layer the saved dashboard JWT is expired
and the account must be re-detected from a logged-in VoAPI v2 page.

### 8. Site API Key (`voak-*`) Policy

Do not store or use `voak-*` in the first adapter version.

Reason:

- it can read limited site API endpoints such as `/api/user/info`;
- it cannot manage `/api/keys`;
- it cannot use `/api/check_in/*`;
- using it as a fallback would create a confusing partial-success state where
  balance refresh works but key management and check-in fail.

If a future product need requires long-lived balance-only refresh, add an
explicit secondary credential design instead of hiding it in
`account_info.access_token`.

## Open Protocol Facts

These facts affect edge behavior or numeric fidelity and can be resolved
during implementation or by a later safe probe:

- deployment variance across self-hosted VoAPI v2 instances, especially custom
  branding, localized titles, reverse-proxy status codes, and whether protected
  endpoint auth failures always include `code: 2`;
- whether a future VoAPI v2 release documents a refresh-token contract; the
  current verified contract has no refresh-token storage field, cookie, or
  renewal endpoint, so first-version implementation must not assume one;
- exact balance-unit and precision rules for converting decimal-string
  balances into the extension's numeric quota model for non-USD `currency`
  deployments;
- whether `basicBalance + bindBalance` is always the runtime-usable balance or
  whether some deployments restrict one bucket;
- whether `consecutiveBonus` can be a non-null array/object and how it should
  map to product copy;
- whether `/api/dash/statistics/tokens` exposes token counts in accounts with
  richer daily data;
- old VoAPI counter-signals if broad title matching ever risks confusing old
  and new deployments.

## Telemetry Decision

Telemetry decision: reuse existing initially.

This slice adds a new site adapter but does not introduce a new product funnel
or settings surface by itself. If implementation adds new visible recovery
actions for expired VoAPI v2 sessions, add privacy-safe result categories at
that point. Do not record URLs, tokens, host paths, raw backend messages, key
names, key ids, or user-entered names.

## Settings Search Decision

Settings search decision: none.

No new settings UI, deep link target, or settings search definition is required
for the first adapter version.

## E2E Decision

E2E decision: no new Playwright E2E by default.

The main implementation risk is adapter protocol mapping and auth-header
formatting, which should be covered by focused Vitest tests. Add Playwright
only if implementation changes browser-session extraction, temp-window
behavior, or extension runtime routing in a way lower-level tests cannot
exercise.

Live Playwright contract probes are exploratory evidence, not retained E2E
tests, unless a later deterministic test can run without private credentials.
Content-session extraction should be covered by focused extractor/unit tests by
default; add E2E only if the implementation changes runtime message routing,
tab selection, or temp-window behavior.

## Testing Strategy

Use TDD for executable implementation.

Focused tests should cover:

- `fetchApi` default Bearer behavior remains unchanged;
- `fetchApi` raw token mode sends the token without a Bearer prefix;
- VoAPI v2 envelope parser accepts `code === 0`, supports top-level `token`
  reveal responses, and rejects non-zero codes with `msg` or `message`;
- VoAPI v2 account-info normalization handles decimal-string balances,
  internal quota conversion, missing optional fields, and invalid response
  shapes;
- VoAPI v2 JWT missing/expired states return useful health status;
- VoAPI v2 JWT expiry does not attempt automatic refresh and does not persist
  any refresh-token-shaped data;
- old `VoAPI` still routes through the existing New API-family behavior;
- `voapi-v2` routes through the new dedicated adapter;
- `voapi-v2` backend API signature detection runs before title/temp-window
  title detection and before old `VoAPI`;
- `voapi-v2` detection works for a custom/self-hosted origin such as
  `https://example.invalid`;
- `voapi-v2` detection runs before old `VoAPI` for `VoAPI公益站`, while old
  `VoAPI` title-only and `voapi-user` compatibility signals still map to old
  `VoAPI`;
- content-session extraction reads `JSON.parse(localStorage.getItem("userStore")).auth.token`
  without using a null `localStorage.user.access_token`, returns
  `siteTypeHint: voapi-v2`, and is registered before the generic compatible
  extractor;
- key inventory normalization handles masked keys and active/inactive state;
- `CreateTokenRequest` maps to VoAPI v2 create/update payloads with group,
  amount, expiration, and unsupported unlimited-quota behavior;
- key creation does not expect a secret in the create response and secret
  resolution uses `POST /api/keys/{id}/token`;
- check-in status parsing handles template, stats, and month-record shapes;
- check-in submit sends an empty-body `POST /api/check_in`, works with the
  default JSON content type, classifies `code: 1` / `Signed in today` as
  already checked, and confirms final state by refetching stats.

Suggested focused validation after implementation:

```powershell
pnpm vitest run tests/services/apiTransport/request.test.ts
pnpm vitest run tests/services/accountSiteOnboarding/contentSession
pnpm vitest run tests/services/apiService/voapiV2
pnpm vitest run tests/services/apiAdapters/voapiV2
pnpm vitest run tests/constants/siteType.test.ts
pnpm compile
pnpm run validate:staged
```

Run `pnpm run validate:push` before pushing or creating a PR because this
adapter will touch shared site-type registries, transport contracts, and
adapter capability wiring.

## Done Criteria

- New VoAPI v2 deployments can be saved as `voapi-v2` accounts.
- Existing old `VoAPI` accounts keep their current New API-family behavior.
- VoAPI v2 authenticated API calls use raw `Authorization: <jwt>`.
- Other token-authenticated backends keep default Bearer behavior.
- Account balance refresh works with useful expired-session feedback.
- Expired VoAPI v2 dashboard JWTs are reported as requiring re-login or
  re-detection; no refresh-token flow is implemented.
- VoAPI v2 decimal amount fields are converted consistently into internal
  quota points.
- API key inventory, create, update, enable/disable, reveal, and delete match
  the confirmed backend contract.
- Check-in status and submit use the confirmed request shapes and verify final
  status through the stats endpoint.
- No `voak-*`, JWT, cookie, or API key secret is logged, committed, or stored
  outside the intended account credential field.
