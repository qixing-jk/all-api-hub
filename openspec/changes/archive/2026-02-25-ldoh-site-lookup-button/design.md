## Context

All API Hub maintains a local list of “accounts” that each point to a specific relay site URL (typically an origin like `https://example.com`). Users also have access to an authenticated directory at `https://ldoh.105117.xyz/` that lists relay sites and provides additional metadata. Today there is no in-extension affordance to quickly jump from an account row to the corresponding LDOH site entry, and manual lookup is slow and error-prone.

Key constraints:
- LDOH requires login; the extension must rely on the user’s existing browser session and must treat missing/expired login as a normal condition.
- The feature must be “quiet”: account list rendering should not cause repeated network requests.
- The UI button must only appear when a match exists in the cached LDOH site list.

## Goals / Non-Goals

**Goals:**
- Load the LDOH site list in a way that works with authenticated sessions.
- Cache the LDOH site list (and optionally derived match results) with a TTL to avoid repeated fetches.
- Match an extension account to a LDOH site using a deterministic, origin-based strategy.
- Render a per-account “View on LDOH” button only when a match is found.
- Open a new tab to LDOH with a deeplink/search parameter so the page filters to the matched site.

**Non-Goals:**
- Implementing an LDOH login flow inside the extension (users log in on the site normally).
- Persisting or syncing any LDOH credentials; no cookie/token storage beyond normal browser behavior.
- Adding a full “LDOH directory browser” UI inside the extension (this change only adds a shortcut).
- Perfect fuzzy matching across arbitrary naming schemes (initial scope is URL-origin matching with safe fallbacks).

## Decisions

### 1) Fetch site list via shared fetch pipeline (background first, temp-window fallback)

**Decision:** Fetch the LDOH site list using the shared `fetchApi` helper with cookie-auth semantics. This tries a background `fetch` (with `credentials: "include"`) first, and falls back to the temp-window flow when cookies/session state are not available in the background context.

**Rationale:**
- Reuses the extension’s existing request pipeline and temp-window protection-bypass logic (less bespoke code).
- Keeps same-origin execution as a fallback, avoiding `SameSite`-related cookie issues across browsers.

**Alternatives considered:**
- Always use temp-window fetch: reliable but heavier (opens a temp context even when background fetch would work).
- Manually open/reuse an LDOH tab + content-script fetch: reliable but requires custom tab lifecycle management.
- Background-only `fetch("https://ldoh.105117.xyz/…", { credentials: "include" })`: simplest, but may not reliably include cookies.

### 2) “Best effort” cache with TTL stored in extension local storage

**Decision:** Store the LDOH directory cache in extension local storage with:
- `version` (for forwards-compatible schema changes)
- `fetchedAt` timestamp
- `expiresAt` timestamp (TTL-based)
- `items` (normalized subset needed for matching + deeplinks)

**Rationale:**
- The button must be conditional and fast; caching prevents network work during list rendering.
- TTL bounds staleness without requiring manual refresh UI.

**Alternatives considered:**
- Always refetch on popup/options open: increases latency and network load; also fails when service worker is short-lived.
- Per-account live search against LDOH: too many requests and directly conflicts with the “quiet rendering” goal.

### 3) Match strategy: normalize to URL origin, then fall back to hostname

**Decision:** Use the account’s configured URL normalized to `origin` (scheme + host + optional port) as the primary match key; if LDOH items do not include scheme, fall back to hostname-only matching.

**Rationale:**
- Origin matching is deterministic and avoids leaking paths/queries.
- Hostname fallback improves robustness if LDOH stores domains without schemes.

**Alternatives considered:**
- Name-based fuzzy matching: ambiguous and language-dependent; may cause incorrect matches.
- Full URL matching including paths: unnecessary and may create false negatives.

### 4) UI: conditional per-account action; no global toggle in first iteration

**Decision:** Add a per-account action (icon button) in account list item actions, only when a match exists. Do not add a settings toggle in the first iteration.

**Rationale:**
- The feature is non-invasive (hidden when unusable) and does not change existing workflows.
- Avoids adding preferences/migrations unless needed.

**Alternatives considered:**
- Always show button but disable when unavailable: adds clutter and invites confusion.
- A global “Enable LDOH integration” toggle: may be added later if users want explicit control.

## Risks / Trade-offs

- **[LDOH endpoint/search param may change]** → Keep constants centralized so updates are localized.
- **[User not logged in / session expired]** → Treat as cache-miss; hide button; optionally surface a one-time toast when the user explicitly tries to refresh.
- **[Cache staleness]** → Use TTL (currently 12 hours) and refresh on-demand (first lookup after expiry) rather than during render.
- **[Cookie/SameSite behavior differs across browsers]** → Prefer same-origin execution inside an LDOH tab; keep a fallback path (open LDOH login page and ask user to log in).
- **[Incorrect matches (hostname collisions)]** → Prefer exact origin matches; only use hostname fallback when unambiguous; otherwise return “no match” and hide the button.
- **[Performance: N accounts require N lookups]** → Pre-normalize cache into an index map (e.g., `origin -> item`) and keep lookups synchronous and cheap.

## Migration Plan

- No data migration required; new storage keys initialize empty on first run.
- Rollout is naturally gated: the button only appears when the cache exists and a match is found.
- Rollback strategy: remove the UI action and ignore cache keys; existing stored cache becomes unused but harmless.

## Resolved Details (Current Implementation)

- **LDOH API endpoint**: `GET https://ldoh.105117.xyz/api/sites` (JSON response with `sites: [...]`).
- **Persisted fields**: `id`, `apiBaseUrl`, optional `name` (stored with `version`, `fetchedAt`, `expiresAt`).
- **Search/deeplink URL**: `https://ldoh.105117.xyz/?q=<hostname>` where `q` is the discovered query parameter and `<hostname>` is lowercased.
- **UI surfaces**: Popup + Sidepanel account list, and Options → Account Management (any surface using `AccountList`/`SiteInfo` under `AccountManagementProvider`).
- **Related UX**: In the Add Account dialog, when auto-detection fails, show a hint + an “Open LDOH site list” link that opens `https://ldoh.105117.xyz`.
- **Cache TTL**: 12 hours by default; no explicit manual refresh UI (a single best-effort background refresh is triggered per provider mount on cache miss/expiry).
