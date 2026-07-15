# Bounded Temp Page Title Prefix Design

## Problem

The shield-bypass prompt currently keeps its temporary-page title prefix alive
with both a `MutationObserver` and a one-second interval. A host page can also
enforce its own title with an observer. When the two writers require
incompatible titles, each title mutation triggers the other writer and creates
an unbounded mutation feedback loop. The affected renderer can stop painting,
consume sustained CPU, allocate rapidly, and prevent the background auto-detect
request from completing.

## Goals

- Keep the temporary-context title cue resilient to ordinary page title updates.
- Put a strict upper bound on extension-authored corrective title writes.
- Yield title ownership permanently when a host repeatedly rejects the prefix.
- Preserve the in-page shield-bypass prompt as the durable user explanation.
- Cover a competing host title observer with focused component tests.

## Non-Goals

- Detect or special-case a site, domain, browser, or branding script.
- Prevent host pages from changing their own titles.
- Change temp-context creation, protection guards, or window cleanup.
- Add product analytics for this internal compatibility safeguard.
- Add Playwright coverage for behavior that jsdom can reproduce deterministically.

## Design

### Bound Corrective Writes

`usePrefixedDocumentTitle()` will continue to apply the localized title prefix
when the prompt mounts. The initial write does not consume the correction
budget. The hook may then correct at most two later host-authored title changes
during that mount.

The title observer remains scoped to the existing `<title>` element. When it
observes a title without the prefix, it increments the correction count and
reapplies the prefix. After the second corrective write, it immediately
disconnects. A host observer may then restore its preferred title once more,
but the extension will not respond again. This gives ordinary applications two
opportunities to retain the temporary-context cue while making a feedback loop
finite by construction.

The one-second interval will be removed. A timer would continue competing after
the observer budget was exhausted and would weaken the bounded-write contract.

### Preserve Host Ownership During Cleanup

When the prompt unmounts, the hook will remove its prefix only if the current
title still contains that prefix. If the host has already replaced the title,
cleanup leaves it unchanged. This prevents stale extension state from
overwriting a newer host-owned title.

### Keep the Limit Local and Explicit

The correction limit will be a small module-level constant next to the hook.
It is an internal safety invariant, not a user preference. The behavior applies
to every host page equally and does not inspect URLs, script names, or page
content.

## Tests

Focused Vitest/Testing Library coverage will prove:

- mounting applies the prefix without consuming the correction budget;
- ordinary host title changes are corrected no more than twice;
- a host observer that continually restores its own title cannot cause an
  unbounded mutation loop, and its title wins after the budget is exhausted;
- no interval is left running to rewrite the title later;
- unmount removes a still-present prefix but does not overwrite a title the
  host already owns;
- the shield-bypass prompt remains rendered and interactive.

## Validation

Run the focused shield-bypass prompt test first, then related Vitest coverage.
Stage only the task-scoped component, test, and design files and run
`pnpm run validate:staged`. Because the executable change is isolated to a
content-script React hook and does not alter exports or dependencies,
`validate:push` is not required unless focused or staged validation exposes a
shared-contract issue.
