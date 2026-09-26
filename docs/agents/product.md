# Product Guidance

Read the section that matches the change.

## Dependency selection

- For dependencies bundled with the extension, make size decisive only when measured output, startup, memory, or distribution impact is material; bundled code adds no per-use network request.

## UI primitives

- Use the configured shadcn CLI as the baseline for a new supported primitive (`pnpm shadcn add <component> --yes`), then adapt aliases, exports, design tokens, floating layers, i18n, and project lint requirements. Overwrite an existing baseline only when replacement is in scope.
- Preserve needed generated dependencies; lockfile noise alone is not a reason to reimplement the component.

## Options page motion

- Sidebar pages already share `src/features/OptionsMenu/OptionsPageTransition.tsx`. Reuse that boundary instead of adding entrance/exit animations to each page. Direction follows the sidebar order; timing, reduced motion, and loading transitions stay centralized.
- Direct page blocks are selected automatically. Shared `PageHeader` and `Card` containers remain whole visual units. For nested layouts, mark a wrapper with `data-page-motion-group` to expose its immediate blocks; mark a major block with `data-page-motion-item` to keep its contents together. Group traversal is bounded to avoid animating deep control trees.
- For independently animated list cards, use `data-page-motion-list` on the list and `data-page-motion-item` on each row. Only rows intersecting the viewport participate; a long list must not create animations for every record.
- During initial data/layout loading, expose `data-options-page-pending` and remove it when the content is ready. The shared transition waits before entering, shows the loader only after 700 ms, and fades it out before entry. Later data updates do not replay the page entrance.
- If loaded data precedes deferred row rendering, set `data-page-motion-wait-for` to a descendant selector (existing lists use `[data-page-motion-ready-item]`). Keep it absent for empty lists. This render wait is bounded and complements the data-loading marker.
- Keep the native `framer-motion/mini` playback path: it preserves final styles before clearing keyframes. Avoid another animation or CSS transition controlling the same container's transform/opacity concurrently; animate a separate outer container when needed.
- When changing this contract, use the focused browser checks in `e2e/optionsPageMotion.spec.ts`, including fast navigation, refresh, data-heavy cards, scrolled exits, and reduced motion.

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
