## Context

Today “cashflow” in All API Hub (today consumption/outcome + today income) is derived from paginated log queries:

- `services/apiService/common/index.ts` calls `fetchTodayUsage()` and `fetchTodayIncome()` inside `fetchAccountData()`
- `services/accountStorage.ts` refreshes accounts via `getApiService(siteType).refreshAccountData(...)`, and persists the returned `today_*` and `today_income` fields into `SiteAccount.account_info`
- Popup + account list UIs read these stored fields to render today stats (e.g., `entrypoints/popup/components/BalanceSection/AccountBalanceSummary.tsx`, `features/AccountManagement/components/AccountList/BalanceDisplay.tsx`)

These log-derived queries can be slow, noisy, or error-prone (rate limits / upstream instability). Some users primarily want check-in automation/detection and consider today cashflow data unnecessary clutter. This change adds a user-facing switch that disables displaying today cashflow and prevents the related network requests.

## Goals / Non-Goals

**Goals:**

- Provide a persisted preference to disable today cashflow display across the extension.
- When disabled, skip all network requests used solely to compute today cashflow (including tokens/requests derived from consume logs and income derived from topup/system logs).
- Keep check-in related functionality intact (auto check-in, check-in status detection).
- Maintain backward compatibility: existing users keep current behavior (today cashflow enabled by default).
- Keep sorting/aggregates coherent when today cashflow is disabled (avoid stale/misleading numbers).

**Non-Goals:**

- Implement a full “check-in-only mode” that disables all balance/quota data and refresh logic.
- Add “clear usage history” / “wipe history” functionality.
- Change usage-history analytics/sync behavior (`services/usageHistory/**`).
- Introduce new backend endpoints or alter upstream protocols.

## Decisions

1. **Preference shape and defaults**
   - Add a boolean preference (e.g., `showTodayCashflow: boolean`) to `services/userPreferences.ts` with default `true`.
   - Missing value in stored preferences MUST be treated as `true` via defaults/migration (to preserve existing behavior).
   - Expose the flag via `contexts/UserPreferencesContext.tsx` so UI can reactively hide/show sections.

2. **Where the toggle lives (UI)**
   - Add a toggle in the Options “Basic Settings” area (consistent with other global switches like logging/auto refresh).
   - Copy should clarify this disables today consumption/income display and skips the related fetches (so users understand it affects refresh behavior).
   - When turning OFF, if the current sort field is `consumption` or `income`, automatically fall back to `balance` (or another non-cashflow field) to avoid “sorting by a hidden metric”.

3. **Skip log fetches at the source**
   - Extend `ApiServiceAccountRequest` (and the corresponding `refreshAccountData` call chain) with an option such as `includeTodayCashflow?: boolean` (defaulting to `true`).
   - In each API service implementation (`common`, `wong`, `anyrouter`, `veloera`), gate the expensive calls:
     - If `includeTodayCashflow !== false`: keep current behavior (fetch quota + today usage + today income + optional check-in status).
     - If `includeTodayCashflow === false`: fetch quota + optional check-in status only, and return zeros for `today_*` + `today_income` fields without calling paginated log APIs.
   - Rationale: this ensures we prevent the network requests (not just hide UI) and keeps behavior consistent across site types.

4. **Orchestrating the flag in refresh flows**
   - `services/accountStorage.ts` reads user preferences once per refresh operation and passes `includeTodayCashflow` into every `refreshAccountData` request.
   - Rationale: all refresh entry points (manual refresh, refresh-on-open, background/auto-refresh) reuse the same accountStorage API, so gating here gives consistent behavior.

5. **Persisted data semantics when disabled**
   - When today cashflow is disabled, account refresh persists today fields as zeros (`today_quota_consumption`, `today_prompt_tokens`, `today_completion_tokens`, `today_requests_count`, `today_income`).
   - Rationale: avoids stale “today” numbers resurfacing if UI is partially shown somewhere, and makes re-enabling behavior explicit (the next refresh repopulates).

6. **UI rendering strategy**
   - Popup summary: hide the “today consumption” and “today income” blocks when disabled; keep total balance unchanged.
   - Account list: hide the today consumption/income columns in the header and per-row `BalanceDisplay` today stats section when disabled; disable any click-to-refresh affordances tied to cashflow.
   - Any totals/filtered summaries that reference today consumption/income should also hide/adjust when disabled.

## Risks / Trade-offs

- **[Risk] Hidden sort fields lead to confusing ordering** → Mitigation: auto-fallback sort when toggling OFF; prevent selecting cashflow sort fields while disabled.
- **[Risk] Some code paths may still assume today stats are always fetched** → Mitigation: keep numeric fields present (zeros) to maintain type contracts; add tests to ensure no log fetch calls happen when disabled.
- **[Risk] Multi-site behavior divergence** → Mitigation: implement the same `includeTodayCashflow` gating across all site-type API service overrides that implement `refreshAccountData`.
- **[Trade-off] Re-enabling shows zeros until next refresh** → Acceptable; re-enabling should prompt the user to refresh (or the next scheduled refresh will repopulate).

## Migration Plan

1. Add `showTodayCashflow` to `UserPreferences` + `DEFAULT_PREFERENCES` (default `true`).
2. Update preferences migration/versioning so existing installs treat missing `showTodayCashflow` as `true`.
3. Add UI toggle (Options → Basic Settings) and i18n keys in `locales/**`.
4. Thread `includeTodayCashflow` through account refresh:
   - `services/accountStorage.ts` reads preference and passes the flag.
   - Update API service request types + `fetchAccountData` implementations to gate log fetches.
5. Add tests (service-level + component-level) to prevent regressions.
6. Ship and monitor: ensure no new errors in refresh flows and check-in continues to work as expected.

## Open Questions

- Should we also hide/disable any “today tokens / request count” UI if it exists outside the current cashflow surfaces (since it shares the same consume-log fetch)?
- Do we need a small UI hint (e.g., “Today stats disabled”) to explain why the section is missing, or is full removal preferred?
