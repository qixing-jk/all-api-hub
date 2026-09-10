---
name: sponsor-catalog
description: Maintain all-api-hub sponsor catalogs, affiliate content, assets, and coordinated README/docs listings. Use for sponsor changes or audits, not ordinary documentation edits.
---

# Sponsor Catalog

## Core principle

Treat sponsor content as coordinated production configuration. Discover the current surfaces, verify operational claims, and update every still-served catalog schema that can safely represent the campaign.

## Workflow

For an audit or review, use discovery and relevant compatibility guidance to report findings and coverage without editing, staging, or committing. Read public documentation or check ordinary non-affiliate links when needed to establish the findings; affiliate probing follows the campaign-facts rule below. The update and delivery steps apply only to authorized changes.

1. Inspect repository state and current ownership before editing.
   - Run `git status --porcelain` and preserve unrelated work.
   - Search for the sponsor name, domain, or asset to identify affected listings and catalogs. Read matching entries first; inspect runtime owners under `src/features/AccountManagement/sponsors/` and the catalog test when schema or behavior matters.
   - Discover every served `public/sponsor-catalog*.json` when catalog content is in scope; inspect neighboring sponsors when ordering or established presentation matters.
   - Consult recent sponsor commits when current surfaces leave scope or compatibility unclear. Read a relevant rollout only when the needed historical decision is not established by current files or commits.

2. Load compatibility guidance when software or public JSON is in scope.
   - Read [references/catalog-compatibility.md](references/catalog-compatibility.md) before choosing schema coverage, support status, actions, or rank.
   - Prefer current code, public artifacts, tests, and release tags over stale design documents.

3. Separate campaign facts from product integration facts.
   - Preserve user-supplied copy, affiliate URLs, and promotion terms in production surfaces only.
   - Verify any inferred site type, authentication type, API base URL, key-console URL, or direct-support claim against the target deployment, upstream source, or current repository behavior.
   - Keep the affiliate destination separate from operational URLs. Do not derive an API base URL or account origin from a marketing link.
   - Do not probe live affiliate URLs unless the user requests it.

4. Update the complete discovered surface.
   - Treat root READMEs, the Chinese docs source, relevant docs pages, public catalogs, and `resources/partners/` as the starting checklist, then let repository search and history determine the final set.
   - Follow the repository's Documentation policy for source-first editing and the final translation-sync decision; this does not defer required locale data in shipped public catalogs.
   - Inspect the supplied image format, pixel dimensions, aspect ratio, and existing presentation classes or attributes. Rename it to the established slug convention and align displayed dimensions without unnecessary re-encoding or new CSS.
   - Keep prose order, physical JSON order, and runtime rank as separate decisions. Implement each ordering request explicitly.

5. Validate and hand off.
   - For data, copy, and asset-only changes, do not add tests by default. When public catalog data changes, run the existing focused catalog test; prose or image-only changes need only relevant content/link/presentation checks:
     `pnpm vitest tests/features/AccountManagement/sponsors/publicCatalog.test.ts --run`
   - When docs surfaces change and dependencies are available, run `pnpm --dir docs run docs:check-links` and `pnpm --dir docs run docs:build` as risk warrants.
   - Run `git diff --check` and inspect the task-scoped diff. When committing, stage only task files and let the pre-commit hook run `validate:staged` once; reuse valid focused checks instead of duplicating the hook gate.
   - Use `docs(sponsors): ...` for copy, catalog-data, and asset-only changes. Choose `feat` or `fix` only when the final diff changes executable behavior.
   - Report intentionally omitted catalog versions with concrete compatibility reasons when catalog updates are in scope. Explain analytics or browser-E2E decisions only when behavior or an unresolved risk makes them relevant.

## Common mistakes

- Treating a sponsor's absence from an older catalog as proof of incompatibility.
- Copying a V5 item verbatim into a strict older schema.
- Marking a provider supported from marketing compatibility alone.
- Updating Markdown order while forgetting rank-based software order.
- Stopping after README or docs edits without checking shipped public JSON.
- Encoding one sponsor's temporary placement, offer, or copy as a durable rule.
