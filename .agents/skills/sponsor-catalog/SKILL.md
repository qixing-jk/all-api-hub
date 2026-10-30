---
name: sponsor-catalog
description: Maintain all-api-hub sponsor catalogs, affiliate content, assets, and coordinated README/docs listings. Use for sponsor changes or audits, not ordinary documentation edits.
---

# Sponsor Catalog

## Core principle

Treat sponsor content as coordinated production configuration. Discover the current surfaces, verify operational claims, and update every still-served catalog schema that can safely represent the campaign.

## Workflow

For an audit or review, use discovery and relevant compatibility guidance to report findings and coverage without editing, staging, or committing. Read public documentation or check ordinary non-affiliate links when needed to establish the findings; affiliate probing follows the campaign-facts rule below. The update and delivery steps apply only to authorized changes.

For a new sponsor, establish placement and account-integration status before editing production content. Ask the user for any missing placement preference (relative to which sponsor, including in-app order) and whether adding an account already works, with the known site type/authentication method if available. Reuse answers already supplied in the conversation. If adaptation is unknown, continue read-only investigation and resolve the support/action choice using step 3 before publishing it; an unknown status is not evidence of direct support.

1. Inspect repository state and current ownership before editing.
   - Run `git status --porcelain` and preserve unrelated work.
   - Search for the sponsor name, domain, or asset to identify affected listings and catalogs. Read matching entries first; inspect runtime owners under `src/features/AccountManagement/sponsors/` and the catalog test when schema or behavior matters.
   - Discover every served `public/sponsor-catalog*.json` when catalog content is in scope; inspect neighboring sponsors when ordering or established presentation matters.
   - For additions or coordinated sponsor updates, inspect a comparable recent sponsor commit's changed-file list and relevant diff, then reconcile its surfaces with current owners and repository search. Use this to catch secondary listings, locale copies, icon registration, and catalog versions; historical paths and support decisions still need current validation. Reuse history already inspected in the task. Read a relevant rollout only when the needed historical decision remains unclear.

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
   - Include a clickable sponsor destination in the body of each README/docs sponsor introduction, even when its logo already links there. Integrate the link into the sponsor's own wording or existing closing phrase, preserving supplied copy and terms; use an additional registration sentence only when requested. Synchronize this treatment across affected translations. Public JSON keeps URLs in its schema-defined fields.
   - Follow the repository's Documentation policy for source-first editing and the final translation-sync decision; this does not defer required locale data in shipped public catalogs.
   - Inspect the supplied image format, pixel dimensions, aspect ratio, and file size. Choose displayed dimensions by comparison with existing logos of similar proportions: square icons and wide wordmarks need different treatment. Reuse existing size classes/attributes across root READMEs and localized docs, and check both rendered width and height.
   - Ship appropriately sized, compressed assets for documentation and in-app icons rather than copying oversized originals into both locations. Size each variant for its largest actual display and high-density screens, preserve aspect ratio and transparency, and verify clarity at the intended display size. Preserve the user-supplied original outside production assets, follow established slug conventions, and reuse already optimized assets without further lossy encoding.
   - Keep prose order, physical JSON order, and runtime rank as separate decisions. Implement each ordering request explicitly.

5. Validate and hand off.
   - Check the discovered surface list against the final diff, including body links and the agreed placement across locales. Account for each historical surface through its current owner or an explicit scope/retirement reason.
   - For new or changed images, verify shipped pixel dimensions/file sizes separately from rendered dimensions, and review a representative final display. Report the resulting asset sizes and retain applicable visual evidence; CSS resizing alone does not optimize download or bundle size.
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
