---
name: add-app-language
description: Add a supported application language or regional locale to all-api-hub across application and extension runtimes. Not for ordinary translation-copy edits.
---

# Add App Language

## Core principle

Treat a new language as a cross-runtime compatibility feature. Define one locale contract, then make application resources, browser manifests, auxiliary locale libraries, and tests agree with it.

## Workflow

1. Establish the current baseline and locale contract.
   - Run `git status --porcelain` and preserve unrelated work and index state.
   - Inspect `src/constants/i18n.ts`, `src/utils/i18n/`, `src/components/LanguageSwitcher.tsx`, `i18next.config.ts`, `src/locales/`, `src/public/_locales/`, `tests/utils/i18nLocaleValidation.test.ts`, and nearby language-specific tests.
   - Search for locale-keyed runtime data and fallback resolvers outside `src/locales/`, including public JSON. Use the owning project workflow for independently managed surfaces instead of changing their translation or fallback contract incidentally.
   - Use current code, directories, and tests as the source of truth. Treat hard-coded language or namespace counts in prose as potentially stale.
   - Decide the canonical BCP 47 application tag, accepted browser or stored aliases, language-family and regional fallback behavior, Chrome underscore locale identifiers, documentation fallback, and available Day.js, date-fns, and natural-date parser support.
   - Ask only about unresolved choices that materially affect stored preferences, regional resource sharing, manifest coverage, documentation scope, or new dependencies. Reuse user decisions and established locale conventions; continue independent work while a decision is pending.

2. Check existing focused coverage and characterize uncovered behavior before implementation. The following are coverage targets, not a requirement to edit every test file.
   - Cover alias normalization and startup language resolution in `tests/utils/i18nLanguage.test.ts`.
   - Cover selection, accessible names, and persisted preference behavior in `tests/components/LanguageSwitcher.test.tsx`.
   - Cover resource discovery and Day.js mapping in `tests/utils/i18nResources.test.ts`.
   - Cover documentation routing or English fallback in `tests/utils/docsLocale.test.ts`.
   - Cover date-fns display localization when the picker has a matching locale. Evaluate target-language natural input by default; when the current mature parser dependency supports it, add representative valid and invalid parsing tests in the same task.
   - Extend `tests/utils/i18nLocaleValidation.test.ts` only for a stable invariant not already covered by its generic supported-language loops, such as required manifest aliases or locale-specific plural constraints.

3. Implement the complete integration surface.
   - Add the canonical runtime constant and derive supported-language types from `SUPPORTED_UI_LANGUAGES`.
   - Normalize the agreed language aliases at the language boundary; keep downstream consumers on the canonical tag.
   - Add the switcher option and its label and accessible name in every existing application locale.
   - Create `src/locales/<app-tag>/` with every current namespace and normalized key family. Preserve interpolation tokens and markup, and implement every cardinal plural category reported by `Intl.PluralRules(<app-tag>)`.
   - Keep `src/utils/i18n/resources.ts` glob-driven unless the resource-loading contract itself must change.
   - Register the Day.js locale in each runtime that initializes i18n: extension pages, background, and content. Map the closest date-fns locale when the date picker supports the language.
   - Wire available locale support in the existing mature natural-date parser when runtime and bundle impact remain low. If support requires another dependency or a new parsing capability, report the limitation and recommend an option; implement it only when that expansion is authorized. Custom parsing is reserved for an authorized, reproduced gap the library cannot cover.
   - Create complete `src/public/_locales/<chrome_locale>/messages.json` resources. Keep application tags hyphenated and Chrome locale identifiers underscored; add regional alias directories only when the browser locale contract requires them.
   - Map documentation links to an actually shipped docs locale. Keep unsupported documentation languages on the established fallback instead of creating translated docs as part of an app-locale task.
   - Give every discovered locale-keyed production surface the intended translation or an explicit suitable fallback. Use its project skill only when that independently owned surface actually needs changes, not merely because it exists.

4. Validate translation and integration integrity.
   - Run the focused normalization, switcher, resource, docs, and locale-validation tests. Add the date-picker suites when date behavior changed.
   - Require passing `i18n:status` and `i18n:extract:ci` evidence for the complete new locale. Reuse these checks from an imminent commit hook; run them manually when no hook will run or earlier feedback is needed, rather than requiring a duplicate pre-handoff run.
   - Inspect the task-scoped locale diff and account for every unexpected deletion, plural rewrite, empty value, source-language copy, or key-shaped translation value.
   - Run `pnpm build` when browser manifest resources or runtime locale imports changed, and verify the built extension contains the expected `_locales` directories.
   - Stage only task-scoped files and let the repository commit and push hooks select and run their owned gates. Do not manually duplicate a matching hook on an unchanged index or file tree.

5. Close the release-readiness decisions.
   - Reuse the existing normalized-language settings telemetry when `SUPPORTED_UI_LANGUAGES` already feeds its privacy allow-list; add no event solely for the presence of another locale.
   - Prefer focused Vitest coverage plus a production build. Add browser E2E only when the unresolved risk depends on real extension language detection, persistence across entrypoints, or packaged manifest behavior.
   - Reuse the shared language constants, normalization boundary, resource glob, and locale validator. Keep language-specific exceptions narrow and tested.
   - Use `feat(i18n): add <language> locale` for a complete new supported language unless the final diff is a correction to existing support.

## Completion criteria

- The language can be selected, persisted, detected through the agreed aliases, and loaded in every extension runtime.
- Every application namespace and manifest key is present, non-empty, structurally valid, and plural-complete.
- Date formatting uses the closest verified locale behavior. Natural-language input uses verified mature parser support when available; any unsupported scope is explicit, and custom fallback covers only reproduced gaps.
- Documentation links resolve to a shipped locale or the explicit fallback.
- Locale-keyed runtime data outside i18next resolves to the intended language or a deliberate fallback.
- Focused tests, i18n status and extraction, and the production build when applicable pass on the final task-scoped diff; hook-owned gates pass when the corresponding commit or push is performed.

## Common omissions

- Adding locale JSON without updating detection, selection, and stored-language normalization.
- Updating Day.js in extension pages but not background or content runtimes.
- Reusing a BCP 47 application tag as a Chrome manifest directory name.
- Trusting structural key equality while plural values are empty, copied keys, or grammatically mismatched.
- Accepting `resolvedLanguage` fallback as proof that a requested regional alias was normalized correctly.
- Creating documentation translations when only application and manifest localization was requested.
- Treating `i18n:extract:ci` as a translation-quality check rather than an extraction-integrity check.
