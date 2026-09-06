# Repository Guidelines

## Task context

Read only the guidance relevant to the current task; reuse unchanged material already read. These links are task routes, not a startup reading list.

- Site registration, detection, capabilities, authentication, or upstream compatibility: [site integrations](docs/agents/site-integrations.md).
- Dependencies, UI primitives, settings navigation, analytics, or user-facing errors: [product guidance](docs/agents/product.md).
- Translation keys, resources, or language behavior: [i18n guidance](docs/agents/i18n.md). Use `add-app-language` only when adding a supported application language.
- Sponsor catalog changes or audits use the project `sponsor-catalog` skill, not ordinary documentation edits.
- Development setup, test harnesses, or hook troubleshooting: [CONTRIBUTING.md](CONTRIBUTING.md). Commands and versions belong to `package.json`, `.nvmrc`, and hooks.
- Local Markdown specs and tickets: [issue tracker conventions](docs/agents/issue-tracker.md), using `.scratch/<feature>/`; local triage uses [triage labels](docs/agents/triage-labels.md). A supplied GitHub issue remains the task source.
- Domain terminology or architecture decisions: [domain guidance](docs/agents/domain.md) routes to relevant `CONTEXT.md` sections and ADRs.

## Project boundaries

- Keep `src/entrypoints/**` thin; feature UI belongs in `src/features/**`. Shared code must not import options-page entrypoints. Keep React state ownership outside `src/services/**`.
- Use `~/` for `src/` and `~~/` for repo-root imports. Tests belong under `tests/`, not colocated `src/**/__tests__/`; browser workflows live in `e2e/`.

## Development and validation

- Before non-trivial implementation on a feature branch, fetch and check its intended base; refresh the current branch before dependent work using `refresh-stale-branch` when needed. Reuse a current check within the task. Reviews and small edits need no refresh; report refresh blockers and continue independent work.
- Keep incidental cleanup local and low-risk. Explicit cleanup is complete when the agreed surface has no further behavior-preserving improvements with concrete benefit and proportionate validation cost, including newly discovered qualifying work. Report changes requiring expanded scope separately.
- Use targeted or related Vitest checks for affected behavior; use browser E2E when lower-level tests cannot establish the relevant risk. The commit hook does not replace affected-behavior tests. Full suites normally belong to CI; count only workflows that actually ran as validation evidence.
- Let [Git hooks](CONTRIBUTING.md#git-hooks) run their gates once on unchanged relevant state; scripts own their trigger rules.
- Requested PR reconciliation must account for checks and feedback on the current head. Pending remote evidence, including a waiting-cycle timeout, leaves that delivery incomplete.

## Documentation

- Under `docs/docs/`, Chinese is the source; synchronize via `docs_assistant/translate.py`, `.github/workflows/translate-docs.yml`, or scoped manual updates. Finalize source edits first. If affected translated counterparts exist (including root READMEs) and synchronization is undecided, ask once; follow existing decisions directly and report deferred translations separately from source completion.
- Adding or removing documentation pages requires updating locale navigation in `docs/docs/.vuepress/config.js`.
