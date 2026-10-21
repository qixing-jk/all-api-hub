# Repository Guidelines

## Agent skills

### Issue tracker

Issues and specs for this repo live as local Markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default canonical triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: read root `CONTEXT.md` and root `docs/adr/` when present. See `docs/agents/domain.md`.

## Task context

Read only the guidance relevant to the current task; reuse unchanged material already read. These links are task routes, not a startup reading list.

- Adding or extending account/managed site support, improving a native editor or comparing its UX, adding site-specific check-in, or deciding site-type boundaries: use the project [`add-site-integration` skill](.agents/skills/add-site-integration/SKILL.md) and only its relevant workflow references. The [integration guide](docs/agents/site-integrations.md) explains type relationships, links upstream material and locates code/documentation owners; for an isolated bug fix, start with the owning adapter and tests.
- Dependencies, UI primitives, settings navigation, analytics, or user-facing errors: [product guidance](docs/agents/product.md).
- Persistent stores, storage keys, or writes that cross extension contexts: [storage guidance](docs/agents/storage.md).
- Translation keys, resources, or language behavior: [i18n guidance](docs/agents/i18n.md). Use `add-app-language` only when adding a supported application language.
- Sponsor catalog changes or audits use the project `sponsor-catalog` skill, not ordinary documentation edits.
- Live extension UI automation, real accounts, desktop CDP, or Android Firefox/Edge/Lemur diagnostics and hot updates: use project skill `live-extension-ui-automation`.
- Development setup, test harnesses, or hook troubleshooting: [CONTRIBUTING.md](CONTRIBUTING.md). Commands and versions belong to `package.json`, `.nvmrc`, and hooks.
- For local E2E, live E2E, or CDP environment configuration, use the shared Node loader in `scripts/utils/local-env.mjs`: primary worktree `.env.local` supplies defaults below current-worktree files and explicit environment variables. Locate the primary checkout through Git rather than its branch name; do not duplicate shared credentials into linked worktrees. See [local tooling configuration](CONTRIBUTING.md#local-tooling-environment-configuration) for overrides and diagnostics. WXT retains its native mode/browser env loading.

## Project boundaries

- Keep `src/entrypoints/**` thin; feature UI belongs in `src/features/**`. Shared code must not import options-page entrypoints. Keep React state ownership outside `src/services/**`.
- Prefer existing patterns and shared owners. When verified common behavior would otherwise be duplicated, extract or extend the smallest suitable shared layer and use it from the affected callers; keep provider-specific protocol and policy differences explicit. Base abstractions on concrete contracts and consumers rather than speculative future reuse.
- Use `~/` for `src/` and `~~/` for repo-root imports. Tests belong under `tests/`, not colocated `src/**/__tests__/`; browser workflows live in `e2e/`.

## Development and validation

- Before non-trivial implementation on a feature branch, fetch and check its intended base; refresh the current branch before dependent work using `refresh-stale-branch` when needed. Reuse a current check within the task. Reviews and small edits need no refresh; report refresh blockers and continue independent work.
- Keep incidental cleanup local and low-risk. Explicit cleanup is complete when the agreed surface has no further behavior-preserving improvements with concrete benefit and proportionate validation cost, including newly discovered qualifying work. Report changes requiring expanded scope separately.
- Use targeted or related Vitest checks for affected behavior; use browser E2E when lower-level tests cannot establish the relevant risk. The commit hook does not replace affected-behavior tests. Full suites normally belong to CI; count only workflows that actually ran as validation evidence.
- Before completing implementation, follow [automated task acceptance](docs/agents/task-acceptance.md): account for every task-owned behavior change, run the applicable checks, and provide linked evidence. Retain before/after evidence for developer review when a comparable baseline is available. Agents prioritize representative final results, reuse prior review, and open baseline/comparison/diff images only to answer a concrete question; do not reload images after every small edit. Report evidence gaps explicitly.
- Let [Git hooks](CONTRIBUTING.md#git-hooks) run their gates once on unchanged relevant state; scripts own their trigger rules.
- Requested PR reconciliation must account for checks and feedback on the current head. Pending remote evidence, including a waiting-cycle timeout, leaves that delivery incomplete.

## Documentation

- Under `docs/docs/`, Chinese is the source; synchronize via `docs_assistant/translate.py`, `.github/workflows/translate-docs.yml`, or scoped manual updates. Finalize source edits first. If affected translated counterparts exist (including root READMEs) and synchronization is undecided, ask once; follow existing decisions directly and report deferred translations separately from source completion.
- When a public catalog's supported entries, names, links, introductions, ordering, or support boundaries change, synchronize `docs/docs/supported-sites.md` and/or `docs/docs/supported-export-tools.md`, their `en/` and `ja/` counterparts, and the root compatibility lists in `README.md`, `README_CN.md`, and `README_JA.md`. Follow [public catalog conventions](docs/agents/site-integrations.md#public-catalog-conventions), including popularity order and evidence; capability-only changes do not require catalog edits when those contents remain accurate.
- Adding or removing documentation pages requires updating locale navigation in `docs/docs/.vuepress/config.js`.
