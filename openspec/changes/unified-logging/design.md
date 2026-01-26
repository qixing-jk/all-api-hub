## Context

The extension currently logs directly via `console.*` across multiple contexts (background/service worker, content scripts, popup, options, side panel). This creates inconsistent prefixes, inconsistent verbosity, and no single way to control logging. It also increases the risk of leaking sensitive values (tokens/API keys/backups) into the browser console.

The project already has:
- A centralized user preferences system (`services/userPreferences.ts` + `contexts/UserPreferencesContext.tsx`) backed by `@plasmohq/storage`.
- Existing log-sanitization helper(s) such as `utils/sanitizeUrlForLog.ts`.

Constraints:
- Runs in WebExtension environments (MV3 service worker vs MV2 background page), so the logger must work without Node-only APIs.
- Security/privacy: never log secrets; logging must be safe by default.
- Localization: any new user-facing settings need i18n strings.

## Goals / Non-Goals

**Goals:**
- Provide a unified, lightweight logging API with explicit log levels (`debug`, `info`, `warn`, `error`) and consistent prefixing.
- Ensure log emission can be controlled by user preferences (toggle console logging on/off and select the minimum console log level).
- Make logging safe by default via redaction/sanitization (especially tokens/API keys/backups and URLs with query params).
- Replace scattered `console.log` usage with the unified logger across the codebase, choosing appropriate levels.
- Add automated tests that cover log gating (preference + level) and redaction behavior.

**Non-Goals:**
- Persistent log storage, log export, or “send diagnostics” flows.
- Remote telemetry / server-side log ingestion.
- Introducing a heavyweight logging framework that increases bundle size or adds runtime complexity.

## Decisions

1. **Implement an internal logger utility (no new dependency).**
   - Rationale: WebExtension constraints + bundle size; the requirements are simple (leveling, prefixing, gating, redaction).
   - Alternative considered: `pino`/`loglevel`-style dependencies. Rejected due to added dependency surface and limited benefit.

2. **API: `createLogger(scope)` returning leveled methods.**
   - The logger is created per module/feature with a stable `scope` string (e.g., `Content.CloudflareGuard`, `Options.Settings`).
   - Methods: `debug/info/warn/error(message: string, details?: unknown)`.
   - Rationale: keeps call sites ergonomic and makes level choice explicit (solves “everything is console.log”).

3. **Configuration source: user preferences + environment default.**
   - Add a logging preference under the existing `UserPreferences` model (e.g., `logging: { consoleEnabled: boolean; level: "debug" | "info" | "warn" | "error" }`).
   - Default policy:
     - Development builds: console logging enabled with a more verbose level.
     - Production builds: console logging disabled (or set to higher threshold) unless user enables it.
   - Rationale: users can opt-in when troubleshooting; developers still get visibility during development.

4. **Redaction/sanitization happens inside the logger.**
   - Implement a safe serializer that:
     - Redacts known sensitive keys (e.g., `token`, `apiKey`, `adminToken`, `password`, `authorization`, `cookie`).
     - Uses `utils/sanitizeUrlForLog.ts` for URL-like values where possible.
     - Handles circular references without throwing.
   - Rationale: centralizing sanitization avoids “best effort” per-call-site and reduces the risk of secret leakage.

5. **Console is treated as a sink that can be disabled.**
   - When console logging is disabled (or the message is below `level`), the logger must not call `console.*` and must avoid expensive serialization work.
   - Rationale: avoids noisy logs and performance overhead in normal user operation.

6. **When console logging is disabled, all logs are suppressed (including errors).**
   - Rationale: user intent is an explicit “no console logging” mode; error logs must not bypass that switch.

7. **Logs include standardized per-context prefixes in addition to module scope.**
   - The logger output MUST include an extension context prefix (e.g., Background, Content, Popup, Options, SidePanel) plus the module scope.
   - Rationale: simplifies debugging across multi-context WebExtension architecture and makes logs easier to correlate.

## Risks / Trade-offs

- **[Missing diagnostics when disabled]** → Mitigation: provide a clear options toggle; set development defaults to enabled; document how to enable for support.
- **[Performance overhead from serialization]** → Mitigation: gate by level/config before formatting/serializing details.
- **[Preference migration complexity]** → Mitigation: extend `DEFAULT_PREFERENCES`, keep backwards compatibility via deep-merge defaults, and add tests around preference loading.
- **[Redaction gaps]** → Mitigation: maintain an allow/deny-list of sensitive keys and add regression tests with representative secrets.

## Migration Plan

1. Add new `UserPreferences.logging` fields with sensible defaults and ensure existing stored preferences are merged safely.
2. Implement logger utility + redaction helpers + unit tests.
3. Update key hotspots first (places with frequent logs or potential secret leakage), then replace remaining `console.*` usage across `entrypoints/`, `services/`, and `utils/`.
4. Add options UI controls for logging (toggle + level) with i18n strings; verify the setting propagates across contexts.
5. Add lint guardrails (if appropriate) to prevent new direct `console.*` usage outside the logger/tests.

Rollback strategy: revert call sites to `console.*` and remove the logger preference fields; preference defaults ensure the change is safe even if partially rolled out.

## Open Questions

- (Resolved) Error logs bypass toggle? **No** — disabling console logging suppresses all levels, including `error`.
- (Resolved) Standardize per-context prefixes? **Yes** — logs include a standardized context prefix in addition to module scope.
