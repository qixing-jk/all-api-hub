# Product Guidance

Read the section that matches the change.

## Dependency selection

- For dependencies bundled with the extension, make size decisive only when measured output, startup, memory, or distribution impact is material; bundled code adds no per-use network request.

## UI primitives

- Use the configured shadcn CLI as the baseline for a new supported primitive (`pnpm shadcn add <component> --yes`), then adapt aliases, exports, design tokens, floating layers, i18n, and project lint requirements. Overwrite an existing baseline only when replacement is in scope.
- Preserve needed generated dependencies; lockfile noise alone is not a reason to reimplement the component.

## Analytics

- For new or materially changed product behavior, decide whether adoption or outcome measurement needs existing telemetry, a new action/result, or a settings snapshot. No new event is needed when existing evidence is adequate; report only material decisions or gaps.
- Record controlled booleans, enums, counts, durations, and status categories. Exclude URLs, hosts, paths, raw IDs, names, credentials, prompts, responses, user-entered text, backend messages, and stack traces.
- Update typed payloads, privacy allow-lists/sanitizers, affected snapshot builders, and focused tests together when analytics fields change. For high-volume passive signals, prefer persisted daily summaries over individual captures.

## Settings search and deep links

- When settings controls are added, renamed, moved, or removed, update their search definitions and deep-link targets together. Relevant owners include `*.search.ts`, `searchTargets.ts`, DOM IDs, URL anchors, and `ANCHOR_TO_TAB`.
- Share target-ID constants between UI and search/navigation. Use focused unit/component coverage for search and anchor contracts; use E2E only for unresolved browser integration risk.

## User-facing errors

- Provide useful local feedback when backend messages are absent or unsuitable, while preserving safe upstream codes/messages that help the affected user recover.
- Private UI and local logs may retain useful diagnostics after redacting credentials, tokens, cookies, session/refresh secrets, authentication payloads, and authentication headers. Telemetry and external reports must not include raw backend messages or secrets.
