---
name: openspec-sync-change-docs
description: Rewrite the active OpenSpec change artifacts under `openspec/changes/CHANGE_NAME/` so they match the code currently implemented on the branch relative to `main`. Use when implementation drift appears after `/opsx:apply`, after review-driven tweaks, or whenever the user asks to sync, refresh, catch up, or align OpenSpec change docs with the real code before verify or archive.
---

# OpenSpec Sync Change Docs

## Overview

Treat the current branch implementation as the source of truth and update the active change docs to describe what was actually built.
Keep the edits inside `openspec/changes/<name>/` unless the user explicitly asks for a later sync into `openspec/specs/`.

## Workflow

1. **Select the change**

   If the user names a change, use it.

   Otherwise, discover active changes first:

   ```bash
   openspec list --json
   ```

   Then:
   - If there are no active changes, stop and explain there is no active change to sync
   - If there is exactly one active change, auto-select it
   - If recent workflow context makes one change clearly intended, use that change and say why
   - If multiple active changes remain plausible, prompt the user to choose

   Announce the selected change and the comparison base branch. Default to `main`. If `main` does not exist locally, stop and ask for the correct base branch instead of guessing.

2. **Load the change context**

   Prefer the OpenSpec CLI:

   ```bash
   openspec status --change "<name>" --json
   openspec instructions apply --change "<name>" --json
   ```

   If the CLI is unavailable or errors, fall back to direct filesystem discovery under `openspec/changes/<name>/` and read whichever of these files exist:
   - `proposal.md`
   - `design.md`
   - `tasks.md`
   - delta specs in `openspec/changes/<name>/specs/*/spec.md`

   For each capability touched by the change, read the base-branch main spec from the base branch itself, not from the working tree:

   ```bash
   git show <base>:openspec/specs/<capability>/spec.md
   ```

   If that path does not exist on the base branch, treat the capability as new. The change docs are deltas against the base branch, not standalone full specs.

3. **Measure implementation drift**

   Inspect the branch against the selected base branch before editing docs:

   ```bash
   git diff --name-only <base>...HEAD
   git diff --stat <base>...HEAD
   ```

   Use the full branch diff only as a discovery aid. Then narrow the evidence set to files that clearly implement the selected change based on:
   - capability names from the delta specs
   - tasks and design references
   - imports, symbols, tests, and entrypoints tied to the selected change

   Read the changed code, tests, and configuration files that explain the actual behavior. Prefer implementation evidence over earlier artifact wording.

   Pay special attention to:
   - Behaviors added after the initial `/opsx:apply`
   - Review-driven or user-requested tweaks
   - Renamed or removed capabilities
   - Test cases that describe the real acceptance behavior better than the stale spec text

   If the branch contains unrelated work and you cannot confidently isolate the selected change, stop and ask instead of folding the whole branch into one change's docs.

4. **Rewrite the change artifacts to match the code**

   Update only the active change artifacts unless the user explicitly asks for more:
   - Rewrite `proposal.md` when the change scope, capability list, or impact statement materially shifted
   - Rewrite `design.md` when the implemented architecture, data flow, API shape, or tradeoffs differ from the draft
   - Rewrite `tasks.md` so completed work is checked off, obsolete tasks are removed or reworded, and remaining follow-ups reflect reality
   - Rewrite each delta spec so it describes the actual diff from `main`

   For delta specs:
   - Use `## ADDED Requirements` for behavior that exists on this branch but not in `main`
   - Use `## MODIFIED Requirements` when branch behavior changes an existing requirement from `main`
   - Use `## REMOVED Requirements` when the branch intentionally removes behavior present in `main`
   - Use `## RENAMED Requirements` only for genuine renames

   Keep delta specs minimal and capability-scoped. Do not copy an entire main spec into the change unless the whole requirement actually changed.

5. **Decide whether the change should still be the same change**

   Stop and recommend a new change instead of force-fitting the docs when:
   - The branch now implements a different intent from the original proposal
   - The work spans unrelated capabilities that should be reviewed independently
   - The old change can still be completed or archived on its own without rewriting history

   Small scope adjustments, clarified requirements, and design corrections should stay in the same change.

6. **Validate the rewritten docs**

   Re-read the updated artifacts against both:
   - the changed code on the current branch
   - the relevant base-branch specs read via `git show <base>:openspec/specs/*/spec.md`

   Confirm:
   - the docs describe what is actually implemented
   - the delta specs still read as diffs, not full copies
   - `tasks.md` status matches reality
   - no edits leaked into unrelated change folders or main specs

7. **Report the outcome**

   Summarize:
   - which change was updated
   - which artifact files changed
   - the main implementation differences captured
   - any remaining ambiguity or intentional drift that still needs a human decision

## Guardrails

- Treat code and tests on the current branch as the source of truth for this skill.
- Do not modify `openspec/specs/` unless the user explicitly asks to sync main specs too.
- Do not archive the change as part of this skill.
- Do not rewrite one change to account for unrelated branch work.
- Do not invent unimplemented requirements just to preserve older wording.
- Preserve useful existing text when it is still accurate; prefer targeted rewrites over wholesale churn.
- If the repo does not have a clean or available `main` reference, stop and ask for the correct base branch.

## Do Not Use This Skill When

- The user wants to sync delta specs into `openspec/specs/`; use `openspec-sync-specs` instead.
- The user wants to validate readiness or detect divergence without editing docs; use `openspec-verify-change` instead.
- The user wants to continue implementation work; use `openspec-apply-change` instead.

## Example Triggers

- `change openspec change docs in current branch to align with the implemented code`
- `catch up the current OpenSpec change docs with what we actually built`
- `rewrite this change's proposal, specs, design, and tasks so they match the branch against main`
- `refresh the active openspec change docs before verify`
