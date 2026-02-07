## Context

All API Hub already refreshes and persists, per account:

- remaining quota/balance (`account_info.quota`)
- today outcome (`account_info.today_quota_consumption`, from consume logs)
- today income (`account_info.today_income`, from topup/system logs)

These fields are computed during `accountStorage.refreshAccount()` via the site API service layer and saved into account storage. Today statistics can be disabled via the `showTodayCashflow` preference, which gates the log pagination requests via `includeTodayCashflow`.

The repo also already has:

- alarm-based background schedulers (auto check-in, usage-history sync, WebDAV sync)
- an ECharts-based analytics page (`UsageAnalytics`) with filters and time-range selection

This change introduces a new “Balance History” page and a dedicated daily snapshot store to support long-range visualization of balance/income/outcome (using upstream “real” refresh data, not inferred formulas).

## Goals / Non-Goals

**Goals:**

- Persist a lightweight per-account **daily snapshot** for balance/income/outcome with a capture timestamp.
- Make the capability **opt-in** via a global preference (disabled by default).
- Keep the snapshot **best-effort up-to-date** by:
  - updating the snapshot whenever a normal refresh succeeds
  - optionally attempting an additional **end-of-day capture** via alarms (when enabled and supported)
- Provide a dedicated Options page to **visualize** historical daily data with filters and time range selection.
- Provide a **retention** setting with a safe default and automatic pruning.
- Respect existing `showTodayCashflow` behavior and clearly communicate prerequisites for collecting income/outcome history.

**Non-Goals:**

- Do not change existing “today income/outcome” semantics in popup/account list.
- Do not implement inferred income formulas (e.g., balance-delta-based estimation) in this change.
- Do not backfill long history by re-querying past logs from upstream (keep network costs bounded).
- Do not implement cross-device sync/export for the new store in this change.

## Decisions

0. **Opt-in feature flags**
   - Add a `balanceHistory.enabled` preference (default: `false`) to gate all snapshot recording and visualization behavior.
   - Add a separate `balanceHistory.endOfDayCapture.enabled` preference (default: `false`) to gate alarm scheduling + scheduled refresh runs.
   - Rationale: keep network and storage costs zero unless the user explicitly enables the feature.

1. **Separate storage service + schema**
   - Create a new local-storage blob dedicated to daily snapshots (separate from `site_accounts`).
   - Include a schema version and sanitize on read, similar to `services/usageHistory/storage.ts`.
   - Rationale: avoid growing and locking the account list payload, and keep history-specific retention/pruning isolated.
   - Alternatives considered:
     - Embed history into each `SiteAccount`: rejected due to payload size growth and higher write contention.

2. **Daily bucket key + minimal record**
   - Key snapshots by **local calendar day** (`YYYY-MM-DD`) and `accountId`.
   - Persist only daily aggregates needed for charts: `quota`, `today_income`, `today_quota_consumption`, `capturedAt`, and a `source`.
   - Rationale: minimal storage footprint enables long retention while remaining privacy-safe (no raw logs).
   - Alternatives considered:
     - Store multiple intra-day points: deferred; start with daily to meet visualization goals.

3. **Capture pipeline: refresh-driven + optional end-of-day alarm**
   - Hook snapshot upserts to successful account refreshes **only when `balanceHistory.enabled=true`**.
   - Refresh-driven capture MUST respect `showTodayCashflow` (i.e., it must not force log pagination requests just for history).
   - When `balanceHistory.endOfDayCapture.enabled=true`, schedule a daily alarm near end-of-day to trigger a one-off refresh and snapshot upsert for all accounts, improving “day close” accuracy.
   - The scheduled end-of-day capture SHOULD force `includeTodayCashflow=true`, providing an explicit opt-in way to collect income/outcome history even when `showTodayCashflow` is disabled.
   - Rationale: best-effort accuracy without requiring users to keep the Options page open.
   - Alternatives considered:
     - Only capture on refresh: rejected because it can miss entire days for inactive users.
     - Periodic interval capture: rejected in MV3 because timers are unreliable; alarms are the preferred scheduler.

4. **Retention and pruning**
   - Add a dedicated preference (e.g., `balanceHistory.retentionDays`) with a default (e.g., 365).
   - Prune snapshots older than the retention window:
     - on writes (post-upsert)
     - on retention setting changes
   - Rationale: prevent unbounded storage growth while still supporting long-range trends.

5. **Options UI integration**
   - Add a new Options menu item id (e.g., `balanceHistory`) and a new page component.
   - Use ECharts (existing wrapper) to render:
     - balance trend (line)
     - daily income/outcome (bars)
   - Provide filters consistent with existing patterns:
     - account selection (and tag filter if available)
     - date range selection constrained by the retention window
     - manual “Refresh now” action to update today’s point
   - When `showTodayCashflow` is disabled and end-of-day capture is disabled, show a clear in-page recommendation to enable either `showTodayCashflow` or end-of-day capture to populate income/outcome history.

## Risks / Trade-offs

- **[Alarm may not fire / device offline]** → Gaps or stale “end of day” points.
  - Mitigation: also upsert on normal refresh; show `capturedAt` and do not imply completeness when data is missing.
- **[Today stats gated by `showTodayCashflow`]** → Scheduled capture might otherwise record zeros for income/outcome.
  - Mitigation: force `includeTodayCashflow=true` for the daily capture run (only once/day).
- **[Manual balance override]** → Stored quota may be user-entered, potentially misleading trends.
  - Mitigation: treat snapshots as “what the UI shows”; optionally flag overridden accounts in the chart legend/tooltips.
- **[Storage growth]** → Many accounts * long retention increases local storage usage.
  - Mitigation: default retention + pruning; store only one record per day per account.
